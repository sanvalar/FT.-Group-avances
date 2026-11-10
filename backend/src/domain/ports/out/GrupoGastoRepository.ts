import { ParticipacionCalculada } from '../../services/distribucionGasto';

export interface GrupoResumen {
  id: number;
  nombre: string;
  descripcion: string | null;
  rol: 'administrador' | 'miembro';
  miembrosActivos: number;
  fechaCreacion: Date;
}

export interface CrearGastoDatos {
  descripcion: string;
  montoTotal: number;
  fechaGasto: string;
  categoria: string;
  tipoDivision: 'equitativa' | 'personalizada';
  participaciones: ParticipacionCalculada[];
}

export interface GrupoGastoRepository {
  crearGrupo(usuarioId: number, nombre: string, descripcion?: string): Promise<GrupoResumen>;
  listarGrupos(usuarioId: number): Promise<GrupoResumen[]>;
  listarIntegrantes(usuarioId: number, grupoId: number): Promise<unknown[]>;
  agregarMiembro(actorId: number, grupoId: number, usuarioId: number): Promise<void>;
  quitarMiembro(actorId: number, grupoId: number, usuarioId: number): Promise<void>;
  crearGasto(actorId: number, grupoId: number, datos: CrearGastoDatos): Promise<unknown>;
  listarGastos(usuarioId: number, grupoId: number): Promise<unknown[]>;
  registrarPago(usuarioId: number, gastoId: number): Promise<void>;
  listarBalances(usuarioId: number, grupoId: number): Promise<unknown[]>;
  listarHistorial(usuarioId: number, grupoId: number, limite: number): Promise<unknown[]>;
  obtenerResumen(usuarioId: number): Promise<unknown>;
  listarNotificaciones(usuarioId: number, limite: number): Promise<unknown[]>;
  marcarNotificacionLeida(usuarioId: number, notificacionId: number): Promise<void>;
}