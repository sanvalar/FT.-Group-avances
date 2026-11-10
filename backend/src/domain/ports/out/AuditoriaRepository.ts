import { RolUsuario } from '../../entities/Usuario';

export interface EventoAuditoria {
  id: number;
  actorId: number | null;
  actorEmail: string;
  actorRol: RolUsuario;
  accion: string;
  motivo: string;
  metodo: string;
  ruta: string;
  estadoHttp: number;
  solicitudId: string | null;
  fecha: Date;
}

export interface FiltrosAuditoria {
  desde?: string;
  hasta?: string;
  rol?: RolUsuario;
  metodo?: string;
  buscar?: string;
  limite: number;
  offset: number;
}

export interface NuevoEventoAuditoria {
  actorId: number | null;
  actorEmail: string;
  actorRol: RolUsuario;
  accion: string;
  motivo: string;
  metodo: string;
  ruta: string;
  estadoHttp: number;
  solicitudId?: string | null;
}

export interface AuditoriaRepository {
  registrar(evento: NuevoEventoAuditoria): Promise<void>;
  listar(filtros: FiltrosAuditoria): Promise<{ eventos: EventoAuditoria[]; total: number }>;
}
