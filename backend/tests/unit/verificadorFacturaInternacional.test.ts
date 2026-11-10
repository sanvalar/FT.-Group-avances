import {
  parseColombianAmount,
  parseInvoiceText,
  splitExpense,
  verificarDatosFactura,
} from '../../src/domain/services/verificadorFacturaInternacional';

describe('verificador internacional de facturas', () => {
  it('interpreta montos colombianos y excluye el NIT del total', () => {
    expect(parseColombianAmount('1.500.000,00')).toBe(1500000);
    const factura = parseInvoiceText(`
      RESTAURANTE COLOMBIA
      NIT: 900.123.456-7
      FACTURA: FAC-9821
      FECHA: 2026-10-20
      CUFE: ${'a'.repeat(96)}
      SUBTOTAL: 45.000
      IVA: 8.550
      PROPINA: 4.500
      VALOR TOTAL: 58.050
    `);
    expect(factura.total).toBe(58050);
    expect(factura.nitFiscal).toBe('9001234567');
    expect(factura.cufe).toHaveLength(96);
    expect(factura.textoHash).toMatch(/^[a-f0-9]{64}$/);
    expect(factura.estadoVisual).toContain('no verificada oficialmente');
  });

  it('requiere confirmacion manual cuando la confianza es baja', () => {
    const factura = parseInvoiceText('Factura ilegible con numeros 123');
    expect(factura.requiereConfirmacionManual).toBe(true);
    expect(factura.confianza).toBeLessThan(0.90);
    expect(factura.estadoVisual).not.toBe('Verificada');
  });

  it('no afirma autenticidad y detecta inconsistencias aritmeticas o duplicados', () => {
    const comprobante = {
      archivoHash: 'a'.repeat(64),
      comercio: 'Comercio',
      nit: '9001234567',
      numeroFactura: 'FE-1',
      cufe: null,
      fecha: '2026-10-20',
      montoTotal: 100000,
      subtotal: 90000,
      impuestos: 8000,
      propina: 0,
    };
    expect(verificarDatosFactura(comprobante).estado).toBe('inconsistente');
    expect(verificarDatosFactura(comprobante).verificacionOficial).toBe(false);
    expect(verificarDatosFactura({ ...comprobante, subtotal: 92000 }, true).estado).toBe('duplicada');
  });

  it('el reparto por productos conserva exactamente el total en centavos', () => {
    const reparto = splitExpense({
      total: 85800,
      participantes: [{ id: 'u1', nombre: 'Ana' }, { id: 'u2', nombre: 'Luis' }],
      metodo: 'por_productos',
      asignacionesPorProducto: [
        { importe: 60000, consumidoresIds: ['u1', 'u2'] },
        { importe: 18000, consumidoresIds: ['u2'] },
      ],
      impuestos: 3000,
      propina: 4800,
    });
    expect(reparto.reduce((suma, persona) => suma + Math.round(persona.monto * 100), 0)).toBe(8580000);
  });
});
