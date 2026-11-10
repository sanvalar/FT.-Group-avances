import { OpenAIFacturaExtractor, ESQUEMA_FACTURA_OPENAI } from '../../src/infrastructure/adapters/out/ia/OpenAIFacturaExtractor';
import { IaNoDisponibleError } from '../../src/infrastructure/adapters/out/ia/facturaIaComun';

function respuestaFalsa(status: number, cuerpo: unknown): typeof fetch {
  return jest.fn(async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch;
}
const conContenido = (contenido: unknown) => ({ choices: [{ message: { content: JSON.stringify(contenido), refusal: null } }] });

describe('OpenAIFacturaExtractor', () => {
  const imagen = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

  it('el esquema estricto exige todas las propiedades', () => {
    expect([...ESQUEMA_FACTURA_OPENAI.required].sort()).toEqual(Object.keys(ESQUEMA_FACTURA_OPENAI.properties).sort());
    const item = ESQUEMA_FACTURA_OPENAI.properties.items.items;
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
  });

  it('envía la imagen a gpt-4o-mini y normaliza la respuesta', async () => {
    const fetchFn = respuestaFalsa(200, conContenido({
      esFactura: true, comercio: 'Ara', nit: null, numeroFactura: null, fecha: '2026-10-19', montoTotal: '23.400',
      subtotal: null, impuestos: null, propina: null, moneda: 'cop', categoria: 'alimentacion',
      descripcionSugerida: 'Mercado en Ara', items: [], confianza: 88, observaciones: null,
    }));
    const datos = await new OpenAIFacturaExtractor({ apiKey: 'sk-test', modelo: 'gpt-4o-mini', fetchFn }).extraer(imagen, 'image/jpeg');

    expect(datos).toMatchObject({ comercio: 'Ara', montoTotal: 23400, fecha: '2026-10-19', moneda: 'COP', categoria: 'alimentacion' });
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-test');
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.model).toBe('gpt-4o-mini');
    expect(cuerpo.response_format.json_schema.strict).toBe(true);
    expect(cuerpo.messages[1].content[0].type).toBe('image_url');
    expect(cuerpo.messages[1].content[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('envía los PDF como archivo', async () => {
    const fetchFn = respuestaFalsa(200, conContenido({ esFactura: true }));
    await new OpenAIFacturaExtractor({ apiKey: 'k', modelo: 'm', fetchFn }).extraer(Buffer.from('%PDF-1.7'), 'application/pdf');
    const parte = JSON.parse((fetchFn as jest.Mock).mock.calls[0][1].body).messages[1].content[0];
    expect(parte.type).toBe('file');
    expect(parte.file.file_data).toMatch(/^data:application\/pdf;base64,/);
  });

  it('falla de forma controlada ante error, rechazo o JSON inválido', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const casos = [
      respuestaFalsa(401, {}),
      respuestaFalsa(200, { choices: [{ message: { content: null, refusal: 'No puedo' } }] }),
      respuestaFalsa(200, { choices: [{ message: { content: 'no es json' } }] }),
    ];
    for (const fetchFn of casos) {
      await expect(new OpenAIFacturaExtractor({ apiKey: 'k', modelo: 'm', fetchFn }).extraer(imagen, 'image/jpeg'))
        .rejects.toBeInstanceOf(IaNoDisponibleError);
    }
  });
});
