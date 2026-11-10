const { parseInvoiceText, splitExpense, parseColombianAmount } = require('../../src/domain/services/verificadorFacturaInternacional');

describe('Pruebas Automáticas de Facturación, OCR, Confianza y Reparto', () => {
  
  test('Corrección de formato de números colombianos con puntos de miles', () => {
    expect(parseColombianAmount('1.500.000,00')).toBe(1500000);
    expect(parseColombianAmount('250.000')).toBe(250000);
    expect(parseColombianAmount('$45.900,50')).toBe(45900.5);
  });

  test('Extracción de Factura Colombiana con NIT, CUFE y exclusión de NIT como total', () => {
    const rawInvoice = `
      RESTAURANTE EL COLOMBIANO S.A.S
      NIT: 900.123.456-7
      FACTURA: FAC-9821
      FECHA: 12/10/2026
      CUFE: a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef
      1 Hamburger Especial 35.000
      2 Gaseosas 10.000
      SUBTOTAL: 45.000
      IVA: 8.550
      PROPINA: 4.500
      VALOR TOTAL: 58.050
    `;

    const parsed = parseInvoiceText(rawInvoice);
    expect(parsed.total).toBe(58050);
    expect(parsed.total).not.toBe(9001234567);
    expect(parsed.nitFiscal).toBe('9001234567');
    expect(parsed.confianza).toBeGreaterThanOrEqual(0.90);
    expect(parsed.estadoVisual).toBe('Verificada');
    expect(parsed.productos.length).toBeGreaterThan(0);
  });

  test('Garantía de que las partes divididas por productos sumen exactamente el total', () => {
    const participantes = [
      { id: 'u1', nombre: 'Carlos' },
      { id: 'u2', nombre: 'Ana' },
      { id: 'u3', nombre: 'Sanny' }
    ];

    const productos = [
      { descripcion: 'Pizza Grande', importe: 60000, consumidoresIds: ['u1', 'u2'] },
      { descripcion: 'Cerveza Artesanal', importe: 18000, consumidoresIds: ['u3'] }
    ];

    const reparto = splitExpense({
      total: 85800, // 78000 + 7800 propina/impuestos
      participantes,
      metodo: 'por_productos',
      asignacionesPorProducto: productos,
      propina: 4800,
      impuestos: 3000
    });

    const sumaReparto = reparto.reduce((acc, r) => acc + r.monto, 0);
    expect(Math.round(sumaReparto * 100) / 100).toBe(85800);
  });

  test('Bloqueo o advertencia si la confianza es inferior a 0.90', () => {
    const borrosoText = `Factura ilegible con números 123...`;
    const parsed = parseInvoiceText(borrosoText);
    expect(parsed.confianza).toBeLessThan(0.90);
    expect(parsed.requiereConfirmacionManual).toBe(true);
  });
});
