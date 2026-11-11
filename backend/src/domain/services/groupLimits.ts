import { ValidacionError } from '../errors/DomainErrors';

export const MAX_GROUPS_PER_PERSON = 10;
export const MAX_MEMBERS_PER_GROUP = 20;

export function exigirCupoEnGrupos(totalGruposActivos: number): void {
  if (totalGruposActivos >= MAX_GROUPS_PER_PERSON) {
    throw new ValidacionError(
      `Cada persona puede pertenecer como máximo a ${MAX_GROUPS_PER_PERSON} grupos activos.`,
    );
  }
}

export function validarMaximoIntegrantes(totalIntegrantes: number): void {
  if (totalIntegrantes > MAX_MEMBERS_PER_GROUP) {
    throw new ValidacionError(
      `Un grupo puede tener máximo ${MAX_MEMBERS_PER_GROUP} integrantes, incluyéndote.`,
    );
  }
}
