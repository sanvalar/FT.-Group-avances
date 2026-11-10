import { ValidacionError } from '../errors/DomainErrors';

export interface ParticipacionCalculada {
  usuarioId: number;
  montoAsignado: number;
}

function aCentavos(monto: number): number {
  if (!Number.isFinite(monto) || monto < 0) {
    throw new ValidacionError('Los montos deben ser números positivos o cero.');
  }

  const centavos = Math.round(monto * 100);
  if (Math.abs(monto * 100 - centavos) > 0.000001) {
    throw new ValidacionError('Los montos solo pueden tener hasta dos decimales.');
  }
  return centavos;
}

function validarParticipantes(usuarioIds: number[]): void {
  if (usuarioIds.length === 0) {
    throw new ValidacionError('El gasto debe tener al menos un participante.');
  }
  if (usuarioIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new ValidacionError('Los identificadores de participantes no son válidos.');
  }
  if (new Set(usuarioIds).size !== usuarioIds.length) {
    throw new ValidacionError('No se permiten participantes duplicados.');
  }
}

export function dividirEquitativamente(
  montoTotal: number,
  usuarioIds: number[],
): ParticipacionCalculada[] {
  const totalCentavos = aCentavos(montoTotal);
  validarParticipantes(usuarioIds);
  if (totalCentavos <= 0) {
    throw new ValidacionError('El monto total debe ser mayor que cero.');
  }

  const base = Math.floor(totalCentavos / usuarioIds.length);
  const sobrantes = totalCentavos % usuarioIds.length;

  return usuarioIds.map((usuarioId, indice) => ({
    usuarioId,
    montoAsignado: (base + (indice < sobrantes ? 1 : 0)) / 100,
  }));
}

export function validarDistribucionPersonalizada(
  montoTotal: number,
  participaciones: ParticipacionCalculada[],
): ParticipacionCalculada[] {
  const totalCentavos = aCentavos(montoTotal);
  validarParticipantes(participaciones.map(({ usuarioId }) => usuarioId));
  if (totalCentavos <= 0) {
    throw new ValidacionError('El monto total debe ser mayor que cero.');
  }

  const participacionesEnCentavos = participaciones.map(({ usuarioId, montoAsignado }) => ({
    usuarioId,
    centavos: aCentavos(montoAsignado),
  }));
  const sumaCentavos = participacionesEnCentavos.reduce((suma, item) => suma + item.centavos, 0);
  if (sumaCentavos !== totalCentavos) {
    throw new ValidacionError('La suma de las participaciones debe coincidir con el monto total.');
  }

  return participacionesEnCentavos.map(({ usuarioId, centavos }) => ({
    usuarioId,
    montoAsignado: centavos / 100,
  }));
}