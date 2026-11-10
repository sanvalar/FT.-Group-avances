import { RolUsuario } from '../../entities/Usuario';

/**
 * Puerto de salida del modulo de soporte. El dominio y la capa de
 * aplicacion solo conocen esta interfaz: no saben que detras hay
 * PostgreSQL (ver PostgresSoporteRepository).
 */

export const CATEGORIAS_TICKET = [
  'cuenta',
  'grupos',
  'gastos',
  'divisiones',
  'pagos',
  'balances',
  'analisis',
  'escaneo',
  'otro',
] as const;

export const PRIORIDADES_TICKET = ['baja', 'normal', 'alta'] as const;

export const ESTADOS_TICKET = ['abierto', 'en_revision', 'resuelto', 'cerrado'] as const;

export type CategoriaTicket = (typeof CATEGORIAS_TICKET)[number];
export type PrioridadTicket = (typeof PRIORIDADES_TICKET)[number];
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export interface Ticket {
  id: number;
  numero: string;
  usuarioId: number;
  categoria: CategoriaTicket;
  asunto: string;
  descripcion: string;
  prioridad: PrioridadTicket;
  estado: EstadoTicket;
  atendidoPor: number | null;
  fechaCreacion: Date;
  fechaCierre: Date | null;
}

export interface MensajeTicket {
  id: number;
  autorId: number | null;
  autorRol: RolUsuario;
  contenido: string;
  fecha: Date;
}

export interface TicketDetalle extends Ticket {
  mensajes: MensajeTicket[];
}

export interface NuevoTicket {
  usuarioId: number;
  categoria: CategoriaTicket;
  asunto: string;
  descripcion: string;
  prioridad: PrioridadTicket;
}

export interface NuevoMensajeTicket {
  ticketId: number;
  autorId: number;
  autorRol: RolUsuario;
  contenido: string;
}

export type RolMensajeAsistente = 'usuario' | 'asistente';

export interface MensajeConversacion {
  rol: RolMensajeAsistente;
  contenido: string;
  fecha: Date;
}

export interface Conversacion {
  id: number;
  usuarioId: number;
  ticketId: number | null;
}

export interface SoporteRepository {
  // --- Tickets ---
  crearTicket(nuevo: NuevoTicket): Promise<Ticket>;
  buscarTicketPorNumero(numero: string): Promise<TicketDetalle | null>;
  listarTicketsDeUsuario(usuarioId: number, limite: number): Promise<Ticket[]>;
  listarTickets(filtros: { estado?: EstadoTicket; limite: number; offset: number }): Promise<{
    tickets: Ticket[];
    total: number;
  }>;
  agregarMensajeTicket(mensaje: NuevoMensajeTicket): Promise<MensajeTicket>;
  actualizarEstadoTicket(
    ticketId: number,
    estado: EstadoTicket,
    atendidoPor: number | null,
  ): Promise<Ticket>;

  // --- Memoria del asistente ---
  abrirConversacion(usuarioId: number): Promise<Conversacion>;
  buscarConversacion(id: number, usuarioId: number): Promise<Conversacion | null>;
  guardarMensajeConversacion(
    conversacionId: number,
    rol: RolMensajeAsistente,
    contenido: string,
  ): Promise<void>;
  historialConversacion(conversacionId: number, limite: number): Promise<MensajeConversacion[]>;
  vincularTicket(conversacionId: number, ticketId: number): Promise<void>;
}
