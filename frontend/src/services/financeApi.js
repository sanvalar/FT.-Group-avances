// Módulos financieros: grupos, gastos, balances, historial y recibos.
//
// Modo "api" (por defecto): los datos viven en PostgreSQL. El panel y los
// grupos se consultan por GraphQL; las escrituras y operaciones restantes usan REST.
//
// Modo "local" (VITE_FINANCE_MODE=local): demostración sin backend; guarda
// los datos en el navegador con la misma estructura de tablas.

import { request } from './http'
import { splitEqual, pendingDebts, netBalances, pairwise } from '../utils/balances'
import { today } from '../utils/format'
import { arrayFromResponse } from '../utils/apiResponse'
import { usesLocalFinance as shouldUseLocalFinance } from '../utils/demoAccount'
import { assertCanAddGroupMember, assertCanCreateGroup } from '../utils/groupLimits'
import { auditoriaApi } from './auditoriaApi'
import { graphqlApi } from './graphqlApi'

const MODE = import.meta.env.VITE_FINANCE_MODE || 'api'
const delay = (ms = 150) => new Promise(r => setTimeout(r, ms))
const queueKey = userId => `ft_offline_expenses_${userId}`

function readOfflineQueue(user) {
  const raw = localStorage.getItem(queueKey(user.id))
  return raw ? JSON.parse(raw) : []
}

function avanzarRecurrencia(fecha, frecuencia) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const fechaBase = new Date(Date.UTC(anio, mes - 1, dia))
  if (frecuencia === 'semanal') fechaBase.setUTCDate(fechaBase.getUTCDate() + 7)
  else if (frecuencia === 'mensual') fechaBase.setUTCMonth(fechaBase.getUTCMonth() + 1)
  else fechaBase.setUTCFullYear(fechaBase.getUTCFullYear() + 1)
  return fechaBase.toISOString().slice(0, 10)
}

function generarGastosRecurrentes(st, user, grupoId) {
  const hoy = today()
  for (const recurrencia of st.recurrencias || []) {
    if (recurrencia.grupo_id !== grupoId || !recurrencia.activa) continue
    let cantidad = 0
    while (recurrencia.proximaFecha <= hoy && cantidad < 12) {
      const gastoId = uidGen('e-')
      st.gastos.push({
        ...recurrencia.gasto,
        id: gastoId,
        fecha_gasto: recurrencia.proximaFecha,
        fecha_registro: new Date().toISOString(),
      })
      st.divisiones.push(...recurrencia.divisiones.map(parte => ({
        ...parte,
        gasto_id: gastoId,
        estado_pago: parte.usuario_id === recurrencia.gasto.pagador_id ? 'pagado' : 'pendiente',
      })))
      addHistorial(st, String(user.id), grupoId, 'gasto_creado', `Gasto recurrente: ${recurrencia.gasto.descripcion}`, gastoId)
      recurrencia.proximaFecha = avanzarRecurrencia(recurrencia.proximaFecha, recurrencia.frecuencia)
      cantidad += 1
    }
  }
  save(user, st)
}

function writeOfflineQueue(user, queue) {
  localStorage.setItem(queueKey(user.id), JSON.stringify(queue))
  window.dispatchEvent(new CustomEvent('ft-offline-queue-updated'))
}

function addOfflineExpense(user, grupoId, payload, description) {
  const queue = readOfflineQueue(user)
  const existing = queue.find(item => item.solicitudId === payload.solicitudId)
  if (existing) return existing
  const item = {
    id: payload.solicitudId,
    solicitudId: payload.solicitudId,
    grupoId: String(grupoId),
    descripcion: description,
    payload,
    status: 'pending',
    error: '',
    createdAt: new Date().toISOString(),
  }
  writeOfflineQueue(user, [...queue, item])
  return item
}

/* ------------------------------------------------------------------ */
/* Persistencia local                                                  */
/* ------------------------------------------------------------------ */
const storeKey = uid => `ft_finanzas_${uid}`
const uidGen = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function emptyState(user) {
  return {
    usuarios: [{ id: String(user.id), nombre: user.nombre, email: user.email }],
    grupos: [], miembros: [], gastos: [], divisiones: [], historial: [], recibos: [], recurrencias: [],
  }
}

function load(user) {
  try {
    const raw = localStorage.getItem(storeKey(user.id))
    if (raw) {
      const st = JSON.parse(raw)
      // Mantener sincronizado el nombre del usuario autenticado.
      const me = st.usuarios.find(u => u.id === String(user.id))
      if (me) me.nombre = user.nombre
      return st
    }
  } catch { /* datos corruptos: se regeneran */ }
  const st = demoState(user)
  save(user, st)
  return st
}
function save(user, st) {
  try { localStorage.setItem(storeKey(user.id), JSON.stringify(st)) } catch { /* sin almacenamiento */ }
}

function addHistorial(st, me, grupo_id, tipo_movimiento, descripcion, gasto_id = null) {
  st.historial.unshift({ id: uidGen('h'), usuario_id: me, grupo_id, gasto_id, tipo_movimiento, descripcion, fecha: new Date().toISOString() })
}

/* ------------------------------------------------------------------ */
/* Datos de demostración (basados en el prototipo)                     */
/* ------------------------------------------------------------------ */
function demoState(user) {
  const me = String(user.id)
  const st = emptyState(user)
  st.usuarios.push(
    { id: 'u-johan', nombre: 'Johan', email: 'johan@ejemplo.com' },
    { id: 'u-sanny', nombre: 'Sanny', email: 'sanny@ejemplo.com' },
    { id: 'u-maria', nombre: 'María', email: 'maria@ejemplo.com' },
  )
  const now = new Date()
  const ym = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const cur = ym(0), prev = ym(-1)
  const day = Math.min(now.getDate(), 28)
  const d = (m, n) => `${m}-${String(Math.min(n, m === cur ? day : 28)).padStart(2, '0')}`

  const grupos = [
    { id: 'g-apto', nombre: 'Apartamento 402', descripcion: 'Gastos del hogar', icono: 'building', ciudad: 'Medellín', lat: 6.2442, lng: -75.5812, miembros: [me, 'u-johan', 'u-sanny', 'u-maria'] },
    { id: 'g-viaje', nombre: 'Viaje Cartagena', descripcion: 'Vacaciones de mitad de año', icono: 'plane', ciudad: 'Cartagena', lat: 10.391, lng: -75.4794, miembros: [me, 'u-johan', 'u-sanny'] },
    { id: 'g-caja', nombre: 'Caja chica equipo', descripcion: 'Oficina y papelería', icono: 'safe', ciudad: 'Bogotá', lat: 4.711, lng: -74.0721, miembros: [me, 'u-maria'] },
  ]
  for (const g of grupos) {
    const { miembros, ...rest } = g
    st.grupos.push({ ...rest, creado_por: me, fecha_creacion: `${prev}-01`, estado: 'activo' })
    miembros.forEach((u, i) => st.miembros.push({ grupo_id: g.id, usuario_id: u, rol: i === 0 ? 'administrador' : 'miembro', estado: 'activo' }))
  }

  const gastos = [
    ['Arriendo del mes', 'g-apto', 'u-johan', 1200000, d(cur, 1), 'vivienda', ['u-sanny']],
    ['Servicios públicos', 'g-apto', 'u-johan', 280000, d(cur, 3), 'servicios', [me, 'u-sanny', 'u-maria']],
    ['Papelería y suministros', 'g-caja', 'u-maria', 320000, d(cur, 5), 'oficina', []],
    ['Mercado semanal', 'g-apto', 'u-sanny', 360000, d(cur, 7), 'alimentacion', ['u-johan']],
    ['Cena de bienvenida', 'g-apto', me, 240000, d(cur, 10), 'entretenimiento', ['u-sanny']],
    ['Tiquetes de avión', 'g-viaje', me, 1260000, d(prev, 18), 'transporte', ['u-johan']],
    ['Hotel Caribe – 3 noches', 'g-viaje', 'u-johan', 1980000, d(prev, 22), 'alojamiento', [me, 'u-sanny']],
  ]
  gastos.forEach(([descripcion, grupo_id, pagador_id, monto_total, fecha_gasto, categoria, pagados], idx) => {
    const id = `e-${idx + 1}`
    const miembros = st.miembros.filter(m => m.grupo_id === grupo_id).map(m => m.usuario_id)
    st.gastos.push({ id, grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria, tipo_division: 'equitativa', origen_registro: 'manual', fecha_registro: fecha_gasto })
    for (const div of splitEqual(monto_total, miembros)) {
      const pagado = div.usuario_id === pagador_id || pagados.includes(div.usuario_id)
      st.divisiones.push({ gasto_id: id, ...div, estado_pago: pagado ? 'pagado' : 'pendiente', fecha_pago: pagado ? fecha_gasto : null })
    }
  })
  if (recurrencia) st.recurrencias.push({
    id: uidGen('r-'),
    grupo_id,
    frecuencia: recurrencia.frecuencia,
    proximaFecha: recurrencia.proximaFecha,
    activa: true,
    gasto: st.gastos.at(-1),
    divisiones: st.divisiones.filter(parte => parte.gasto_id === id),
  })
  st.demo = true
  return st
}

/* ------------------------------------------------------------------ */
/* Vistas derivadas                                                    */
/* ------------------------------------------------------------------ */
function viewGroups(st, me) {
  const misGrupos = st.grupos.filter(g => g.estado === 'activo' && st.miembros.some(m => m.grupo_id === g.id && m.usuario_id === me && m.estado === 'activo'))
  const debts = pendingDebts(st.gastos, st.divisiones)
  return misGrupos.map(g => {
    const miembros = st.miembros.filter(m => m.grupo_id === g.id && m.estado === 'activo')
      .map(m => ({ ...st.usuarios.find(u => u.id === m.usuario_id), rol: m.rol }))
    const gastos = st.gastos.filter(x => x.grupo_id === g.id)
    const deudasGrupo = debts.filter(x => x.grupo_id === g.id)
    const net = netBalances(deudasGrupo)
    return {
      ...g,
      miembros,
      rol: miembros.find(m => m.id === me)?.rol,
      total_gastos: gastos.reduce((s, x) => s + x.monto_total * Number(g.tasaCop || 1), 0),
      num_gastos: gastos.length,
      mi_balance: Math.round((net[me] || 0) * Number(g.tasaCop || 1) * 100) / 100,
      liquidaciones: pairwise(deudasGrupo),
    }
  })
}

function viewExpenses(st, me) {
  const grupos = new Map(st.grupos.map(g => [g.id, g]))
  const usuarios = new Map(st.usuarios.map(u => [u.id, u]))
  const visibles = new Set(viewGroups(st, me).map(g => g.id))
  return st.gastos
    .filter(g => visibles.has(g.grupo_id))
    .map(g => {
      const divs = st.divisiones.filter(d => d.gasto_id === g.id)
      const mia = divs.find(d => d.usuario_id === me)
      const pendientesOtros = g.pagador_id === me
        ? divs.filter(d => d.usuario_id !== me && d.estado_pago === 'pendiente').reduce((s, d) => s + d.monto_asignado, 0) : 0
      return {
        ...g,
        grupo: grupos.get(g.grupo_id),
        pagador: usuarios.get(g.pagador_id),
        personas: divs.length,
        divisiones: divs.map(d => ({ ...d, usuario: usuarios.get(d.usuario_id) })),
        mi_parte: mia?.monto_asignado || 0,
        mi_estado: !mia ? 'no_participa' : g.pagador_id === me ? 'pagador' : mia.estado_pago,
        me_deben: pendientesOtros,
      }
    })
    .sort((a, b) => b.fecha_gasto.localeCompare(a.fecha_gasto) || String(b.fecha_registro).localeCompare(String(a.fecha_registro)))
}

/* ------------------------------------------------------------------ */
/* Implementación local                                                */
/* ------------------------------------------------------------------ */
const local = {
  async summary(user) {
    await delay()
    const st = load(user), me = String(user.id)
    const grupos = viewGroups(st, me)
    const usuarios = new Map(st.usuarios.map(u => [u.id, u]))
    let teDeben = 0, debes = 0
    const liquidaciones = []
    for (const g of grupos) {
      for (const p of g.liquidaciones) {
        const montoGrupo = p.monto
        const monto = montoGrupo * Number(g.tasaCop || 1)
        if (p.para === me) teDeben += monto
        if (p.de === me) debes += monto
        liquidaciones.push({ ...p, monto: Math.round(monto * 100) / 100, montoGrupo, grupo_id: g.id, grupo: g.nombre, deUsuario: usuarios.get(p.de), paraUsuario: usuarios.get(p.para) })
      }
    }
    liquidaciones.sort((a, b) => (b.de === me || b.para === me) - (a.de === me || a.para === me) || b.monto - a.monto)
    return { grupos, teDeben, debes, balance: teDeben - debes, liquidaciones, demo: !!st.demo }
  },
  async groups(user) { await delay(); return viewGroups(load(user), String(user.id)) },

  async createGroup(user, { nombre, descripcion, icono, ciudad, lat, lng, moneda = 'COP', tasaCop = 1, instruccionesPago, integrantes }) {
    await delay()
    const st = load(user), me = String(user.id)
    const invitados = new Map()
    for (const inv of integrantes) {
      const email = (typeof inv === 'string' ? inv : inv.email)?.trim().toLowerCase()
      let usuario = email ? st.usuarios.find(x => x.email === email) : null
      if (!usuario) {
        usuario = { id: uidGen('u-'), nombre: inv.nombre?.trim() || email.split('@')[0], email: email || null }
        st.usuarios.push(usuario)
      }
      if (String(usuario.id) !== me) invitados.set(String(usuario.id), usuario.id)
    }
    assertCanCreateGroup(st, me, [...invitados.values()])
    const id = uidGen('g-')
    st.grupos.push({ id, nombre: nombre.trim(), descripcion: descripcion?.trim() || null, icono, ciudad, lat, lng, moneda, tasaCop, instruccionesPago, creado_por: me, fecha_creacion: today(), estado: 'activo' })
    st.miembros.push({ grupo_id: id, usuario_id: me, rol: 'administrador', estado: 'activo' })
    for (const usuarioId of invitados.values()) {
      const usuario = st.usuarios.find(x => String(x.id) === String(usuarioId))
      st.miembros.push({ grupo_id: id, usuario_id: usuarioId, rol: 'miembro', estado: 'activo' })
      addHistorial(st, me, id, 'miembro_agregado', `${usuario.nombre} se unió al grupo`)
    }
    save(user, st)
    return viewGroups(st, me).find(g => g.id === id)
  },

  async addMember(user, grupoId, email) {
    await delay()
    const st = load(user), me = String(user.id)
    const e = email.trim().toLowerCase()
    let u = st.usuarios.find(x => x.email === e)
    if (!u) { u = { id: uidGen('u-'), nombre: e.split('@')[0], email: e }; st.usuarios.push(u) }
    if (st.miembros.some(m => m.grupo_id === grupoId && m.usuario_id === u.id)) throw new Error(`${u.nombre} ya pertenece al grupo.`)
    assertCanAddGroupMember(st, u.id, grupoId)
    st.miembros.push({ grupo_id: grupoId, usuario_id: u.id, rol: 'miembro', estado: 'activo' })
    addHistorial(st, me, grupoId, 'miembro_agregado', `${u.nombre} se unió al grupo`)
    save(user, st)
  },
  async listTemplates(user, grupoId) {
    const stored = JSON.parse(localStorage.getItem(`ft_split_templates_${user.id}`) || '{}')
    return stored[grupoId] || []
  },
  async saveTemplate(user, grupoId, template) {
    const stored = JSON.parse(localStorage.getItem(`ft_split_templates_${user.id}`) || '{}')
    const items = (stored[grupoId] || []).filter(item => item.nombre !== template.nombre)
    stored[grupoId] = [...items, template]
    localStorage.setItem(`ft_split_templates_${user.id}`, JSON.stringify(stored))
    return stored[grupoId]
  },
  async deleteTemplate(user, grupoId, nombre) {
    const stored = JSON.parse(localStorage.getItem(`ft_split_templates_${user.id}`) || '{}')
    stored[grupoId] = (stored[grupoId] || []).filter(item => item.nombre !== nombre)
    localStorage.setItem(`ft_split_templates_${user.id}`, JSON.stringify(stored))
    return stored[grupoId]
  },

  async history(user) {
    await delay()
    const st = load(user)
    const grupos = new Map(st.grupos.map(g => [g.id, g]))
    const usuarios = new Map(st.usuarios.map(u => [u.id, u]))
    return st.historial.slice(0, 50).map(h => ({ ...h, usuario: usuarios.get(h.usuario_id), grupo: grupos.get(h.grupo_id) }))
  },

  async archiveGroup(user, grupoId) {
    await delay()
    const st = load(user)
    const g = st.grupos.find(x => x.id === grupoId)
    if (g) g.estado = 'archivado'
    save(user, st)
  },

  async expenses(user) {
    await delay()
    const st = load(user)
    for (const grupo of st.grupos) generarGastosRecurrentes(st, user, grupo.id)
    return viewExpenses(st, String(user.id))
  },
  async listRecurrences(user, grupoId) {
    await delay()
    return (load(user).recurrencias || []).filter(item => item.grupo_id === grupoId)
  },
  async setRecurrenceActive(user, grupoId, id, activa) {
    const st = load(user)
    const item = (st.recurrencias || []).find(entry => entry.id === id && entry.grupo_id === grupoId)
    if (!item) throw new Error('No se encontró la recurrencia.')
    item.activa = activa
    save(user, st)
  },

  async createExpense(user, {
    grupo_id, pagador_id, descripcion, monto_total, monto_original, moneda_original = 'COP',
    tasa_cambio = 1, fecha_gasto, categoria, tipo_division, divisiones, articulos = [],
    origen_registro = 'manual', recibo, recurrencia,
  }) {
    await delay()
    const st = load(user), me = String(user.id)
    const total = Math.round(Number(monto_total) * 100) / 100
    if (!(total > 0)) throw new Error('El monto debe ser mayor que cero.')
    const sumaCentavos = divisiones.reduce((s, d) => s + Math.round((Number(d.monto_asignado) || 0) * 100), 0)
    if (sumaCentavos !== Math.round(total * 100)) throw new Error('La suma de las partes debe ser igual al monto total.')
    const id = uidGen('e-')
    st.gastos.push({
      id, grupo_id, pagador_id, descripcion: descripcion.trim(), monto_total: total,
      monto_original: monto_original ?? monto_total, moneda_original, tasa_cambio,
      articulos, fecha_gasto, categoria, tipo_division, origen_registro,
      fecha_registro: new Date().toISOString(),
    })
    for (const d of divisiones) {
      const monto = Math.round((Number(d.monto_asignado) || 0) * 100) / 100
      if (monto <= 0 && tipo_division === 'personalizada') continue
      const pagado = d.usuario_id === pagador_id
      st.divisiones.push({ gasto_id: id, usuario_id: d.usuario_id, monto_asignado: monto, estado_pago: pagado ? 'pagado' : 'pendiente', fecha_pago: pagado ? fecha_gasto : null })
    }
    if (recibo) st.recibos.push({
      id: uidGen('r-'), gasto_id: id, ...recibo,
      estado_validacion: recibo.verificacion?.estado || 'pendiente',
      verificacion: recibo.verificacion || null,
      fecha_procesamiento: new Date().toISOString(),
    })
    addHistorial(st, me, grupo_id, 'gasto_creado', descripcion, id)
    save(user, st)
    return id
  },

  async deleteExpense(user, gastoId) {
    await delay()
    const st = load(user)
    st.gastos = st.gastos.filter(g => g.id !== gastoId)
    st.divisiones = st.divisiones.filter(d => d.gasto_id !== gastoId)
    save(user, st)
  },

  /** Registrar el pago de una parte (DIVISION_GASTO.estado_pago = pagado). */
  async payShare(user, gastoId, usuarioId = String(user.id)) {
    await delay()
    const st = load(user)
    const d = st.divisiones.find(x => x.gasto_id === gastoId && x.usuario_id === usuarioId)
    if (d) { d.estado_pago = 'pagado'; d.fecha_pago = new Date().toISOString() }
    const g = st.gastos.find(x => x.id === gastoId)
    addHistorial(st, String(user.id), g?.grupo_id, 'pago_registrado', `Pago de ${g?.descripcion}`, gastoId)
    save(user, st)
  },

  /** Salda todas las deudas pendientes entre dos personas dentro de un grupo. */
  async settle(user, { grupo_id, de, para }) {
    await delay()
    const st = load(user)
    const gastos = new Set(st.gastos.filter(g => g.grupo_id === grupo_id && g.pagador_id === para).map(g => g.id))
    const ahora = new Date().toISOString()
    for (const d of st.divisiones) {
      if (gastos.has(d.gasto_id) && d.usuario_id === de && d.estado_pago === 'pendiente') {
        d.estado_pago = 'pagado'; d.fecha_pago = ahora
      }
    }
    // El saldo es neto por pares: también se cierran las deudas en sentido contrario.
    const inversos = new Set(st.gastos.filter(g => g.grupo_id === grupo_id && g.pagador_id === de).map(g => g.id))
    for (const d of st.divisiones) {
      if (inversos.has(d.gasto_id) && d.usuario_id === para && d.estado_pago === 'pendiente') {
        d.estado_pago = 'pagado'; d.fecha_pago = ahora
      }
    }
    addHistorial(st, String(user.id), grupo_id, 'pago_registrado', 'Liquidación registrada')
    save(user, st)
  },

  async resetDemo(user, { empty = false } = {}) {
    const st = empty ? emptyState(user) : demoState(user)
    save(user, st)
  },
}

/* ------------------------------------------------------------------ */
/* Implementación remota: backend + PostgreSQL                         */
/* ------------------------------------------------------------------ */
const remote = {
  // Las respuestas del backend usan los mismos nombres de campos que el modo local.
  summary: () => graphqlApi.obtenerMiPanel(),
  groups: () => graphqlApi.obtenerMisGrupos(),
  createGroup: (_u, body) => request('/grupos', {
    method: 'POST',
    auth: true,
    body: {
      nombre: body.nombre,
      descripcion: body.descripcion,
      integrantes: (body.integrantes || []).map(integrante => typeof integrante === 'string' ? integrante : integrante.email),
      moneda: body.moneda || 'COP',
      tasaCop: Number(body.tasaCop || 1),
      instruccionesPago: body.instruccionesPago,
    },
  }),
  addMember: (_u, id, email) => request(`/grupos/${id}/integrantes`, { method: 'POST', auth: true, body: { email } }),
  async history(user) {
    const grupos = await graphqlApi.obtenerMisGrupos()
    const gruposHistorial = await Promise.all(grupos.map(async grupo => {
      const response = await request(`/grupos/${grupo.id}/historial`, { auth: true })
      const movimientos = arrayFromResponse(response, ['movimientos'], `/grupos/${grupo.id}/historial`)
      return movimientos.map(movimiento => ({
        ...movimiento,
        grupo_id: String(grupo.id),
        tipo_movimiento: movimiento.tipoMovimiento,
        usuario_id: String(movimiento.usuarioId),
        gasto_id: movimiento.gastoId ? String(movimiento.gastoId) : null,
        usuario: { id: String(movimiento.usuarioId), nombre: movimiento.usuario },
        grupo: {
          id: String(grupo.id),
          nombre: grupo.nombre,
          moneda: grupo.moneda || 'COP',
          tasaCop: Number(grupo.tasaCop || 1),
          instruccionesPago: grupo.instruccionesPago,
        },
      }))
    }))
    return gruposHistorial.flat()
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 50)
  },
  archiveGroup: (_u, id) => graphqlApi.archivarGrupo(id),
  async expenses(user) {
    const grupos = await graphqlApi.obtenerMisGrupos()
    const gruposGastos = await Promise.all(grupos.map(async grupo => {
      const [response, responseLiquidaciones] = await Promise.all([
        request(`/grupos/${grupo.id}/gastos`, { auth: true }),
        request(`/grupos/${grupo.id}/liquidaciones`, { auth: true }),
      ])
      const gastos = arrayFromResponse(response, ['gastos'], `/grupos/${grupo.id}/gastos`)
      const liquidaciones = arrayFromResponse(responseLiquidaciones, ['liquidaciones'], `/grupos/${grupo.id}/liquidaciones`)
      return gastos.map(gasto => {
        const participaciones = gasto.participaciones || []
        const divisiones = participaciones.map(parte => ({
          usuario_id: String(parte.usuarioId),
          monto_asignado: Number(parte.montoAsignado),
          monto_asignado_cop: Number(parte.montoAsignado) * Number(grupo.tasaCop || 1),
          estado_pago: parte.estadoPago,
          fecha_pago: parte.fechaPago,
          pago_reportado: liquidaciones.some(liquidacion =>
            String(liquidacion.gastoId) === String(gasto.id)
            && String(liquidacion.deudorId) === String(parte.usuarioId)
            && String(liquidacion.acreedorId) === String(gasto.pagador_id)),
          usuario: {
            id: String(parte.usuarioId),
            nombre: parte.nombre,
          },
        }))
        const me = String(user.id)
        const miParte = divisiones.find(parte => parte.usuario_id === me)
        return {
          ...gasto,
          id: String(gasto.id),
          grupo_id: String(gasto.grupo_id),
          pagador_id: String(gasto.pagador_id),
          monto_total: Number(gasto.monto_total),
          monto_total_cop: Number(gasto.monto_total) * Number(grupo.tasaCop || 1),
          monto_original: Number(gasto.monto_original ?? gasto.monto_total),
          tasa_cambio: Number(gasto.tasa_cambio || 1),
          moneda_original: gasto.moneda_original || 'COP',
          articulos: (gasto.articulos || []).map(item => ({
            ...item,
            cantidad: Number(item.cantidad),
            montoTotal: Number(item.montoTotal),
          })),
          fecha_gasto: String(gasto.fecha_gasto).slice(0, 10),
          grupo: {
            id: String(grupo.id),
            nombre: grupo.nombre,
            moneda: grupo.moneda || 'COP',
            tasaCop: Number(grupo.tasaCop || 1),
            instruccionesPago: grupo.instruccionesPago,
          },
          pagador: { id: String(gasto.pagador_id), nombre: gasto.pagador },
          personas: divisiones.length,
          divisiones,
          mi_parte: Number(miParte?.monto_asignado || 0),
          mi_parte_cop: Number(miParte?.monto_asignado || 0) * Number(grupo.tasaCop || 1),
          mi_estado: !miParte ? 'no_participa' : String(gasto.pagador_id) === me ? 'pagador' : miParte.estado_pago,
          me_deben: String(gasto.pagador_id) === me
            ? divisiones
              .filter(parte => parte.usuario_id !== me && parte.estado_pago === 'pendiente')
              .reduce((total, parte) => total + parte.monto_asignado, 0)
            : 0,
          me_deben_cop: String(gasto.pagador_id) === me
            ? divisiones
              .filter(parte => parte.usuario_id !== me && parte.estado_pago === 'pendiente')
              .reduce((total, parte) => total + parte.monto_asignado, 0) * Number(grupo.tasaCop || 1)
            : 0,
          tasa_cop: Number(grupo.tasaCop || 1),
          comprobante_verificacion: gasto.comprobante_verificacion,
        }
      })
    }))
    return gruposGastos.flat()
      .sort((a, b) => b.fecha_gasto.localeCompare(a.fecha_gasto) || String(b.fecha_registro).localeCompare(String(a.fecha_registro)))
  },
  async listRecurrences(_user, grupoId) {
    const response = await request(`/grupos/${grupoId}/recurrencias`, { auth: true })
    return arrayFromResponse(response, ['recurrencias'], `/grupos/${grupoId}/recurrencias`)
  },
  setRecurrenceActive: (_user, grupoId, id, activa) =>
    request(`/grupos/${grupoId}/recurrencias/${id}`, { method: 'PATCH', auth: true, body: { activa } }),
  async listTemplates(_user, grupoId) {
    const response = await request(`/grupos/${grupoId}/plantillas`, { auth: true })
    return arrayFromResponse(response, ['plantillas'], `/grupos/${grupoId}/plantillas`).map(item => {
      const asignaciones = item.asignaciones || []
      return {
        id: item.id,
        nombre: item.nombre,
        tipo: item.tipoDivision,
        participantes: asignaciones.map(asignacion => String(asignacion.usuarioId)),
        custom: Object.fromEntries(asignaciones.map(asignacion => [String(asignacion.usuarioId), String(asignacion.valor)])),
        proporciones: Object.fromEntries(asignaciones.map(asignacion => [String(asignacion.usuarioId), String(asignacion.valor)])),
      }
    })
  },
  saveTemplate: (_user, grupoId, template) =>
    request(`/grupos/${grupoId}/plantillas`, {
      method: 'POST',
      auth: true,
      body: {
        nombre: template.nombre,
        tipoDivision: template.tipo,
        asignaciones: template.asignaciones,
      },
    }),
  deleteTemplate: (_user, grupoId, id) =>
    request(`/grupos/${grupoId}/plantillas/${id}`, { method: 'DELETE', auth: true }),
  createExpense: async (user, body) => {
    const comprobante = body.recibo?.docHash ? {
      archivoHash: body.recibo.docHash,
      comercio: body.recibo.comercio_extraido || null,
      nit: body.recibo.nit || null,
      numeroFactura: body.recibo.numero_factura || null,
      cufe: body.recibo.cufe || null,
      fecha: body.recibo.fecha_extraida || null,
      montoTotal: body.recibo.monto_extraido || null,
      subtotal: body.recibo.subtotal ?? null,
      impuestos: body.recibo.impuestos ?? null,
      propina: body.recibo.propina ?? null,
    } : undefined
    const comunes = {
      descripcion: body.descripcion,
      montoTotal: body.monto_total,
      fechaGasto: body.fecha_gasto,
      categoria: body.categoria,
      pagadorId: Number(body.pagador_id),
      origenRegistro: body.origen_registro === 'ocr' ? 'ocr' : 'manual',
      monedaOriginal: body.moneda_original || 'COP',
      montoOriginal: Number(body.monto_original ?? body.monto_total),
      tasaCambio: Number(body.tasa_cambio || 1),
      solicitudId: body.solicitud_id,
      recurrencia: body.recurrencia,
      articulos: (body.articulos || []).map(articulo => ({
        descripcion: articulo.descripcion,
        cantidad: Number(articulo.cantidad),
        montoTotal: Number(articulo.monto_total),
      })),
      ...(comprobante ? { comprobante } : {}),
    }
    const division = body.tipo_division === 'personalizada'
      ? {
          ...comunes,
          tipoDivision: 'personalizada',
          participaciones: body.divisiones.map(d => ({ usuarioId: Number(d.usuario_id), montoAsignado: d.monto_asignado })),
        }
      : body.tipo_division === 'porcentaje' || body.tipo_division === 'participaciones'
        ? {
            ...comunes,
            tipoDivision: body.tipo_division,
            asignaciones: body.asignaciones.map(a => ({ usuarioId: Number(a.usuario_id), valor: Number(a.valor) })),
          }
        : {
          ...comunes,
          tipoDivision: 'equitativa',
          usuarioIds: body.divisiones.map(d => Number(d.usuario_id)),
        }
    try {
      return await request(`/grupos/${body.grupo_id}/gastos`, { method: 'POST', auth: true, body: division })
    } catch (error) {
      if (error.status !== 0) throw error
      const item = addOfflineExpense(user, body.grupo_id, division, body.descripcion)
      return { queued: true, queueId: item.id }
    }
  },
  async pendingOfflineExpenses(user) {
    return readOfflineQueue(user)
  },
  async flushOfflineExpenses(user) {
    const queue = readOfflineQueue(user)
    const remaining = []
    for (const item of queue) {
      if (item.status === 'needs_review') {
        remaining.push(item)
        continue
      }
      try {
        await request(`/grupos/${item.grupoId}/gastos`, { method: 'POST', auth: true, body: item.payload })
      } catch (error) {
        if (error.status === 0) {
          remaining.push(item)
          remaining.push(...queue.slice(queue.indexOf(item) + 1))
          break
        }
        remaining.push({ ...item, status: 'needs_review', error: error.message })
        continue
      }
    }
    writeOfflineQueue(user, remaining)
    return remaining
  },
  async retryOfflineExpense(user, id) {
    const queue = readOfflineQueue(user)
    const item = queue.find(entry => entry.id === id)
    if (!item) return queue
    writeOfflineQueue(user, queue.map(entry => entry.id === id ? { ...entry, status: 'pending', error: '' } : entry))
    return remote.flushOfflineExpenses(user)
  },
  async discardOfflineExpense(user, id) {
    const queue = readOfflineQueue(user).filter(entry => entry.id !== id)
    writeOfflineQueue(user, queue)
    return queue
  },
  deleteExpense: (_u, id) => request(`/grupos/gastos/${id}`, { method: 'DELETE', auth: true }),
  payShare: (_u, gastoId) =>
    request(`/grupos/gastos/${gastoId}/pagos`, { method: 'POST', auth: true }),
  async pendingSettlements(_u, grupoId) {
    const response = await request(`/grupos/${grupoId}/liquidaciones`, { auth: true })
    return arrayFromResponse(response, ['liquidaciones'], `/grupos/${grupoId}/liquidaciones`)
  },
  settle: (_u, { grupo_id, para, monto }) =>
    request(`/grupos/${grupo_id}/liquidaciones`, {
      method: 'POST',
      auth: true,
      body: { acreedorId: Number(para), monto: Number(monto) },
    }),
  confirmSettlement: (_u, grupoId, liquidacionId) =>
    request(`/grupos/${grupoId}/liquidaciones/${liquidacionId}/confirmar`, { method: 'POST', auth: true }),
  resetDemo: async () => {},
}

const ACCIONES_AUDITADAS = {
  summary: 'panel_consultar',
  groups: 'grupos_consultar',
  history: 'historial_consultar',
  expenses: 'gastos_consultar',
  createGroup: 'grupo_crear',
  addMember: 'miembro_agregar',
  archiveGroup: 'grupo_archivar',
  createExpense: 'gasto_crear',
  deleteExpense: 'gasto_eliminar',
  payShare: 'pago_registrar',
  settle: 'liquidacion_registrar',
}

const localConAuditoria = new Proxy(local, {
  get(target, propiedad, receiver) {
    const metodo = Reflect.get(target, propiedad, receiver)
    if (typeof metodo !== 'function') return metodo

    return async (...argumentos) => {
      const resultado = await metodo.apply(target, argumentos)
      const accion = propiedad === 'resetDemo'
        ? (argumentos[1]?.empty ? 'datos_demo_borrar' : 'datos_demo_restaurar')
        : ACCIONES_AUDITADAS[propiedad]
      if (accion) {
        auditoriaApi.record(accion).catch(error => {
          console.error('No fue posible sincronizar la actividad local con la auditoría:', error)
        })
      }
      return resultado
    }
  },
})

function inFinanceMode(remoteFn, localFn) {
  return async function (user, ...args) {
    return shouldUseLocalFinance(user, MODE)
      ? localFn(user, ...args)
      : remoteFn(user, ...args)
  }
}

export const financeApi = {
  summary: inFinanceMode(remote.summary, localConAuditoria.summary),
  groups: inFinanceMode(remote.groups, localConAuditoria.groups),
  createGroup: inFinanceMode(remote.createGroup, localConAuditoria.createGroup),
  addMember: inFinanceMode(remote.addMember, localConAuditoria.addMember),
  history: inFinanceMode(remote.history, localConAuditoria.history),
  archiveGroup: inFinanceMode(remote.archiveGroup, localConAuditoria.archiveGroup),
  expenses: inFinanceMode(remote.expenses, localConAuditoria.expenses),
  createExpense: inFinanceMode(remote.createExpense, localConAuditoria.createExpense),
  pendingOfflineExpenses: inFinanceMode(remote.pendingOfflineExpenses, async () => []),
  flushOfflineExpenses: inFinanceMode(remote.flushOfflineExpenses, async () => []),
  retryOfflineExpense: inFinanceMode(remote.retryOfflineExpense, async () => []),
  discardOfflineExpense: inFinanceMode(remote.discardOfflineExpense, async () => []),
  deleteExpense: inFinanceMode(remote.deleteExpense, localConAuditoria.deleteExpense),
  listRecurrences: inFinanceMode(remote.listRecurrences, local.listRecurrences),
  setRecurrenceActive: inFinanceMode(remote.setRecurrenceActive, local.setRecurrenceActive),
  listTemplates: inFinanceMode(remote.listTemplates, local.listTemplates),
  saveTemplate: inFinanceMode(remote.saveTemplate, local.saveTemplate),
  deleteTemplate: inFinanceMode(remote.deleteTemplate, local.deleteTemplate),
  payShare: inFinanceMode(remote.payShare, localConAuditoria.payShare),
  pendingSettlements: inFinanceMode(
    remote.pendingSettlements,
    async () => [],
  ),
  settle: inFinanceMode(remote.settle, localConAuditoria.settle),
  confirmSettlement: inFinanceMode(
    remote.confirmSettlement,
    async () => {},
  ),
  resetDemo: localConAuditoria.resetDemo,
}

export const financeMode = MODE
export const usesLocalFinance = user => shouldUseLocalFinance(user, MODE)
