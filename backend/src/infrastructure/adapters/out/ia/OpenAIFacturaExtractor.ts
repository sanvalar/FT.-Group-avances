import {
  DatosFactura,
  FacturaExtractor,
  TipoArchivoFactura,
} from '../../../../domain/ports/out/FacturaExtractor';
import {
  CATEGORIAS_FACTURA,
  IaNoDisponibleError,
  INSTRUCCIONES_FACTURA,
  normalizarDatosFactura,
  registrarErrorIa,
} from './facturaIaComun';

/**
 * Esquema JSON en modo estricto (Structured Outputs de OpenAI): todas las
 * propiedades son obligatorias y los datos faltantes se devuelven como null.
 */
const nulo = (tipo: string, description?: string) => ({ type: [tipo, 'null'], ...(description ? { description } : {}) });

export const ESQUEMA_FACTURA_OPENAI = {
  type: 'object',
  additionalProperties: false,
  properties: {
    esFactura: { type: 'boolean' },
    comercio: nulo('string', 'Nombre del comercio o razón social'),
    nit: nulo('string'),
    numeroFactura: nulo('string'),
    fecha: nulo('string', 'YYYY-MM-DD'),
    montoTotal: nulo('number'),
    subtotal: nulo('number'),
    impuestos: nulo('number', 'IVA, impoconsumo u otros impuestos'),
    propina: nulo('number'),
    moneda: { type: 'string', description: 'Código ISO 4217, por defecto COP' },
    categoria: { type: 'string', enum: [...CATEGORIAS_FACTURA] },
    descripcionSugerida: nulo('string'),
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          descripcion: { type: 'string' },
          cantidad: nulo('number'),
          valor: nulo('number'),
        },
        required: ['descripcion', 'cantidad', 'valor'],
      },
    },
    confianza: { type: 'number' },
    observaciones: nulo('string', 'Advertencias breves, p. ej. texto borroso'),
  },
  required: [
    'esFactura', 'comercio', 'nit', 'numeroFactura', 'fecha', 'montoTotal', 'subtotal', 'impuestos',
    'propina', 'moneda', 'categoria', 'descripcionSugerida', 'items', 'confianza', 'observaciones',
  ],
};

export interface OpcionesOpenAIFacturaExtractor {
  apiKey: string;
  modelo: string; // p. ej. gpt-4o-mini
  urlBase?: string; // por defecto https://api.openai.com/v1
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Adaptador de salida: implementa FacturaExtractor con la API de OpenAI
 * (Chat Completions) usando vision para imagenes y entrada de archivo para
 * PDF. La respuesta se fuerza a JSON con esquema estricto y luego se
 * normaliza/valida.
 */
export class OpenAIFacturaExtractor implements FacturaExtractor {
  private readonly urlBase: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opciones: OpcionesOpenAIFacturaExtractor) {
    this.urlBase = (opciones.urlBase ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.timeoutMs = opciones.timeoutMs ?? 45_000;
    this.fetchFn = opciones.fetchFn ?? fetch;
  }

  async extraer(archivo: Buffer, tipo: TipoArchivoFactura): Promise<DatosFactura> {
    const dataUrl = `data:${tipo};base64,${archivo.toString('base64')}`;
    const parteArchivo = tipo === 'application/pdf'
      ? { type: 'file', file: { filename: 'factura.pdf', file_data: dataUrl } }
      : { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } };

    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(`${this.urlBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opciones.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opciones.modelo,
          max_completion_tokens: 2048,
          messages: [
            { role: 'system', content: INSTRUCCIONES_FACTURA },
            {
              role: 'user',
              content: [parteArchivo, { type: 'text', text: 'Extrae los datos de esta factura o recibo.' }],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'factura', strict: true, schema: ESQUEMA_FACTURA_OPENAI },
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new IaNoDisponibleError('No fue posible contactar el servicio de IA.');
    }

    if (!respuesta.ok) {
      registrarErrorIa('openai', respuesta.status);
      throw new IaNoDisponibleError();
    }

    const cuerpo = await respuesta.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
    } | null;
    const mensaje = cuerpo?.choices?.[0]?.message;
    if (!mensaje?.content || mensaje.refusal) {
      throw new IaNoDisponibleError('La IA no devolvió datos estructurados.');
    }

    let datos: unknown;
    try {
      datos = JSON.parse(mensaje.content);
    } catch {
      throw new IaNoDisponibleError('La IA no devolvió datos estructurados.');
    }
    if (typeof datos !== 'object' || datos === null) {
      throw new IaNoDisponibleError('La IA no devolvió datos estructurados.');
    }
    return normalizarDatosFactura(datos as Record<string, unknown>);
  }
}
