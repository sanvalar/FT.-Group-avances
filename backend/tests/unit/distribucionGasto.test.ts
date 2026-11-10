import { describe, expect, it } from '@jest/globals';
import {
  dividirEquitativamente,
  validarDistribucionPersonalizada,
} from '../../src/domain/services/distribucionGasto';
import { ValidacionError } from '../../src/domain/errors/DomainErrors';

describe('distribución de gastos', () => {
  it('reparte los centavos restantes sin alterar el total', () => {
    const resultado = dividirEquitativamente(10, [3, 8, 12]);

    expect(resultado).toEqual([
      { usuarioId: 3, montoAsignado: 3.34 },
      { usuarioId: 8, montoAsignado: 3.33 },
      { usuarioId: 12, montoAsignado: 3.33 },
    ]);
    expect(resultado.reduce((suma, item) => suma + item.montoAsignado, 0)).toBe(10);
  });

  it('rechaza una distribución personalizada que no suma el total', () => {
    expect(() => validarDistribucionPersonalizada(20, [
      { usuarioId: 1, montoAsignado: 8 },
      { usuarioId: 2, montoAsignado: 10 },
    ])).toThrow(ValidacionError);
  });

  it('rechaza ids de participantes duplicados', () => {
    expect(() => dividirEquitativamente(10, [1, 1])).toThrow(ValidacionError);
  });
});