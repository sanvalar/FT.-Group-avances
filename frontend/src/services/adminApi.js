import { graphqlApi } from './graphqlApi'

export const adminApi = {
  users: () => graphqlApi.obtenerUsuarios(),

  async changeStatus(id, estado) {
    return graphqlApi.cambiarEstadoUsuario(id, estado)
  },

  async changeRole(id, rol) {
    return graphqlApi.cambiarRolUsuario(id, rol)
  },
}
