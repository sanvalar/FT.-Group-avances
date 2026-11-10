import { request } from './http'

const http = (path, options = {}) => request(path, { ...options, auth: true })

export const educationApi = {
  dashboard: () => http('/educacion'),
  moderation: () => http('/educacion/moderacion'),
  publishLesson: (leccionId, publicada) => http(`/educacion/moderacion/lecciones/${leccionId}/publicar`, {
    method: 'PATCH', body: { publicada },
  }),
  completeLesson: (leccionId, puntaje) => http('/educacion/progreso', {
    method: 'POST', body: { leccionId, puntaje },
  }),
  saveBudget: presupuesto => http('/educacion/presupuestos', {
    method: 'POST', body: presupuesto,
  }),
  createGoal: meta => http('/educacion/metas', {
    method: 'POST', body: meta,
  }),
  updateGoal: (id, montoActual) => http(`/educacion/metas/${id}`, {
    method: 'PATCH', body: { montoActual },
  }),
}
