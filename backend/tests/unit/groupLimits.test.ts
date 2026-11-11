import {
  exigirCupoEnGrupos,
  MAX_GROUPS_PER_PERSON,
  MAX_MEMBERS_PER_GROUP,
  validarMaximoIntegrantes,
} from '../../src/domain/services/groupLimits';

describe('límites de grupos', () => {
  it('permite pertenecer a grupos mientras aún hay cupo', () => {
    expect(() => exigirCupoEnGrupos(MAX_GROUPS_PER_PERSON - 1)).not.toThrow();
  });

  it('rechaza superar el máximo de grupos activos por persona', () => {
    expect(() => exigirCupoEnGrupos(MAX_GROUPS_PER_PERSON)).toThrow(
      `Cada persona puede pertenecer como máximo a ${MAX_GROUPS_PER_PERSON} grupos activos.`,
    );
  });

  it('incluye al administrador en el máximo de integrantes del grupo', () => {
    expect(() => validarMaximoIntegrantes(MAX_MEMBERS_PER_GROUP)).not.toThrow();
    expect(() => validarMaximoIntegrantes(MAX_MEMBERS_PER_GROUP + 1)).toThrow(
      `Un grupo puede tener máximo ${MAX_MEMBERS_PER_GROUP} integrantes, incluyéndote.`,
    );
  });
});
