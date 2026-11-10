import { ValidacionError } from '../../domain/errors/DomainErrors';
import {
  dividirEquitativamente,
  dividirPorParticipaciones,
  dividirPorPorcentaje,
  ParticipacionCalculada,
  ParticipacionProporcional,
  validarDistribucionPersonalizada,
} from '../../domain/services/distribucionGasto';
import { CrearGastoDatos, GrupoGastoRepository, PlantillaDivision } from '../../domain/ports/out/GrupoGastoRepository';
import { ComprobanteFactura } from '../../domain/ports/out/FacturaExtractor';

export interface RegistrarGastoComando {
  descripcion: string;
  montoTotal: number;
  fechaGasto: string;
  categoria: string;
  pagadorId?: number;
  tipoDivision: 'equitativa' | 'personalizada' | 'porcentaje' | 'participaciones';
  origenRegistro?: 'manual' | 'ocr';
  usuarioIds?: number[];
  participaciones?: ParticipacionCalculada[];
  asignaciones?: ParticipacionProporcional[];
  articulos?: Array<{ descripcion: string; cantidad: number; montoTotal: number }>;
  monedaOriginal?: string;
  montoOriginal?: number;
  tasaCambio?: number;
  solicitudId?: string;
  recurrencia?: {
    frecuencia: 'semanal' | 'mensual' | 'anual';
    proximaFecha: string;
  };
  comprobante?: ComprobanteFactura;
}

export class GrupoGastoService {
  constructor(private readonly repository: GrupoGastoRepository) {}

  crearGrupo(
    usuarioId: number,
    nombre: string,
    descripcion?: string,
    integrantes?: string[],
    moneda = 'COP',
    tasaCop = 1,
    instruccionesPago?: string,
  ) {
    return this.repository.crearGrupo(
      usuarioId,
      nombre.trim(),
      descripcion?.trim(),
      integrantes?.map((email) => email.trim().toLowerCase()),
      moneda,
      tasaCop,
      instruccionesPago?.trim(),
    );
  }

  listarGrupos(usuarioId: number) {
    return this.repository.listarGrupos(usuarioId);
  }

  archivarGrupo(actorId: number, grupoId: number) {
    return this.repository.archivarGrupo(actorId, grupoId);
  }

  listarGruposArchivados(usuarioId: number) {
    return this.repository.listarGruposArchivados(usuarioId);
  }

  listarIntegrantes(usuarioId: number, grupoId: number) {
    return this.repository.listarIntegrantes(usuarioId, grupoId);
  }

  agregarMiembro(actorId: number, grupoId: number, usuarioId: number | string) {
    return this.repository.agregarMiembro(actorId, grupoId, usuarioId);
  }

  quitarMiembro(actorId: number, grupoId: number, usuarioId: number) {
    return this.repository.quitarMiembro(actorId, grupoId, usuarioId);
  }

  crearGasto(actorId: number, grupoId: number, comando: RegistrarGastoComando) {
    let participaciones: ParticipacionCalculada[];
    if (comando.tipoDivision === 'equitativa') {
      if (!comando.usuarioIds?.length) {
        throw new ValidacionError('Indica al menos un participante para la división equitativa.');
      }
      participaciones = dividirEquitativamente(comando.montoTotal, comando.usuarioIds);
    } else if (comando.tipoDivision === 'personalizada') {
      if (!comando.participaciones?.length) {
        throw new ValidacionError('Indica los montos asignados a cada participante.');
      }
      participaciones = validarDistribucionPersonalizada(comando.montoTotal, comando.participaciones);
    } else {
      if (!comando.asignaciones?.length) {
        throw new ValidacionError('Indica la proporción asignada a cada participante.');
      }
      participaciones = comando.tipoDivision === 'porcentaje'
        ? dividirPorPorcentaje(comando.montoTotal, comando.asignaciones)
        : dividirPorParticipaciones(comando.montoTotal, comando.asignaciones);
    }
    if (comando.articulos?.length) {
      const articulosCentavos = comando.articulos.reduce(
        (total, articulo) => total + Math.round(articulo.montoTotal * 100),
        0,
      );
      if (articulosCentavos !== Math.round(comando.montoTotal * 100)) {
        throw new ValidacionError('La suma de los artículos debe coincidir con el monto total del gasto.');
      }
    }

    const datos: CrearGastoDatos = {
      descripcion: comando.descripcion.trim(),
      montoTotal: comando.montoTotal,
      fechaGasto: comando.fechaGasto,
      categoria: comando.categoria.trim(),
      pagadorId: comando.pagadorId,
      tipoDivision: comando.tipoDivision,
      origenRegistro: comando.origenRegistro,
      participaciones,
      comprobante: comando.comprobante,
      articulos: comando.articulos,
      monedaOriginal: comando.monedaOriginal,
      montoOriginal: comando.montoOriginal,
      tasaCambio: comando.tasaCambio,
      solicitudId: comando.solicitudId,
      recurrencia: comando.recurrencia,
    };
    return this.repository.crearGasto(actorId, grupoId, datos);
  }

  listarGastos(usuarioId: number, grupoId: number) {
    return this.repository.listarGastos(usuarioId, grupoId);
  }

  listarRecurrencias(usuarioId: number, grupoId: number) {
    return this.repository.listarRecurrencias(usuarioId, grupoId);
  }

  cambiarRecurrencia(actorId: number, grupoId: number, recurrenciaId: number, activa: boolean) {
    return this.repository.cambiarRecurrencia(actorId, grupoId, recurrenciaId, activa);
  }

  listarPlantillas(usuarioId: number, grupoId: number) {
    return this.repository.listarPlantillas(usuarioId, grupoId);
  }

  guardarPlantilla(
    usuarioId: number,
    grupoId: number,
    nombre: string,
    tipoDivision: PlantillaDivision['tipoDivision'],
    asignaciones: PlantillaDivision['asignaciones'],
  ) {
    return this.repository.guardarPlantilla(usuarioId, grupoId, nombre.trim(), tipoDivision, asignaciones);
  }

  eliminarPlantilla(usuarioId: number, grupoId: number, plantillaId: number) {
    return this.repository.eliminarPlantilla(usuarioId, grupoId, plantillaId);
  }

  eliminarGasto(actorId: number, gastoId: number) {
    return this.repository.eliminarGasto(actorId, gastoId);
  }

  registrarPago(usuarioId: number, gastoId: number) {
    return this.repository.registrarPago(usuarioId, gastoId);
  }

  listarLiquidacionesPendientes(usuarioId: number, grupoId: number) {
    return this.repository.listarLiquidacionesPendientes(usuarioId, grupoId);
  }

  reportarLiquidacion(deudorId: number, grupoId: number, acreedorId: number, monto: number, gastoId?: number) {
    return this.repository.reportarLiquidacion(deudorId, grupoId, acreedorId, monto, gastoId);
  }

  confirmarLiquidacion(acreedorId: number, grupoId: number, liquidacionId: number) {
    return this.repository.confirmarLiquidacion(acreedorId, grupoId, liquidacionId);
  }

  listarBalances(usuarioId: number, grupoId: number) {
    return this.repository.listarBalances(usuarioId, grupoId);
  }

  listarHistorial(usuarioId: number, grupoId: number, limite = 50) {
    return this.repository.listarHistorial(usuarioId, grupoId, limite);
  }

  obtenerResumen(usuarioId: number) {
    return this.repository.obtenerResumen(usuarioId);
  }

  listarNotificaciones(usuarioId: number, limite = 50) {
    return this.repository.listarNotificaciones(usuarioId, limite);
  }

  marcarNotificacionLeida(usuarioId: number, notificacionId: number) {
    return this.repository.marcarNotificacionLeida(usuarioId, notificacionId);
  }
}