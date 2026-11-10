import { graphqlApi } from './graphqlApi'

export const supervisionApi = {
  users: () => graphqlApi.obtenerUsuarios(),

  userFinance: (id, pagination) => graphqlApi.obtenerFinanzasUsuario(id, pagination),
}
