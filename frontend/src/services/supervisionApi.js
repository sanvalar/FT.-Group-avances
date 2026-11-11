import { graphqlApi } from './graphqlApi'
import { leerFinanzasDemoLocal } from '../utils/supervision.js'

export const supervisionApi = {
  users: () => graphqlApi.obtenerUsuarios(),

  async userFinance(id, pagination = { limite: 50, offset: 0 }, email) {
    const finance = await graphqlApi.obtenerFinanzasUsuario(id, pagination)
    const hasDatabaseFinance = Number(finance?.resumen?.grupos || 0) > 0
      || Number(finance?.resumen?.gastos || 0) > 0
      || finance?.grupos?.length > 0
      || finance?.gastos?.length > 0
    if (hasDatabaseFinance) return finance
    return leerFinanzasDemoLocal(id, email, pagination) || finance
  },
}
