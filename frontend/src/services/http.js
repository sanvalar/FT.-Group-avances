// Cliente HTTP central. Añade el access token, y si el backend responde 401
// intenta renovar la sesión una vez con /auth/refresh antes de fallar.

export const API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:3000/api'

const KEYS = { access: 'ft_access_token', refresh: 'ft_refresh_token' }

export const tokens = {
  get access() { return sessionStorage.getItem(KEYS.access) },
  get refresh() { return sessionStorage.getItem(KEYS.refresh) },
  save({ accessToken, refreshToken }) {
    if (accessToken) sessionStorage.setItem(KEYS.access, accessToken)
    if (refreshToken) sessionStorage.setItem(KEYS.refresh, refreshToken)
  },
  clear() {
    sessionStorage.removeItem(KEYS.access)
    sessionStorage.removeItem(KEYS.refresh)
  },
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

// Las peticiones normales fallan rápido; una llamada al asistente puede
// tardar varios segundos porque detrás hay un modelo de lenguaje, así que
// puede pedir un tiempo de espera mayor con la opción `timeout`.
const TIMEOUT_POR_DEFECTO = 2500

async function rawRequest(path, { method = 'GET', body, auth = false, timeout = TIMEOUT_POR_DEFECTO } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && tokens.access) headers.Authorization = 'Bearer ' + tokens.access

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch {
    throw new ApiError('No fue posible conectar con el servidor. Verifica que el backend esté en ejecución.', 0)
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detalle = (Array.isArray(data.errores) && data.errores[0]?.mensaje) || (Array.isArray(data.detalles) && data.detalles[0]?.mensaje)
    throw new ApiError(
      detalle || data.mensaje || data.message || 'No fue posible completar la solicitud.',
      response.status,
      data.detalles ?? data,
    )
  }
  return data
}

let refreshing = null
async function refreshSession() {
  if (!tokens.refresh) throw new ApiError('Sesión expirada.', 401)
  // Evita varias renovaciones simultáneas.
  refreshing ??= rawRequest('/auth/refresh', { method: 'POST', body: { refreshToken: tokens.refresh } })
    .then(data => { tokens.save(data); return data })
    .finally(() => { refreshing = null })
  return refreshing
}

export async function request(path, options = {}) {
  try {
    return await rawRequest(path, options)
  } catch (err) {
    if (options.auth && err.status === 401) {
      if (tokens.refresh && tokens.refresh !== 'demo_refresh_ft') {
        try {
          await refreshSession()
          return await rawRequest(path, options)
        } catch {
          tokens.clear()
          sessionStorage.removeItem('ft_current_user')
          throw err
        }
      } else {
        tokens.clear()
        sessionStorage.removeItem('ft_current_user')
      }
    }
    throw err
  }
}

export { refreshSession }
