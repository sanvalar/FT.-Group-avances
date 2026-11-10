import { z } from 'zod';
import { DomainError } from '../../domain/errors/DomainErrors';
import {
  DefinicionHerramienta,
  LlamadaHerramienta,
} from '../../domain/ports/out/AsistenteIA';
import {
  CATEGORIAS_TICKET,
  PRIORIDADES_TICKET,
  Ticket,
} from '../../domain/ports/out/SoporteRepository';
import { ActorSoporte, SoporteService } from './SoporteService';

/**
 * Herramientas que el modelo de lenguaje puede invocar.
 *
 * REGLA DE SEGURIDAD CENTRAL: ninguna herramienta recibe el identificador
 * del usuario como argumento. El actor se fija al construir el ejecutor, a
 * partir del token de sesion verificado por authMiddleware, y el modelo no
 * puede modificarlo. Asi, aunque alguien escriba "muestrame el ticket del
 * usuario 7" y el modelo lo intente, la consulta sigue acotada a quien
 * esta autenticado.
 */

export interface ResultadoHerramienta {
  /** Texto que vuelve al modelo como resultado de la herramienta. */
  texto: string;
  /** Presente solo cuando la llamada creo un ticket nuevo. */
  ticketCreado?: Ticket;
}

const ETIQUETAS_ESTADO: Record<Ticket['estado'], string> = {
  abierto: 'abierto, pendiente de revision',
  en_revision: 'en revision por el equipo',
  resuelto: 'resuelto',
  cerrado: 'cerrado',
};

const numeroTicketSchema = z
  .string()
  .trim()
  .regex(/^FT-\d{4}-\d{4}$/i, 'El numero de ticket debe tener el formato FT-AAAA-NNNN.');

const crearTicketSchema = z.object({
  categoria: z.enum(CATEGORIAS_TICKET),
  asunto: z.string().trim().min(5).max(150),
  descripcion: z.string().trim().min(10).max(4000),
  prioridad: z.enum(PRIORIDADES_TICKET).default('normal'),
});

const consultarTicketSchema = z.object({ numero: numeroTicketSchema });

const comentarioSchema = z.object({
  numero: numeroTicketSchema,
  comentario: z.string().trim().min(3).max(2000),
});

export const DEFINICIONES_HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    nombre: 'consultar_mis_tickets',
    descripcion:
      'Lista los tickets de soporte del usuario que esta conversando, del mas reciente al mas antiguo. ' +
      'Usala cuando pregunte por el estado de sus casos sin dar un numero.',
    parametros: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    nombre: 'consultar_ticket',
    descripcion:
      'Consulta el detalle y el hilo de mensajes de un ticket concreto por su numero (formato FT-AAAA-NNNN).',
    parametros: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Numero del ticket, por ejemplo FT-2026-0003.' },
      },
      required: ['numero'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'crear_ticket',
    descripcion:
      'Abre un ticket de soporte para que una persona del equipo atienda el caso. ' +
      'Usala solo cuando el manual no resuelve el problema y ya tengas claro que ocurre y donde ocurre. ' +
      'No la uses mas de una vez por el mismo problema.',
    parametros: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          enum: [...CATEGORIAS_TICKET],
          description: 'Area del sistema a la que corresponde el problema.',
        },
        asunto: {
          type: 'string',
          description: 'Resumen del problema en una linea, sin signos de interrogacion.',
        },
        descripcion: {
          type: 'string',
          description:
            'Que ocurre, en que pantalla y que pasos hizo el usuario, en sus propias palabras.',
        },
        prioridad: {
          type: 'string',
          enum: [...PRIORIDADES_TICKET],
          description: 'Impacto del problema: baja, normal o alta.',
        },
      },
      required: ['categoria', 'asunto', 'descripcion'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'agregar_comentario',
    descripcion:
      'Añade informacion a un ticket que ya existe. Usala en vez de crear otro ticket cuando el usuario aporte datos nuevos sobre un caso abierto.',
    parametros: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Numero del ticket, por ejemplo FT-2026-0003.' },
        comentario: { type: 'string', description: 'Informacion que aporta el usuario.' },
      },
      required: ['numero', 'comentario'],
      additionalProperties: false,
    },
  },
];

function describirTicket(ticket: Ticket): string {
  const fecha = ticket.fechaCreacion.toISOString().slice(0, 10);
  return `${ticket.numero} · ${ticket.asunto} · categoria ${ticket.categoria} · prioridad ${ticket.prioridad} · ${ETIQUETAS_ESTADO[ticket.estado]} · abierto el ${fecha}`;
}

export type EjecutorHerramientas = (llamada: LlamadaHerramienta) => Promise<ResultadoHerramienta>;

/**
 * Crea el ejecutor de herramientas para un actor autenticado concreto.
 * Devuelve siempre un texto legible por el modelo: los errores de
 * validacion tambien se le devuelven como resultado para que corrija y
 * reintente, en lugar de romper la conversacion.
 */
export function crearEjecutorHerramientas(
  servicio: SoporteService,
  actor: ActorSoporte,
): EjecutorHerramientas {
  return async function ejecutar(llamada: LlamadaHerramienta): Promise<ResultadoHerramienta> {
    try {
      switch (llamada.nombre) {
        case 'consultar_mis_tickets': {
          const tickets = await servicio.listarMisTickets(actor);
          if (tickets.length === 0) {
            return { texto: 'El usuario no tiene ningun ticket de soporte registrado.' };
          }
          return { texto: tickets.map(describirTicket).join('\n') };
        }

        case 'consultar_ticket': {
          const { numero } = consultarTicketSchema.parse(llamada.argumentos);
          const ticket = await servicio.obtenerTicket(actor, numero);
          const hilo = ticket.mensajes.length
            ? ticket.mensajes
                .map((m) => `  [${m.autorRol}] ${m.contenido}`)
                .join('\n')
            : '  (sin mensajes adicionales)';
          return {
            texto: `${describirTicket(ticket)}\nDescripcion: ${ticket.descripcion}\nMensajes:\n${hilo}`,
          };
        }

        case 'crear_ticket': {
          const datos = crearTicketSchema.parse(llamada.argumentos);
          const ticket = await servicio.crearTicket(actor, datos);
          return {
            texto: `Ticket creado correctamente con el numero ${ticket.numero}, estado ${ticket.estado}, prioridad ${ticket.prioridad}. Comunicale al usuario exactamente este numero.`,
            ticketCreado: ticket,
          };
        }

        case 'agregar_comentario': {
          const { numero, comentario } = comentarioSchema.parse(llamada.argumentos);
          await servicio.comentar(actor, numero, comentario);
          return { texto: `Comentario añadido al ticket ${numero.toUpperCase()}.` };
        }

        default:
          return { texto: `La herramienta "${llamada.nombre}" no existe.` };
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const detalle = error.errors
          .map((e) => `${e.path.join('.') || 'argumento'}: ${e.message}`)
          .join('; ');
        return { texto: `Argumentos invalidos (${detalle}). Corrigelos y vuelve a intentarlo.` };
      }
      // Los errores de dominio (ticket inexistente, acceso denegado, ticket
      // cerrado) se devuelven al modelo como texto para que los explique al
      // usuario con sus propias palabras. Cualquier otro error (fallo de
      // base de datos, por ejemplo) se propaga para que lo gestione el
      // manejador central y quede registrado.
      if (error instanceof DomainError) {
        return { texto: `No se pudo completar la operacion: ${error.message}` };
      }
      throw error;
    }
  };
}
