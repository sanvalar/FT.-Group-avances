import { describe, expect, it } from '@jest/globals';
import { crearGastoSchema } from '../../src/infrastructure/adapters/in/http/validators/grupoValidators';

describe('validación de gastos', () => {
  it('acepta importes válidos que tienen representación binaria decimal imprecisa', () => {
    const resultado = crearGastoSchema.safeParse({
      descripcion: 'Compra',
      montoTotal: 0.29,
      fechaGasto: '2026-10-06',
      categoria: 'Comida',
      tipoDivision: 'equitativa',
      usuarioIds: [1, 2],
    });

    expect(resultado.success).toBe(true);
  });
});