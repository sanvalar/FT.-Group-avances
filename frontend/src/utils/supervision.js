import { DEMO_USER_EMAIL } from './demoAccount.js'

export function leerFinanzasDemoLocal(usuarioId, email, { limite = 50, offset = 0 } = {}) {
  if (email?.trim().toLowerCase() !== DEMO_USER_EMAIL) return null

  const raw = localStorage.getItem(`ft_finanzas_${usuarioId}`)
  if (!raw) return null

  let state
  try {
    state = JSON.parse(raw)
  } catch {
    throw new Error('No fue posible leer los datos locales de demostración de esta cuenta.')
  }
  if (state.demo !== true) return null

  const grupos = Array.isArray(state.grupos) ? state.grupos : []
  const miembros = Array.isArray(state.miembros) ? state.miembros : []
  const gastos = Array.isArray(state.gastos) ? state.gastos : []
  const divisiones = Array.isArray(state.divisiones) ? state.divisiones : []
  const usuarios = new Map((Array.isArray(state.usuarios) ? state.usuarios : []).map(usuario => [String(usuario.id), usuario]))
  const id = String(usuarioId)
  const membresias = miembros.filter(miembro => String(miembro.usuario_id) === id)
  const gruposUsuario = grupos
    .filter(grupo => membresias.some(miembro => String(miembro.grupo_id) === String(grupo.id)))
    .map(grupo => {
      const membresia = membresias.find(miembro => String(miembro.grupo_id) === String(grupo.id))
      return {
        id: grupo.id,
        nombre: grupo.nombre,
        estado: grupo.estado,
        rol: membresia.rol,
        fechaUnion: membresia.fecha_union ? new Date(membresia.fecha_union) : null,
        fechaCreacion: grupo.fecha_creacion ? new Date(grupo.fecha_creacion) : null,
        numeroGastos: gastos.filter(gasto => String(gasto.grupo_id) === String(grupo.id)).length,
      }
    })
  const grupoIds = new Set(gruposUsuario.map(grupo => String(grupo.id)))
  const gastosRelacionados = gastos
    .filter(gasto => grupoIds.has(String(gasto.grupo_id)))
    .map(gasto => {
      const division = divisiones.find(parte =>
        String(parte.gasto_id) === String(gasto.id) && String(parte.usuario_id) === id)
      return { gasto, division }
    })
    .filter(({ gasto, division }) => String(gasto.pagador_id) === id || division)
    .sort((a, b) => String(b.gasto.fecha_gasto).localeCompare(String(a.gasto.fecha_gasto)))

  const pagina = gastosRelacionados.slice(offset, offset + limite)
  const montoPagado = gastosRelacionados
    .filter(({ gasto }) => String(gasto.pagador_id) === id)
    .reduce((total, { gasto }) => total + Number(gasto.monto_total || 0), 0)
  const montoAsignado = gastosRelacionados
    .reduce((total, { division }) => total + Number(division?.monto_asignado || 0), 0)
  const montoPendiente = gastosRelacionados
    .filter(({ division }) => division?.estado_pago === 'pendiente')
    .reduce((total, { division }) => total + Number(division.monto_asignado || 0), 0)

  return {
    origenDatos: 'demo_local',
    usuario: { id: Number(usuarioId), nombre: usuarios.get(id)?.nombre, email },
    resumen: {
      grupos: gruposUsuario.length,
      gastos: gastosRelacionados.length,
      montoPagado: String(montoPagado),
      montoAsignado: String(montoAsignado),
      montoPendiente: String(montoPendiente),
    },
    grupos: gruposUsuario,
    gastos: pagina.map(({ gasto, division }) => ({
      id: gasto.id,
      grupoId: gasto.grupo_id,
      grupo: grupos.find(item => String(item.id) === String(gasto.grupo_id))?.nombre || '',
      pagadorId: gasto.pagador_id,
      pagador: usuarios.get(String(gasto.pagador_id))?.nombre || '',
      descripcion: gasto.descripcion,
      montoTotal: String(gasto.monto_total),
      fechaGasto: new Date(`${gasto.fecha_gasto}T00:00:00`),
      categoria: gasto.categoria,
      montoAsignado: division ? String(division.monto_asignado) : null,
      estadoPago: division?.estado_pago || null,
      fechaPago: division?.fecha_pago ? new Date(division.fecha_pago) : null,
    })),
    paginacion: { limite, offset, total: gastosRelacionados.length },
  }
}
