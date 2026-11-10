/**
 * FT. GROUP - Verificador Internacional de Facturas & OCR Avanzado
 * Soporte para Facturación Colombiana (CUFE/CUDS, NIT, Formato Numérico con Puntos de Miles)
 */
import crypto from 'crypto';
import { ComprobanteFactura } from '../ports/out/FacturaExtractor';

export type EstadoVerificacionFactura = 'datos_consistentes' | 'inconsistente' | 'pendiente' | 'duplicada';

export interface ResultadoVerificacionFactura {
  estado: EstadoVerificacionFactura;
  fuente: 'validacion_local';
  verificacionOficial: false;
  docHash: string;
  mensajes: string[];
}

export function verificarDatosFactura(
  datos: ComprobanteFactura,
  duplicada = false,
): ResultadoVerificacionFactura {
  const mensajes: string[] = [];
  const nit = datos.nit?.replace(/\D/g, '') ?? '';
  const tieneDatosClave = Boolean(datos.comercio && datos.numeroFactura && datos.fecha && datos.montoTotal !== null);
  let inconsistente = false;

  if (datos.montoTotal === null || datos.montoTotal <= 0) {
    mensajes.push('No se pudo confirmar un monto total mayor que cero.');
    inconsistente = true;
  }
  if (datos.fecha && !fechaISOValida(datos.fecha)) {
    mensajes.push('La fecha extraída no es válida.');
    inconsistente = true;
  }
  if (datos.nit && (nit.length < 9 || nit.length > 10)) {
    mensajes.push('El NIT detectado no tiene el formato habitual colombiano; revísalo.');
    inconsistente = true;
  }
  if (datos.cufe && !/^[a-f0-9]{96}$/i.test(datos.cufe)) {
    mensajes.push('El CUFE/CUDE detectado no tiene el formato esperado; revísalo.');
    inconsistente = true;
  }

  const valoresContables = [datos.subtotal, datos.impuestos, datos.propina];
  if (datos.montoTotal !== null && valoresContables.every((valor) => valor !== null)) {
    const suma = valoresContables.reduce<number>((total, valor) => total + (valor ?? 0), 0);
    if (Math.abs(suma - datos.montoTotal) > 1) {
      mensajes.push('Subtotal, impuestos y propina no coinciden con el total detectado.');
      inconsistente = true;
    }
  }

  if (duplicada) {
    mensajes.push('Ya existe un gasto registrado con este archivo o con el mismo NIT y número de factura.');
  } else if (!inconsistente && !tieneDatosClave) {
    mensajes.push('Faltan datos para evaluar la consistencia; requiere revisión manual.');
  } else if (!inconsistente) {
    mensajes.push('Los campos y montos detectados son consistentes entre sí.');
  }

  mensajes.push('No se consultó la DIAN ni otra fuente oficial; esto no confirma la autenticidad de la factura.');
  return {
    estado: duplicada ? 'duplicada' : inconsistente ? 'inconsistente' : tieneDatosClave ? 'datos_consistentes' : 'pendiente',
    fuente: 'validacion_local',
    verificacionOficial: false,
    docHash: datos.archivoHash,
    mensajes,
  };
}

function fechaISOValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(fechaParseada.getTime()) && fechaParseada.toISOString().slice(0, 10) === fecha;
}

export interface ProductoFactura {
  cantidad: number;
  descripcion: string;
  precioUnitario: number;
  importe: number;
}

export interface ParticipanteReparto {
  id: string | number;
  nombre: string;
}

export interface AsignacionProducto {
  importe: number;
  consumidoresIds?: Array<string | number>;
}

export interface ResultadoReparto {
  usuarioId: string | number;
  nombre: string;
  monto: number;
}

export function parseInvoiceText(rawText: string) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      estadoVisual: 'No soportada',
      confianza: 0,
      mensajesValidacion: ['Texto ilegible o vacío.']
    };
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // 1. Detección NIT o Identificación Fiscal
  const nitMatch = rawText.match(/(?:NIT|RUT|RFC|TAX\s*ID|NIF)[:\s]*([0-9.\-]+)/i);
  const nitExtraido = nitMatch ? nitMatch[1].replace(/[^0-9]/g, '') : null;

  // 2. Detección CUFE / CUDS (Colombia)
  const cufeMatch = rawText.match(/(?:CUFE|CUDE|CUDS)[:\s]*([a-fA-F0-9]{64,96})/i);
  const cufeExtraido = cufeMatch ? cufeMatch[1] : null;

  // 3. Extracción de Número de Factura
  const numFacturaMatch = rawText.match(/(?:FACTURA|N°|NUMERO|INVOICE|FAC)[:\s#]*([A-Z0-9\-]+)/i);
  const numeroFactura = numFacturaMatch ? numFacturaMatch[1] : null;

  // 4. Extracción de Fecha
  const fechaMatch = rawText.match(/\b(\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  const fechaFactura = fechaMatch ? fechaMatch[1] : null;

  // 5. Extracción de Moneda y País
  let moneda = 'COP';
  let pais = 'Colombia';
  if (rawText.includes('USD') || rawText.includes('$USD')) { moneda = 'USD'; pais = 'Estados Unidos'; }
  else if (rawText.includes('EUR') || rawText.includes('€')) { moneda = 'EUR'; pais = 'Unión Europea'; }

  // 6. Extracción del TOTAL (Búsqueda semántica estricta que NO toma el NIT)
  let total: number | null = null;
  let subtotal: number | null = null;
  let impuestos = 0;
  let propina = 0;

  // Expresiones de total
  const candidatosTotal = [];
  const totalRegex = /(?:TOTAL\s*A\s*PAGAR|VALOR\s*TOTAL|^TOTAL)[:\s]*\$?\s*([0-9][0-9.,\s]*)/i;
  for (const linea of lines) {
    if (/SUBTOTAL/i.test(linea)) continue;
    const matchTotal = linea.match(totalRegex);
    if (!matchTotal) continue;
    const valStr = matchTotal[1].trim();
    // Limpieza de formato colombiano: ej 1.500.000,00 o 1,500,000.00
    let valorNormalizado = parseColombianAmount(valStr);
    
    // Evitar tomar el NIT como total
    if (nitExtraido && valStr.includes(nitExtraido)) continue;
    if (valorNormalizado > 0) {
      candidatosTotal.push(valorNormalizado);
    }
  }

  if (candidatosTotal.length > 0) {
    total = candidatosTotal[0]; // Primer match semántico explícito
  }

  // Extracción de Subtotal
  const subtotalMatch = rawText.match(/(?:SUBTOTAL|NETO)[:\s]*\$?([0-9.,\s]+)/i);
  if (subtotalMatch) {
    subtotal = parseColombianAmount(subtotalMatch[1]);
  }

  // Extracción de Impuestos (IVA/ICO)
  const impMatch = rawText.match(/(?:IVA|IMPUESTO|TAX)[:\s]*\$?([0-9.,\s]+)/i);
  if (impMatch) {
    impuestos = parseColombianAmount(impMatch[1]);
  }

  // Extracción de Propina
  const propMatch = rawText.match(/(?:PROPINA|TIP)[:\s]*\$?([0-9.,\s]+)/i);
  if (propMatch) {
    propina = parseColombianAmount(propMatch[1]);
  }

  // 7. Extracción de Ítems / Productos por Línea
  const productos = extractInvoiceItems(lines);

  // Si no había total explícito, sumar subtotal + imp + propina o productos
  if (!total && productos.length > 0) {
    total = productos.reduce((acc, item) => acc + item.importe, 0) + impuestos + propina;
  }
  if (!subtotal && total) {
    subtotal = Math.max(0, total - impuestos - propina);
  }

  // 8. Hash SHA-256 de seguridad para la factura
  const textoHash = crypto.createHash('sha256').update(rawText).digest('hex');
  const comercio = lines.find((line) => /[a-záéíóúñ]{3,}/i.test(line) && !/nit|tel|dir|calle|cra|carrera|factura|fecha|www/i.test(line))
    ?.replace(/[^\p{L}\d\s&.-]/gu, '').trim().slice(0, 120) ?? null;

  // 9. Cálculo de confianza y estado visual
  let confianza = 0.5;
  const mensajesValidacion = [];

  if (!total || total <= 0) {
    mensajesValidacion.push('No se pudo identificar un monto TOTAL válido.');
  } else {
    confianza += 0.35;
  }
  if (!nitExtraido) {
    mensajesValidacion.push('NIT o Identificación fiscal no encontrada.');
  } else {
    confianza += 0.05;
  }
  if (numeroFactura) confianza += 0.05;
  if (fechaFactura) confianza += 0.05;

  let estadoVisual = 'Pendiente';
  if (confianza < 0.90 && confianza >= 0.75) {
    estadoVisual = 'Estructura válida'; // Requiere confirmación manual
  } else if (confianza < 0.75 && (total ?? 0) > 0) {
    estadoVisual = 'Inconsistente';
  } else if (confianza < 0.75) {
    estadoVisual = 'No verificada';
  }

  if (cufeExtraido) {
    mensajesValidacion.push('Se detectó un CUFE/CUDE; su validez no ha sido consultada con una fuente oficial.');
  }
  if (subtotal !== null && total !== null && Math.abs(subtotal + impuestos + propina - total) > 1) {
    estadoVisual = 'Inconsistente';
    mensajesValidacion.push('Subtotal, impuestos y propina no coinciden con el total detectado.');
  } else if (total && nitExtraido && numeroFactura && fechaFactura) {
    estadoVisual = 'Datos consistentes (no verificada oficialmente)';
  }

  return {
    pais,
    moneda,
    comercio,
    numeroFactura,
    nitFiscal: nitExtraido,
    cufe: cufeExtraido,
    fecha: normalizarFechaFactura(fechaFactura),
    subtotal: subtotal || total,
    impuestos,
    propina,
    total: total || 0,
    textoHash,
    confianza: Math.round(confianza * 100) / 100,
    estadoVisual,
    requiereConfirmacionManual: confianza < 0.90,
    productos,
    mensajesValidacion
  };
}

function normalizarFechaFactura(fecha: string | null): string | null {
  if (!fecha) return null;
  const iso = fecha.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  const local = fecha.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  const normalizada = iso ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local ? `${local[3]}-${local[2]}-${local[1]}`
      : null;
  return normalizada && fechaISOValida(normalizada) ? normalizada : null;
}

export function parseColombianAmount(str: string | number | null | undefined): number {
  if (!str) return 0;
  let clean = String(str).replace(/[^0-9.,]/g, '').trim();
  
  // Si contiene puntos como separadores de miles (ej 1.500.000,00 o 1.500.000)
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes('.') && !clean.includes(',')) {
    // Verificar si el punto es de miles (3 dígitos después del punto)
    const parts = clean.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      clean = clean.replace(/\./g, '');
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function extractInvoiceItems(lines: string[]): ProductoFactura[] {
  const items: ProductoFactura[] = [];
  const lineRegex = /^(?:(\d+)[xX\s]+)?([A-Za-z0-9\sñÑáéíóúÁÉÍÓÚ\-]+)[\s$]+([0-9.,]+)$/;

  for (const line of lines) {
    // Ignorar líneas de totales/subtotales/encabezados
    if (/(?:TOTAL|SUBTOTAL|IVA|NIT|FACTURA|FECHA|GRACIAS|DIRECCION)/i.test(line)) continue;
    
    const m = line.match(lineRegex);
    if (m) {
      const cantidad = parseInt(m[1] || '1', 10);
      const descripcion = m[2].trim();
      const importe = parseColombianAmount(m[3]);
      
      if (descripcion.length > 2 && importe > 0) {
        items.push({
          cantidad,
          descripcion,
          precioUnitario: Math.round((importe / cantidad) * 100) / 100,
          importe
        });
      }
    }
  }

  // Ejemplo fallback si no leyó ítems individuales
  if (items.length === 0) {
    items.push({ cantidad: 1, descripcion: 'Consumo General', precioUnitario: 0, importe: 0 });
  }

  return items;
}

export function splitExpense({
  total,
  participantes,
  metodo,
  asignacionesPorProducto = [],
  propina = 0,
  impuestos = 0,
}: {
  total: number;
  participantes: ParticipanteReparto[];
  metodo: string;
  asignacionesPorProducto?: AsignacionProducto[];
  propina?: number;
  impuestos?: number;
}): ResultadoReparto[] {
  if (!participantes || participantes.length === 0) return [];
  
  let resultados: ResultadoReparto[] = [];

  if (metodo === 'iguales') {
    const totalCentavos = Math.round(total * 100);
    const cuotaBase = Math.floor(totalCentavos / participantes.length);
    const sobrante = totalCentavos % participantes.length;
    resultados = participantes.map((p, idx) => {
      const monto = (cuotaBase + (idx < sobrante ? 1 : 0)) / 100;
      return { usuarioId: p.id, nombre: p.nombre, monto };
    });
  } 
  else if (metodo === 'por_productos') {
    // Reparto proporcional por ítems consumidos
    const totalesUsuario: Record<string, number> = {};
    participantes.forEach(p => { totalesUsuario[String(p.id)] = 0; });

    let sumaProductos = 0;
    asignacionesPorProducto.forEach(prod => {
      sumaProductos += prod.importe;
      const consumidores = prod.consumidoresIds || [];
      if (consumidores.length > 0) {
        const porPersona = prod.importe / consumidores.length;
        consumidores.forEach(uId => {
          const clave = String(uId);
          if (totalesUsuario[clave] !== undefined) {
            totalesUsuario[clave] += porPersona;
          }
        });
      }
    });

    // Distribuir impuestos y propinas de manera proporcional al consumo de cada uno
    const baseConsumo = Object.values(totalesUsuario).reduce((a: number, b: number) => a + b, 0) || 1;
    const extrasTotal = propina + impuestos;
    let totalCalculadoCentavos = 0;
    resultados = participantes.map((p, idx) => {
      const consumoPropio = totalesUsuario[String(p.id)] || 0;
      const proporcion = consumoPropio / baseConsumo;
      const extraPropio = extrasTotal * proporcion;
      let montoCentavos = Math.round((consumoPropio + extraPropio) * 100);

      if (idx === participantes.length - 1) {
        montoCentavos = Math.round(total * 100) - totalCalculadoCentavos;
      } else {
        totalCalculadoCentavos += montoCentavos;
      }

      return { usuarioId: p.id, nombre: p.nombre, monto: montoCentavos / 100 };
    });
  }

  return resultados;
}
