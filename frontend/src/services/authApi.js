// Módulo de usuarios / autenticación — conectado al backend real (/api/auth) con soporte de demo offline.
import { request, tokens, refreshSession } from './http'

const DEMO_USER_KEY = 'ft_current_user'

function getSavedUser() {
  try {
    const raw = sessionStorage.getItem(DEMO_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveLocalUser(user) {
  try {
    sessionStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  } catch {}
}

export const authApi = {
  async login(email, password) {
    const cleanEmail = email.trim().toLowerCase()

    // 1. Limpiar tokens anteriores antes de autenticar
    tokens.clear()
    sessionStorage.removeItem(DEMO_USER_KEY)

    // 2. Intentar autenticación real contra el backend Express / PostgreSQL
    try {
      // Tiempo de espera amplio: el primer login tras un arranque en frío (Vercel)
      // más el hash Argon2 puede tardar varios segundos, y agotarlo activaría
      // por error el modo demostración sin conexión.
      const data = await request('/auth/login', { method: 'POST', body: { email: cleanEmail, password }, timeout: 15000 })
      tokens.save(data)
      saveLocalUser(data.usuario)
      return data.usuario
    } catch (err) {
      // Si el backend responde error 400/401 explícito de credenciales incorrectas, no enmascarar a menos que sea demo
      if (err.status !== 0 && cleanEmail !== 'demo@ftgroup.com') {
        throw err
      }

      // 2. Fallback de demostración offline si el servidor no responde
      const demoUser = {
        id: 1,
        nombre: cleanEmail.includes('supervisor') ? 'Supervisor' : 'Johan Steven Martínez',
        email: cleanEmail,
        telefono: '3001234567',
        rol: cleanEmail.includes('moderador') ? 'moderador' : 'supervisor',
        estado: 'activo',
        fechaRegistro: '2026-08-15T12:00:00.000Z',
      }
      tokens.save({ accessToken: 'demo_token_ft', refreshToken: 'demo_refresh_ft' })
      saveLocalUser(demoUser)
      return demoUser
    }
  },

  async register({ nombre, email, password, telefono }) {
    const cleanEmail = email.trim().toLowerCase()
    const body = { nombre: nombre.trim(), email: cleanEmail, password }
    if (telefono?.trim()) body.telefono = telefono.trim()

    try {
      return await request('/auth/registro', { method: 'POST', body })
    } catch (err) {
      if (err.status === 0) {
        const newUser = {
          id: Date.now(),
          nombre: nombre.trim(),
          email: cleanEmail,
          telefono: telefono?.trim() || null,
          estado: 'activo',
          fechaRegistro: new Date().toISOString(),
        }
        saveLocalUser(newUser)
        return { usuario: newUser }
      }
      throw err
    }
  },

  async me() {
    try {
      const data = await request('/auth/me', { auth: true })
      saveLocalUser(data.usuario)
      return data.usuario
    } catch (err) {
      const local = getSavedUser()
      if (local) return local
      throw err
    }
  },

  /** Restaura la sesión guardada (renovando el token si hace falta). */
  async restore() {
    if (!tokens.access && !tokens.refresh) return null
    const local = getSavedUser()
    if (tokens.access === 'demo_token_ft') {
      const demoUser = local || {
        id: 1,
        nombre: 'Johan Steven Martínez',
        email: 'demo@ftgroup.com',
        telefono: '3001234567',
        estado: 'activo',
        fechaRegistro: '2026-08-15T12:00:00.000Z',
      }
      saveLocalUser(demoUser)
      return demoUser
    }
    try {
      return await this.me()
    } catch {
      try {
        await refreshSession()
        return await this.me()
      } catch {
        tokens.clear()
        sessionStorage.removeItem(DEMO_USER_KEY)
        return null
      }
    }
  },

  async updateProfile(payload) {
    try {
      const data = await request('/auth/me', { method: 'PUT', auth: true, body: payload })
      saveLocalUser(data.usuario)
      return data.usuario
    } catch (err) {
      const local = getSavedUser()
      if (local) {
        const updated = { ...local, ...payload }
        saveLocalUser(updated)
        return updated
      }
      throw err
    }
  },

  async deactivate() {
    try {
      const data = await request('/auth/me', { method: 'DELETE', auth: true })
      sessionStorage.removeItem(DEMO_USER_KEY)
      return data.usuario
    } catch (err) {
      sessionStorage.removeItem(DEMO_USER_KEY)
      return { estado: 'inactivo' }
    }
  },

  async logout() {
    try {
      if (tokens.refresh && tokens.refresh !== 'demo_refresh_ft') {
        await request('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh } })
      }
    } catch {}
    tokens.clear()
    sessionStorage.removeItem(DEMO_USER_KEY)
  },

  hasSession: () => Boolean(tokens.access || tokens.refresh || sessionStorage.getItem(DEMO_USER_KEY)),
}
