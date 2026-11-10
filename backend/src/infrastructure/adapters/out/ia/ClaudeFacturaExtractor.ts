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

export { CATEGORIAS_FACTURA, IaNoDisponibleError, normalizarDatosFactura };

const NOMBRE_HERRAMIENTA = 'registrar_factura';

const INSTRUCCIONES = `${INSTRUCCIONES_FACTURA}\n- Llama SIEMPRE a la herramienta "${NOMBRE_HERRAMIENTA}" con los datos encontrados.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    esFactura: { type: 'boolean' },
    comercio: { type: ['string', 'null'], description: 'Nombre del comercio o razón social' },
    nit: { type: ['string', 'null'] },
    numeroFactura: { type: ['string', 'null'] },
    fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    montoTotal: { type: ['number', 'null'] },
    subtotal: { type: ['number', 'null'] },
    impuestos: { type: ['number', 'null'], description: 'IVA, impoconsumo u otros impuestos' },
    propina: { type: ['number', 'null'] },
    moneda: { type: 'string', description: 'Código ISO 4217, por defecto COP' },
    categoria: { type: 'string', enum: [...CATEGORIAS_FACTURA] },
    descripcionSugerida: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descripcion: { type: 'string' },
          cantidad: { type: ['number', 'null'] },
          valor: { type: ['number', 'null'] },
        },
        required: ['descripcion'],
      },
    },
    confianza: { type: 'number' },
    observaciones: { type: ['string', 'null'], description: 'Advertencias breves, p. ej. texto borroso' },
  },
  required: ['esFactura', 'montoTotal', 'fecha', 'comercio', 'categoria', 'confianza'],
};

export interface OpcionesClaudeFacturaExtractor {
  apiKey: string;
  modelo: string;
  urlBase?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Adaptador de salida: implementa FacturaExtractor con la API de Claude
 * (Anthropic Messages API) usando vision para imagenes y soporte nativo
 * de PDF. La respuesta se fuerza a una llamada de herramienta para
 * obtener JSON estructurado y luego se normaliza/valida.
 */
export class ClaudeFacturaExtractor implements FacturaExtractor {
  private readonly urlBase: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opciones: OpcionesClaudeFacturaExtractor) {
    this.urlBase = (opciones.urlBase ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.timeoutMs = opciones.timeoutMs ?? 45_000;
    this.fetchFn = opciones.fetchFn ?? fetch;
  }

  async extraer(archivo: Buffer, tipo: TipoArchivoFactura): Promise<DatosFactura> {
    const fuente = { type: 'base64', media_type: tipo, data: archivo.toString('base64') };
    const bloqueArchivo = tipo === 'application/pdf'
      ? { type: 'document', source: fuente }
      : { type: 'image', source: fuente };

    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(`${this.urlBase}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opciones.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.opciones.modelo,
          max_tokens: 2048,
          system: INSTRUCCIONES,
          tools: [{ name: NOMBRE_HERRAMIENTA, description: 'Registra los datos extraídos de la factura.', input_schema: ESQUEMA }],
          tool_choice: { type: 'tool', name: NOMBRE_HERRAMIENTA },
          messages: [{
            role: 'user',
            content: [bloqueArchivo, { type: 'text', text: 'Extrae los datos de esta factura o recibo.' }],
          }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new IaNoDisponibleError('No fue posible contactar el servicio de IA.');
    }

    if (!respuesta.ok) {
      registrarErrorIa('anthropic', respuesta.status);
      throw new IaNoDisponibleError();
    }

    const cuerpo = await respuesta.json().catch(() => null) as { content?: Array<{ type: string; name?: string; input?: unknown }> } | null;
    const llamada = cuerpo?.content?.find((bloque) => bloque.type === 'tool_use' && bloque.name === NOMBRE_HERRAMIENTA);
    if (!llamada || typeof llamada.input !== 'object' || llamada.input === null) {
      throw new IaNoDisponibleError('La IA no devolvió datos estructurados.');
    }
    return normalizarDatosFactura(llamada.input as Record<string, unknown>);
  }
}
