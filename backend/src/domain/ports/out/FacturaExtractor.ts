/**
 * Puerto de salida: extraccion de datos de una factura o recibo a partir
 * de una imagen o PDF. El dominio no sabe que proveedor de IA se usa.
 */

export type TipoArchivoFactura = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface ItemFactura {
  descripcion: string;
  cantidad: number | null;
  valor: number | null;
}

export interface DatosFactura {
  esFactura: boolean;
  comercio: string | null;
  nit: string | null;
  numeroFactura: string | null;
  fecha: string | null; // YYYY-MM-DD
  montoTotal: number | null; // pesos, sin centavos
  subtotal: number | null;
  impuestos: number | null;
  propina: number | null;
  moneda: string;
  categoria: string;
  descripcionSugerida: string | null;
  items: ItemFactura[];
  confianza: number; // 0 - 100
  observaciones: string | null;
}

export interface FacturaExtractor {
  extraer(archivo: Buffer, tipo: TipoArchivoFactura): Promise<DatosFactura>;
}
