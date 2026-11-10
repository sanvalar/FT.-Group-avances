import { request } from './http'
import { arrayFromResponse } from '../utils/apiResponse'

const http = (path, options = {}) => request(path, { ...options, auth: true })

export const supervisionApi = {
  async users() {
    const data = await http('/administracion/usuarios')
    return arrayFromResponse(data, ['usuarios'], '/administracion/usuarios')
  },

  async userFinance(id, { limite = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ limite: String(limite), offset: String(offset) })
    const data = await http(`/administracion/usuarios/${id}/finanzas?${params}`)
    return data.supervision
  },
}
