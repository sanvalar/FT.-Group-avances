// Escaneo de facturas con IA (agente Claude en el backend: POST /api/ia/facturas).
// Si la IA no está configurada, no hay sesión real o el servidor falla,
// las funciones lanzan un error y Scan.jsx usa el OCR local (Tesseract).

import { API_URL, refreshSession, tokens } from './http'

const MAX_LADO = 2000 // px: suficiente para leer recibos y liviano para subir
const MAX_PDF_BYTES = 4 * 1024 * 1024 // límite práctico de funciones serverless (Vercel ~4.5 MB)

/** Reduce y recomprime la imagen a JPEG para subirla rápido desde el celular. */
export async function prepararImagen(file) {
  const bitmap = await createImageBitmap(file)
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se pudo preparar la imagen.')
  return blob
}

async function enviar(cuerpo, tipo) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    return await fetch(`${API_URL}/ia/facturas`, {
      method: 'POST',
      headers: { 'Content-Type': tipo, Authorization: `Bearer ${tokens.access}` },
      body: cuerpo,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Envía la factura al agente de IA y devuelve los campos listos para el formulario.
 * Lanza un error si la IA no está disponible.
 */
export async function analizarFacturaConIa(file) {
  if (!tokens.access || tokens.access === 'demo_token_ft') throw new Error('IA no disponible en modo demostración.')

  const esPdf = file.type === 'application/pdf'
  if (esPdf && file.size > MAX_PDF_BYTES) throw new Error('PDF demasiado grande para la IA.')
  const cuerpo = esPdf ? file : await prepararImagen(file)
  const tipo = esPdf ? 'application/pdf' : 'image/jpeg'

  let respuesta = await enviar(cuerpo, tipo)
  if (respuesta.status === 401 && tokens.refresh) {
    await refreshSession()
    respuesta = await enviar(cuerpo, tipo)
  }
  const data = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok || !data.datos) {
    const error = new Error(data.mensaje || 'La IA no pudo analizar la factura.')
    error.status = respuesta.status
    throw error
  }

  const d = data.datos
  return {
    monto: d.montoTotal || 0,
    fecha: d.fecha || undefined,
    comercio: d.comercio || '',
    descripcion: d.descripcionSugerida || d.comercio || '',
    categoria: d.categoria || 'otro',
    confianza: Math.round(d.confianza ?? 0),
    esFactura: d.esFactura !== false,
    nit: d.nit,
    numeroFactura: d.numeroFactura,
    subtotal: d.subtotal,
    impuestos: d.impuestos,
    propina: d.propina,
    moneda: d.moneda || 'COP',
    items: Array.isArray(d.items) ? d.items : [],
    observaciones: d.observaciones,
    motor: 'ia',
  }
}
