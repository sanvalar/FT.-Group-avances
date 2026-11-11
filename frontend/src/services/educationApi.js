import { request } from './http'

const http = (path, options = {}) => request(path, { ...options, auth: true })

export const educationApi = {
  dashboard: () => http('/educacion'),
  moderation: () => http('/educacion/moderacion'),
  publishLesson: (leccionId, publicada) => http(`/educacion/moderacion/lecciones/${leccionId}/publicar`, {
    method: 'PATCH', body: { publicada },
  }),
  completeLesson: (leccionId, respuesta) => http('/educacion/progreso', {
    method: 'POST', body: { leccionId, respuesta },
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
  addGoalContribution: (id, aporte) => http(`/educacion/metas/${id}/aportes`, {
    method: 'POST', body: { aporte },
  }),
}
