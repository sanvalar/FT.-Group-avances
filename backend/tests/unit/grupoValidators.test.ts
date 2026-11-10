import { describe, expect, it } from '@jest/globals';
import {
  crearGastoSchema,
  crearGrupoSchema,
  liquidacionSchema,
  miembroSchema,
} from '../../src/infrastructure/adapters/in/http/validators/grupoValidators';

describe('validación de gastos', () => {
  it('acepta importes válidos que tienen representación binaria decimal imprecisa', () => {
    const resultado = crearGastoSchema.safeParse({
      descripcion: 'Compra',
      montoTotal: 0.29,
      fechaGasto: '2026-10-06',
      categoria: 'Comida',
      tipoDivision: 'equitativa',
      usuarioIds: [1, 2],
      origenRegistro: 'ocr',
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.origenRegistro).toBe('ocr');
  });

  it('valida invitaciones por correo al crear un grupo y al agregar integrantes', () => {
    expect(crearGrupoSchema.safeParse({
      nombre: 'Viaje',
      integrantes: ['ana@example.com'],
    }).success).toBe(true);
    expect(miembroSchema.safeParse({ email: 'ana@example.com' }).success).toBe(true);
    expect(miembroSchema.safeParse({ usuarioId: 7 }).success).toBe(true);
    expect(miembroSchema.safeParse({ usuarioId: 7, email: 'ana@example.com' }).success).toBe(false);
  });

  it('valida importes positivos con máximo dos decimales para liquidar deudas', () => {
    expect(liquidacionSchema.safeParse({ acreedorId: 7, monto: 0.29 }).success).toBe(true);
    expect(liquidacionSchema.safeParse({ acreedorId: 7, monto: 0 }).success).toBe(false);
    expect(liquidacionSchema.safeParse({ acreedorId: 7, monto: 0.291 }).success).toBe(false);
  });
});