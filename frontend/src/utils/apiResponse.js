export function arrayFromResponse(response, fields, endpoint) {
  if (Array.isArray(response)) return response

  for (const field of fields) {
    if (Array.isArray(response?.[field])) return response[field]
  }

  throw new Error(`El servidor devolvió una lista inválida para ${endpoint}.`)
}
