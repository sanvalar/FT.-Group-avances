import { ComprobanteFactura } from './FacturaExtractor';
import { ParticipacionCalculada } from '../../services/distribucionGasto';

export interface GrupoResumen {
  id: number;
  nombre: string;
  descripcion: string | null;
  rol: 'administrador' | 'miembro';
  miembrosActivos: number;
  fechaCreacion: Date;
  moneda?: string;
  tasaCop?: number;
  instruccionesPago?: string | null;
}

export interface CrearGastoDatos {
  descripcion: string;
  montoTotal: number;
  fechaGasto: string;
  categoria: string;
  pagadorId?: number;
  tipoDivision: 'equitativa' | 'personalizada' | 'porcentaje' | 'participaciones';
  origenRegistro?: 'manual' | 'ocr';
  participaciones: ParticipacionCalculada[];
  comprobante?: ComprobanteFactura;
  articulos?: Array<{ descripcion: string; cantidad: number; montoTotal: number }>;
  monedaOriginal?: string;
  montoOriginal?: number;
  tasaCambio?: number;
  solicitudId?: string;
  recurrencia?: {
    frecuencia: 'semanal' | 'mensual' | 'anual';
    proximaFecha: string;
  };
}

export interface LiquidacionPendiente {
  id: number;
  grupoId: number;
  gastoId: number | null;
  deudorId: number;
  deudor: string;
  acreedorId: number;
  acreedor: string;
  monto: string;
  fechaReporte: Date;
}

export interface PlantillaDivision {
  id: number;
  grupoId: number;
  nombre: string;
  tipoDivision: 'equitativa' | 'personalizada' | 'porcentaje' | 'participaciones';
  asignaciones: Array<{ usuarioId: number; valor: number }>;
}

export interface GrupoGastoRepository {
  crearGrupo(
    usuarioId: number,
    nombre: string,
    descripcion?: string,
    integrantes?: string[],
    moneda?: string,
    tasaCop?: number,
    instruccionesPago?: string,
  ): Promise<GrupoResumen>;
  listarGrupos(usuarioId: number): Promise<GrupoResumen[]>;
  archivarGrupo(actorId: number, grupoId: number): Promise<void>;
  listarGruposArchivados(usuarioId: number): Promise<unknown[]>;
  listarIntegrantes(usuarioId: number, grupoId: number): Promise<unknown[]>;
  agregarMiembro(actorId: number, grupoId: number, usuarioId: number | string): Promise<void>;
  quitarMiembro(actorId: number, grupoId: number, usuarioId: number): Promise<void>;
  crearGasto(actorId: number, grupoId: number, datos: CrearGastoDatos): Promise<unknown>;
  listarGastos(usuarioId: number, grupoId: number): Promise<unknown[]>;
  listarRecurrencias(usuarioId: number, grupoId: number): Promise<unknown[]>;
  cambiarRecurrencia(actorId: number, grupoId: number, recurrenciaId: number, activa: boolean): Promise<void>;
  listarPlantillas(usuarioId: number, grupoId: number): Promise<PlantillaDivision[]>;
  guardarPlantilla(
    usuarioId: number,
    grupoId: number,
    nombre: string,
    tipoDivision: PlantillaDivision['tipoDivision'],
    asignaciones: PlantillaDivision['asignaciones'],
  ): Promise<PlantillaDivision>;
  eliminarPlantilla(usuarioId: number, grupoId: number, plantillaId: number): Promise<void>;
  eliminarGasto(actorId: number, gastoId: number): Promise<void>;
  registrarPago(usuarioId: number, gastoId: number): Promise<LiquidacionPendiente>;
  listarLiquidacionesPendientes(usuarioId: number, grupoId: number): Promise<LiquidacionPendiente[]>;
  reportarLiquidacion(
    deudorId: number,
    grupoId: number,
    acreedorId: number,
    monto: number,
    gastoId?: number,
  ): Promise<LiquidacionPendiente>;
  confirmarLiquidacion(acreedorId: number, grupoId: number, liquidacionId: number): Promise<void>;
  listarBalances(usuarioId: number, grupoId: number): Promise<unknown[]>;
  listarHistorial(usuarioId: number, grupoId: number, limite: number): Promise<unknown[]>;
  obtenerResumen(usuarioId: number): Promise<unknown>;
  listarNotificaciones(usuarioId: number, limite: number): Promise<unknown[]>;
  marcarNotificacionLeida(usuarioId: number, notificacionId: number): Promise<void>;
}