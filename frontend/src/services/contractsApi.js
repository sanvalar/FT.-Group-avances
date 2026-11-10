import { http } from './http'

export const contractsApi = {
  create: payload => http('/contratos', { method: 'POST', body: JSON.stringify(payload) }),
  get: id => http(`/contratos/${id}`),
  sign: (id, acepta = true) => http(`/contratos/${id}/firmar`, {
    method: 'POST',
    body: JSON.stringify({ acepta }),
  }),
}
