// Escaneo inteligente de recibos.
// Pipeline: preprocesamiento (escala de grises + contraste) -> OCR (Tesseract.js,
// español) -> extracción de campos (monto, fecha, comercio, categoría).
// Tesseract se carga de forma diferida solo cuando el usuario escanea.

import { today } from '../utils/format'

/** Etapa 1: preprocesamiento en canvas (reduce tamaño, gris y contraste). */
export async function preprocess(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  const contrast = 1.45
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    const v = Math.max(0, Math.min(255, (gray - 128) * contrast + 128))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Etapa 2: OCR. */
export async function recognize(canvas, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa', 1, {
    logger: m => m.status === 'recognizing text' && onProgress?.(m.progress),
  })
  try {
    const { data } = await worker.recognize(canvas)
    return { text: data.text || '', confidence: data.confidence || 0 }
  } finally {
    await worker.terminate()
  }
}

const KEYWORDS = {
  alimentacion: ['mercado', 'supermercado', 'exito', 'éxito', 'd1', 'ara', 'olimpica', 'carulla', 'jumbo', 'restaurante', 'comida', 'panaderia', 'cafe', 'pizza', 'almuerzo'],
  transporte: ['taxi', 'uber', 'didi', 'gasolina', 'combustible', 'terpel', 'primax', 'peaje', 'parqueadero', 'metro', 'avianca', 'latam', 'bus'],
  servicios: ['epm', 'energia', 'acueducto', 'gas', 'internet', 'claro', 'movistar', 'tigo', 'factura de servicio'],
  alojamiento: ['hotel', 'hostal', 'airbnb', 'hospedaje', 'noches'],
  oficina: ['papeleria', 'papelería', 'panamericana', 'oficina', 'impresion', 'resma'],
  entretenimiento: ['cine', 'cinemark', 'procinal', 'bar', 'concierto', 'boleta', 'discoteca'],
  vivienda: ['arriendo', 'arrendamiento', 'administracion', 'ferreteria', 'homecenter'],
}

const parseAmount = s => {
  // "1.234.567", "1,234,567.00", "$ 45.900" -> número entero en pesos
  const t = s.replace(/[^\d.,]/g, '').replace(/[.,]\d{2}$/, '') // descarta centavos
  return Number(t.replace(/[.,]/g, '')) || 0
}

/** Etapa 3: extracción de campos clave a partir del texto. */
export function extractFields(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const lower = text.toLowerCase()

  // Monto: prioriza líneas con TOTAL; si no, el mayor valor encontrado.
  const amountRe = /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\$\s?\d{3,7}/g
  let monto = 0
  const totalLines = lines.filter(l => /total|a pagar|valor/i.test(l) && !/subtotal/i.test(l))
  for (const l of totalLines) for (const m of l.match(amountRe) || []) monto = Math.max(monto, parseAmount(m))
  if (!monto) for (const m of text.match(amountRe) || []) monto = Math.max(monto, parseAmount(m))

  // Fecha: dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd
  let fecha = null
  const iso = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/)
  const lat = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (iso) fecha = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  else if (lat) {
    const y = lat[3].length === 2 ? `20${lat[3]}` : lat[3]
    fecha = `${y}-${lat[2].padStart(2, '0')}-${lat[1].padStart(2, '0')}`
  }
  if (fecha && isNaN(new Date(fecha))) fecha = null

  // Comercio: primera línea con letras que no sea NIT/dirección/teléfono.
  const comercio = lines.find(l => /[a-záéíóúñ]{3,}/i.test(l) && !/nit|tel|dir|calle|cra|carrera|factura|fecha|www/i.test(l))?.replace(/[^\p{L}\d\s&.-]/gu, '').trim().slice(0, 60) || ''

  let categoria = 'otro'
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (words.some(w => lower.includes(w))) { categoria = cat; break }
  }

  return { monto, fecha: fecha || today(), comercio, categoria }
}
