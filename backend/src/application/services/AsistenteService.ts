import { AsistenteNoDisponibleError } from '../../domain/errors/DomainErrors';
import { RolUsuario } from '../../domain/entities/Usuario';
import { AsistenteIA, TurnoModelo } from '../../domain/ports/out/AsistenteIA';
import { SoporteRepository, Ticket } from '../../domain/ports/out/SoporteRepository';
import { ActorSoporte, SoporteService } from './SoporteService';
import {
  DEFINICIONES_HERRAMIENTAS,
  crearEjecutorHerramientas,
} from './herramientasSoporte';

/** Mensajes previos que se envian al modelo como contexto. */
const MENSAJES_DE_HISTORIAL = 12;

/**
 * Vueltas maximas del bucle de razonamiento. Cada vuelta es una llamada al
 * modelo; el limite evita que una conversacion se quede pidiendo
 * herramientas indefinidamente y dispare el coste.
 */
const MAX_VUELTAS = 4;

const RESPUESTA_POR_DEFECTO =
  'No logre resolverlo por aqui. ¿Puedes contarme con un poco mas de detalle que ocurre y en que pantalla?';

/**
 * El chat muestra texto plano, asi que el Markdown se veria literal
 * ("**Panel**"). El prompt ya pide no usarlo, pero los modelos lo escapan
 * igual, asi que se limpian las marcas de enfasis como ultima barrera.
 * Solo se tocan los pares de ** y __: nada mas se altera.
 */
export function limpiarMarcado(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

/**
 * Datos del usuario atendido que el prompt necesita. Se define en la capa
 * de aplicacion: el constructor del prompt vive en infraestructura y
 * depende de este tipo, no al contrario.
 */
export interface ContextoUsuario {
  id: number;
  nombre: string;
  email: string;
  rol: RolUsuario;
}

export interface PeticionAsistente {
  usuario: ContextoUsuario;
  mensaje: string;
  conversacionId?: number;
}

export interface RespuestaAsistente {
  conversacionId: number;
  respuesta: string;
  /** Datos minimos del ticket, si la conversacion genero uno. */
  ticket: { numero: string; estado: Ticket['estado']; prioridad: Ticket['prioridad'] } | null;
}

/**
 * Agente de soporte: orquesta el bucle "modelo -> herramientas -> modelo"
 * y persiste la conversacion.
 *
 * Construir el prompt es responsabilidad del adaptador de infraestructura
 * que se inyecta como `construirPrompt`, de modo que esta clase no depende
 * de ningun proveedor ni de como se carga la base de conocimiento.
 */
export class AsistenteService {
  constructor(
    private readonly ia: AsistenteIA,
    private readonly soporte: SoporteService,
    private readonly repository: SoporteRepository,
    private readonly construirPrompt: (usuario: ContextoUsuario) => string,
  ) {}

  disponible(): boolean {
    return this.ia.disponible();
  }

  async atender(peticion: PeticionAsistente): Promise<RespuestaAsistente> {
    if (!this.ia.disponible()) {
      throw new AsistenteNoDisponibleError();
    }

    const actor: ActorSoporte = { id: peticion.usuario.id, rol: peticion.usuario.rol };
    const conversacion = await this.resolverConversacion(peticion);
    const mensaje = peticion.mensaje.trim();

    const historial = await this.repository.historialConversacion(
      conversacion.id,
      MENSAJES_DE_HISTORIAL,
    );

    const turnos: TurnoModelo[] = historial.map((m) =>
      m.rol === 'usuario'
        ? { tipo: 'usuario', contenido: m.contenido }
        : { tipo: 'asistente', contenido: m.contenido },
    );
    turnos.push({ tipo: 'usuario', contenido: mensaje });

    const ejecutar = crearEjecutorHerramientas(this.soporte, actor);
    const instrucciones = this.construirPrompt(peticion.usuario);

    let texto: string | null = null;
    let ticketCreado: Ticket | null = null;

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
      const resultado = await this.ia.generar({
        instrucciones,
        turnos,
        herramientas: DEFINICIONES_HERRAMIENTAS,
      });

      if (resultado.llamadas.length === 0) {
        texto = resultado.texto;
        break;
      }

      turnos.push({
        tipo: 'asistente',
        contenido: resultado.texto,
        llamadas: resultado.llamadas,
      });

      for (const llamada of resultado.llamadas) {
        const salida = await ejecutar(llamada);
        // Solo se vincula el primer ticket de la conversacion.
        if (salida.ticketCreado && !ticketCreado) {
          ticketCreado = salida.ticketCreado;
          await this.repository.vincularTicket(conversacion.id, salida.ticketCreado.id);
        }
        turnos.push({
          tipo: 'herramienta',
          idLlamada: llamada.id,
          nombre: llamada.nombre,
          resultado: salida.texto,
        });
      }
    }

    const respuesta = limpiarMarcado((texto ?? '').trim()) || RESPUESTA_POR_DEFECTO;

    await this.repository.guardarMensajeConversacion(conversacion.id, 'usuario', mensaje);
    await this.repository.guardarMensajeConversacion(conversacion.id, 'asistente', respuesta);

    return {
      conversacionId: conversacion.id,
      respuesta,
      ticket: ticketCreado
        ? {
            numero: ticketCreado.numero,
            estado: ticketCreado.estado,
            prioridad: ticketCreado.prioridad,
          }
        : null,
    };
  }

  /**
   * Reutiliza la conversacion indicada solo si pertenece al usuario
   * autenticado; en cualquier otro caso abre una nueva. Esto evita que un
   * identificador ajeno o inexistente de acceso a otra memoria.
   */
  private async resolverConversacion(peticion: PeticionAsistente) {
    if (peticion.conversacionId !== undefined) {
      const existente = await this.repository.buscarConversacion(
        peticion.conversacionId,
        peticion.usuario.id,
      );
      if (existente) return existente;
    }
    return this.repository.abrirConversacion(peticion.usuario.id);
  }
}
