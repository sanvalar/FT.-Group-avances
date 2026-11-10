import {
  ClaudeFacturaExtractor,
  IaNoDisponibleError,
  normalizarDatosFactura,
} from '../../src/infrastructure/adapters/out/ia/ClaudeFacturaExtractor';

function respuestaFalsa(status: number, cuerpo: unknown): typeof fetch {
  return jest.fn(async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch;
}

describe('normalizarDatosFactura', () => {
  it('limpia montos, fechas y categorías inválidas', () => {
    const datos = normalizarDatosFactura({
      esFactura: true,
      comercio: '  Almacenes   Éxito  ',
      fecha: '2026-02-30',
      montoTotal: '45.900',
      categoria: 'comida',
      confianza: 140,
      items: [{ descripcion: 'Leche', cantidad: 2, valor: 4500.4 }, { cantidad: 1 }, 'basura'],
    });
    expect(datos.comercio).toBe('Almacenes Éxito');
    expect(datos.fecha).toBeNull();
    expect(datos.montoTotal).toBe(45900);
    expect(datos.categoria).toBe('otro');
    expect(datos.confianza).toBe(100);
    expect(datos.moneda).toBe('COP');
    expect(datos.items).toEqual([{ descripcion: 'Leche', cantidad: 2, valor: 4500 }]);
  });

  it('rechaza montos negativos', () => {
    expect(normalizarDatosFactura({ montoTotal: -10 }).montoTotal).toBeNull();
  });
});

describe('ClaudeFacturaExtractor', () => {
  const imagen = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

  it('envía la imagen y devuelve los datos de la herramienta', async () => {
    const fetchFn = respuestaFalsa(200, {
      content: [{
        type: 'tool_use',
        name: 'registrar_factura',
        input: { esFactura: true, comercio: 'D1', fecha: '2026-10-20', montoTotal: 32150, categoria: 'alimentacion', confianza: 92 },
      }],
    });
    const extractor = new ClaudeFacturaExtractor({ apiKey: 'k', modelo: 'm', fetchFn });

    const datos = await extractor.extraer(imagen, 'image/jpeg');

    expect(datos).toMatchObject({ comercio: 'D1', fecha: '2026-10-20', montoTotal: 32150, categoria: 'alimentacion' });
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.model).toBe('m');
    expect(cuerpo.tool_choice).toEqual({ type: 'tool', name: 'registrar_factura' });
    expect(cuerpo.messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } });
  });

  it('usa un bloque de documento para PDF', async () => {
    const fetchFn = respuestaFalsa(200, { content: [{ type: 'tool_use', name: 'registrar_factura', input: {} }] });
    await new ClaudeFacturaExtractor({ apiKey: 'k', modelo: 'm', fetchFn }).extraer(Buffer.from('%PDF-1.7'), 'application/pdf');
    const cuerpo = JSON.parse((fetchFn as jest.Mock).mock.calls[0][1].body);
    expect(cuerpo.messages[0].content[0].type).toBe('document');
  });

  it('lanza IaNoDisponibleError si la API falla', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const extractor = new ClaudeFacturaExtractor({ apiKey: 'k', modelo: 'm', fetchFn: respuestaFalsa(500, {}) });
    await expect(extractor.extraer(imagen, 'image/jpeg')).rejects.toBeInstanceOf(IaNoDisponibleError);
  });

  it('lanza IaNoDisponibleError si no hay datos estructurados', async () => {
    const extractor = new ClaudeFacturaExtractor({ apiKey: 'k', modelo: 'm', fetchFn: respuestaFalsa(200, { content: [{ type: 'text', text: 'hola' }] }) });
    await expect(extractor.extraer(imagen, 'image/jpeg')).rejects.toBeInstanceOf(IaNoDisponibleError);
  });
});
