import { request } from './http'

const DEMO_EVENTOS = [
  { id: '1', fecha: new Date(Date.now() - 60000).toISOString(), actorEmail: 'supervisor@ftgroup.test', actorRol: 'supervisor', accion: 'GET /api/auditoria/', metodo: 'GET', ruta: '/api/auditoria/', estadoHttp: 200, motivo: 'Consultar registro de auditoría' },
  { id: '2', fecha: new Date(Date.now() - 120000).toISOString(), actorEmail: 'supervisor@ftgroup.test', actorRol: 'supervisor', accion: 'GET /api/estado', metodo: 'GET', ruta: '/api/estado', estadoHttp: 200, motivo: 'Monitorear salud del sistema' },
  { id: '3', fecha: new Date(Date.now() - 300000).toISOString(), actorEmail: 'moderador@ftgroup.test', actorRol: 'moderador', accion: 'GET /api/administracion/usuarios', metodo: 'GET', ruta: '/api/administracion/usuarios', estadoHttp: 200, motivo: 'Listar usuarios para moderación' },
  { id: '4', fecha: new Date(Date.now() - 600000).toISOString(), actorEmail: 'usuario@ftgroup.test', actorRol: 'usuario', accion: 'gasto_crear', metodo: 'POST', ruta: '/api/grupos/1/gastos', estadoHttp: 201, motivo: 'Registrar gasto colaborativo' },
  { id: '5', fecha: new Date(Date.now() - 900000).toISOString(), actorEmail: 'demo@ftgroup.com', actorRol: 'supervisor', accion: 'POST /api/auth/login', metodo: 'POST', ruta: '/api/auth/login', estadoHttp: 200, motivo: 'Inicio de sesión exitoso' },
]

export const auditoriaApi = {
  async list(filters) {
    const params = new URLSearchParams()
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) params.set(key, value)
    })
    try {
      const res = await request(`/auditoria?${params}`, { auth: true })
      if (Array.isArray(res)) {
        return { eventos: res, total: res.length }
      }
      return { eventos: res?.eventos || [], total: res?.total ?? (res?.eventos ? res.eventos.length : 0) }
    } catch (err) {
      if (err.status === 0 || err.status === 404 || err.status === 502) {
        return { eventos: DEMO_EVENTOS, total: DEMO_EVENTOS.length }
      }
      throw err
    }
  },

  async record(accion) {
    try {
      return await request('/auditoria/eventos', {
        method: 'POST',
        auth: true,
        body: { accion },
      })
    } catch {
      return null
    }
  },
}
