// KPIs básicos de FT. GROUP.
//
// Un KPI es un indicador con meta: además del valor, dice si la situación
// está bien (ok), requiere atención (alerta) o es preocupante (critico).
//
// Se calculan en el navegador con los mismos datos que ya entrega financeApi
// (gastos con sus divisiones y grupos con sus miembros), así que funcionan
// con el backend actual y en modo local, sin endpoints nuevos.
//
// Comparación justa: el mes en curso se compara con el mes anterior
// HASTA EL MISMO DÍA (p. ej. 1–13 oct contra 1–13 sep), no contra el mes
// anterior completo, para no castigar un mes que apenas empieza.

/* ------------------------------------------------------------------ */
/* Metas (umbrales del semáforo)                                       */
/* ------------------------------------------------------------------ */
export const METAS = {
  variacionGasto: { alerta: 0, critico: 15 },      // % de aumento frente al mes anterior
  tasaRecaudo: { ok: 80, alerta: 60 },             // % del dinero adeudado que ya se pagó
  antiguedadCartera: { ok: 15, alerta: 30 },       // días promedio que llevan las deudas pendientes
  participacionPendiente: { ok: 20, alerta: 40 },  // % de las partes que siguen sin pagar
}

/* ------------------------------------------------------------------ */
/* Utilidades de fecha                                                 */
/* ------------------------------------------------------------------ */
const DIA_MS = 86400000
const pad = n => String(n).padStart(2, '0')
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const diasEntre = (desde, hasta) => Math.max(0, Math.round((new Date(hasta.slice(0, 10)) - new Date(desde.slice(0, 10))) / DIA_MS))
const diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate()

/** Rango [desde, hasta] (AAAA-MM-DD) del mes en curso y del mes anterior al mismo corte. */
export function periodos(hoy = new Date()) {
  const anio = hoy.getFullYear(), mes = hoy.getMonth() + 1, dia = hoy.getDate()
  const antAnio = mes === 1 ? anio - 1 : anio
  const antMes = mes === 1 ? 12 : mes - 1
  const corteAnt = Math.min(dia, diasDelMes(antAnio, antMes))
  return {
    actual: { desde: `${anio}-${pad(mes)}-01`, hasta: isoLocal(hoy), periodo: `${anio}-${pad(mes)}` },
    anterior: { desde: `${antAnio}-${pad(antMes)}-01`, hasta: `${antAnio}-${pad(antMes)}-${pad(corteAnt)}`, periodo: `${antAnio}-${pad(antMes)}` },
    dia,
  }
}

const enRango = (g, r) => g.fecha_gasto >= r.desde && g.fecha_gasto <= r.hasta
const suma = xs => xs.reduce((a, b) => a + b, 0)

/** Variación porcentual; null si no hay base para comparar. */
export const variacion = (actual, anterior) => (anterior > 0 ? ((actual - anterior) / anterior) * 100 : null)

/* ------------------------------------------------------------------ */
/* Semáforos                                                           */
/* ------------------------------------------------------------------ */
// "Más alto es mejor" (p. ej. tasa de recaudo).
const mayorEsMejor = (v, { ok, alerta }) => (v === null ? 'neutro' : v >= ok ? 'ok' : v >= alerta ? 'alerta' : 'critico')
// "Más bajo es mejor" (p. ej. antigüedad de la cartera).
const menorEsMejor = (v, { ok, alerta }) => (v === null ? 'neutro' : v <= ok ? 'ok' : v <= alerta ? 'alerta' : 'critico')

/* ------------------------------------------------------------------ */
/* Cálculo                                                             */
/* ------------------------------------------------------------------ */

/**
 * @param {object[]} gastos  Gastos de financeApi.expenses (con `divisiones`).
 * @param {object[]} grupos  Grupos de financeApi.groups (con `miembros`).
 * @param {string}   me      Id del usuario autenticado.
 * @param {object}   [opciones] { hoy: Date }
 */
export function calcularKpis(gastos, grupos, me, { hoy = new Date() } = {}) {
  const { actual, anterior, dia } = periodos(hoy)
  const hoyIso = isoLocal(hoy)
  const delMes = gastos.filter(g => enRango(g, actual))
  const delAnterior = gastos.filter(g => enRango(g, anterior))

  // ---- 1. Gasto del mes y variación al mismo corte ----
  const gastoMes = suma(delMes.map(g => g.monto_total))
  const gastoAnterior = suma(delAnterior.map(g => g.monto_total))
  const varGasto = variacion(gastoMes, gastoAnterior)
  const estadoGasto = varGasto === null ? 'neutro'
    : varGasto <= METAS.variacionGasto.alerta ? 'ok'
      : varGasto <= METAS.variacionGasto.critico ? 'alerta' : 'critico'

  // ---- 2. Número de gastos y ticket promedio ----
  const numMes = delMes.length
  const numAnterior = delAnterior.length
  const ticketMes = numMes ? gastoMes / numMes : 0
  const ticketAnterior = numAnterior ? gastoAnterior / numAnterior : 0

  // ---- 3. Gasto por integrante ----
  const integrantes = new Set(grupos.flatMap(g => (g.miembros || []).map(m => String(m.id ?? m.usuario_id))))
  const gastoPorIntegrante = integrantes.size ? gastoMes / integrantes.size : 0

  // ---- 4–6. Cartera: lo que unos integrantes le deben al pagador ----
  // Se excluye la parte del propio pagador: esa no es una deuda.
  const deudas = gastos.flatMap(g => (g.divisiones || [])
    .filter(d => String(d.usuario_id) !== String(g.pagador_id))
    .map(d => ({ ...d, fecha_gasto: g.fecha_gasto, pagador_id: g.pagador_id })))
  const pendientes = deudas.filter(d => d.estado_pago === 'pendiente')
  const montoAdeudado = suma(deudas.map(d => d.monto_asignado))
  const montoPendiente = suma(pendientes.map(d => d.monto_asignado))
  const tasaRecaudo = montoAdeudado > 0 ? ((montoAdeudado - montoPendiente) / montoAdeudado) * 100 : null
  const antiguedad = pendientes.length
    ? suma(pendientes.map(d => diasEntre(d.fecha_gasto, hoyIso))) / pendientes.length
    : null
  const pctPartesPendientes = deudas.length ? (pendientes.length / deudas.length) * 100 : null

  // ---- 7. Posición personal ----
  const meDeben = suma(pendientes.filter(d => String(d.pagador_id) === me).map(d => d.monto_asignado))
  const debo = suma(pendientes.filter(d => String(d.usuario_id) === me).map(d => d.monto_asignado))
  const miAporteMes = suma(delMes.filter(g => String(g.pagador_id) === me).map(g => g.monto_total))
  const miParticipacion = gastoMes > 0 ? (miAporteMes / gastoMes) * 100 : null

  // ---- 8. Actividad ----
  const gruposConGastoMes = new Set(delMes.map(g => g.grupo_id)).size

  return {
    periodo: { actual, anterior, dia },
    kpis: [
      {
        id: 'gasto_mes', nombre: 'Gasto del mes', formato: 'money', valor: gastoMes,
        anterior: gastoAnterior, variacion: varGasto, estado: estadoGasto, invertido: true,
        meta: 'No superar el gasto del mes anterior al mismo día',
        formula: 'Σ monto_total de los gastos del mes hasta hoy',
      },
      {
        id: 'num_gastos', nombre: 'Gastos registrados', formato: 'num', valor: numMes,
        anterior: numAnterior, variacion: variacion(numMes, numAnterior), estado: 'neutro',
        formula: 'Cantidad de gastos del mes hasta hoy',
      },
      {
        id: 'ticket_promedio', nombre: 'Ticket promedio', formato: 'money', valor: ticketMes,
        anterior: ticketAnterior, variacion: variacion(ticketMes, ticketAnterior), estado: 'neutro', invertido: true,
        formula: 'Gasto del mes ÷ gastos registrados',
      },
      {
        id: 'gasto_integrante', nombre: 'Gasto por integrante', formato: 'money', valor: gastoPorIntegrante,
        estado: 'neutro', detalle: `${integrantes.size} ${integrantes.size === 1 ? 'integrante' : 'integrantes'}`,
        formula: 'Gasto del mes ÷ integrantes únicos de los grupos',
      },
      {
        id: 'tasa_recaudo', nombre: 'Tasa de recaudo', formato: 'pct', valor: tasaRecaudo,
        estado: mayorEsMejor(tasaRecaudo, METAS.tasaRecaudo),
        meta: `≥ ${METAS.tasaRecaudo.ok} % del dinero adeudado ya pagado`,
        formula: '(adeudado − pendiente) ÷ adeudado × 100',
      },
      {
        id: 'cartera_pendiente', nombre: 'Cartera pendiente', formato: 'money', valor: montoPendiente,
        estado: menorEsMejor(pctPartesPendientes, METAS.participacionPendiente),
        detalle: `${pendientes.length} ${pendientes.length === 1 ? 'parte sin pagar' : 'partes sin pagar'}`,
        meta: `≤ ${METAS.participacionPendiente.ok} % de las partes sin pagar`,
        formula: 'Σ monto_asignado con estado_pago = pendiente (sin contar al pagador)',
      },
      {
        id: 'antiguedad_cartera', nombre: 'Antigüedad de la cartera', formato: 'dias', valor: antiguedad,
        estado: menorEsMejor(antiguedad, METAS.antiguedadCartera),
        meta: `≤ ${METAS.antiguedadCartera.ok} días en promedio`,
        formula: 'Promedio de días desde la fecha del gasto de cada parte pendiente',
      },
      {
        id: 'mi_participacion', nombre: 'Mi aporte del mes', formato: 'pct', valor: miParticipacion,
        estado: 'neutro', detalle: miParticipacion === null ? 'Sin gastos este mes' : null,
        formula: 'Lo que pagaste este mes ÷ gasto del mes × 100',
      },
    ],
    resumen: {
      me_deben: meDeben,
      debo,
      balance: meDeben - debo,
      grupos_activos: grupos.length,
      grupos_con_gasto_mes: gruposConGastoMes,
      integrantes: integrantes.size,
    },
  }
}
