import { describe, expect, it } from '@jest/globals';
import {
  dividirEquitativamente,
  dividirPorParticipaciones,
  dividirPorPorcentaje,
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

  it('distribuye porcentajes y participaciones en centavos sin alterar el total', () => {
    expect(dividirPorPorcentaje(10, [
      { usuarioId: 1, valor: 33.33 },
      { usuarioId: 2, valor: 33.33 },
      { usuarioId: 3, valor: 33.34 },
    ])).toEqual([
      { usuarioId: 1, montoAsignado: 3.33 },
      { usuarioId: 2, montoAsignado: 3.33 },
      { usuarioId: 3, montoAsignado: 3.34 },
    ]);
    expect(dividirPorParticipaciones(10, [
      { usuarioId: 1, valor: 1 },
      { usuarioId: 2, valor: 2 },
    ])).toEqual([
      { usuarioId: 1, montoAsignado: 3.33 },
      { usuarioId: 2, montoAsignado: 6.67 },
    ]);
  });

  it('rechaza porcentajes que no suman 100 y proporciones no positivas', () => {
    expect(() => dividirPorPorcentaje(10, [
      { usuarioId: 1, valor: 50 },
      { usuarioId: 2, valor: 49 },
    ])).toThrow(ValidacionError);
    expect(() => dividirPorParticipaciones(10, [
      { usuarioId: 1, valor: 1 },
      { usuarioId: 2, valor: 0 },
    ])).toThrow(ValidacionError);
  });
});