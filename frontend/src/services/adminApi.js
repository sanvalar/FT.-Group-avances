import { graphqlApi } from './graphqlApi'

const DEMO_USUARIOS = [
  { id: 1, nombre: 'Supervisor de prueba', email: 'supervisor@ftgroup.test', rol: 'supervisor', estado: 'activo', fechaRegistro: '2026-08-01T10:00:00.000Z' },
  { id: 2, nombre: 'Moderador de prueba', email: 'moderador@ftgroup.test', rol: 'moderador', estado: 'activo', fechaRegistro: '2026-08-05T11:00:00.000Z' },
  { id: 3, nombre: 'Johan Steven Martínez', email: 'johan@ftgroup.com', rol: 'supervisor', estado: 'activo', fechaRegistro: '2026-08-15T12:00:00.000Z' },
  { id: 4, nombre: 'María Camila Gómez', email: 'maria@ejemplo.com', rol: 'usuario', estado: 'activo', fechaRegistro: '2026-08-20T14:30:00.000Z' },
  { id: 5, nombre: 'Sanny Restrepo', email: 'sanny@ejemplo.com', rol: 'usuario', estado: 'activo', fechaRegistro: '2026-08-22T09:15:00.000Z' },
]

export const adminApi = {
  async users() {
    try {
      return await graphqlApi.obtenerUsuarios()
    } catch (err) {
      if (err.status === 0 || err.status === 404 || err.status === 502) {
        return DEMO_USUARIOS
      }
      throw err
    }
  },

  async changeStatus(id, estado) {
    return graphqlApi.cambiarEstadoUsuario(id, estado)
  },

  async changeRole(id, rol) {
    return graphqlApi.cambiarRolUsuario(id, rol)
  },
}
