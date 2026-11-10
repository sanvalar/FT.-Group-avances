import {
  AccesoDenegadoError,
  ConflictoEstadoError,
  TicketNoEncontradoError,
} from '../../domain/errors/DomainErrors';
import { RolUsuario } from '../../domain/entities/Usuario';
import {
  CategoriaTicket,
  EstadoTicket,
  MensajeTicket,
  PrioridadTicket,
  SoporteRepository,
  Ticket,
  TicketDetalle,
} from '../../domain/ports/out/SoporteRepository';

export interface ActorSoporte {
  id: number;
  rol: RolUsuario;
}

const LIMITE_TICKETS_USUARIO = 20;

/** Roles que pueden ver y gestionar los tickets de cualquier usuario. */
function esPersonalDeSoporte(rol: RolUsuario): boolean {
  return rol === 'moderador' || rol === 'supervisor';
}

/**
 * Reglas de negocio del modulo de soporte.
 *
 * Toda comprobacion de propiedad vive aqui: un usuario comun solo puede
 * ver y comentar sus propios tickets. El identificador del actor llega
 * siempre desde el token de sesion (ver AsistenteController /
 * SoporteController), nunca desde el cuerpo de la peticion ni desde los
 * argumentos que proponga el modelo de lenguaje.
 */
export class SoporteService {
  constructor(private readonly repository: SoporteRepository) {}

  async crearTicket(
    actor: ActorSoporte,
    datos: {
      categoria: CategoriaTicket;
      asunto: string;
      descripcion: string;
      prioridad: PrioridadTicket;
    },
  ): Promise<Ticket> {
    return this.repository.crearTicket({
      usuarioId: actor.id,
      categoria: datos.categoria,
      asunto: datos.asunto.trim(),
      descripcion: datos.descripcion.trim(),
      prioridad: datos.prioridad,
    });
  }

  listarMisTickets(actor: ActorSoporte): Promise<Ticket[]> {
    return this.repository.listarTicketsDeUsuario(actor.id, LIMITE_TICKETS_USUARIO);
  }

  // `async` para que la falta de permisos llegue como promesa rechazada y
  // no como excepcion sincronica: el controlador la pasa a next() igual
  // que cualquier otro error del servicio.
  async listarTodos(
    actor: ActorSoporte,
    filtros: { estado?: EstadoTicket; limite: number; offset: number },
  ): Promise<{ tickets: Ticket[]; total: number }> {
    if (!esPersonalDeSoporte(actor.rol)) {
      throw new AccesoDenegadoError('Solo el personal de soporte puede listar todos los tickets.');
    }
    return this.repository.listarTickets(filtros);
  }

  /** Devuelve el ticket solo si el actor es su dueño o personal de soporte. */
  async obtenerTicket(actor: ActorSoporte, numero: string): Promise<TicketDetalle> {
    const ticket = await this.repository.buscarTicketPorNumero(numero.trim().toUpperCase());
    if (!ticket) throw new TicketNoEncontradoError(numero);
    if (ticket.usuarioId !== actor.id && !esPersonalDeSoporte(actor.rol)) {
      // Se responde "no encontrado" para no revelar que el ticket existe.
      throw new TicketNoEncontradoError(numero);
    }
    return ticket;
  }

  async comentar(actor: ActorSoporte, numero: string, contenido: string): Promise<MensajeTicket> {
    const ticket = await this.obtenerTicket(actor, numero);
    if (ticket.estado === 'cerrado') {
      throw new ConflictoEstadoError('El ticket esta cerrado y no admite mas mensajes.');
    }
    return this.repository.agregarMensajeTicket({
      ticketId: ticket.id,
      autorId: actor.id,
      autorRol: actor.rol,
      contenido: contenido.trim(),
    });
  }

  async cambiarEstado(
    actor: ActorSoporte,
    numero: string,
    estado: EstadoTicket,
  ): Promise<Ticket> {
    if (!esPersonalDeSoporte(actor.rol)) {
      throw new AccesoDenegadoError('Solo el personal de soporte puede cambiar el estado de un ticket.');
    }
    const ticket = await this.obtenerTicket(actor, numero);
    if (ticket.estado === estado) return ticket;
    return this.repository.actualizarEstadoTicket(ticket.id, estado, actor.id);
  }
}
