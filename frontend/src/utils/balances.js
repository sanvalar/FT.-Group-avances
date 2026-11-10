// Motor de cálculo (lado cliente) — misma lógica que describe el documento
// técnico: GASTO -> DIVISION_GASTO -> BALANCE entre pares de usuarios.

/** Reparte un monto en partes iguales sin perder pesos por redondeo. */
export function splitEqual(total, userIds) {
  const n = userIds.length
  if (!n) return []
  const base = Math.floor(total / n)
  let resto = total - base * n
  return userIds.map(usuario_id => {
    const extra = resto > 0 ? 1 : 0
    resto -= extra
    return { usuario_id, monto_asignado: base + extra }
  })
}

/** Reparte centavos según porcentajes o participaciones, conservando el total. */
export function splitRatio(totalInCents, entries) {
  const sum = entries.reduce((total, entry) => total + Number(entry.value), 0)
  if (!Number.isFinite(sum) || sum <= 0 || entries.some(entry => !Number.isFinite(Number(entry.value)) || Number(entry.value) <= 0)) return []
  const exact = entries.map(entry => totalInCents * Number(entry.value) / sum)
  const amounts = exact.map(Math.floor)
  const remaining = totalInCents - amounts.reduce((total, value) => total + value, 0)
  const order = exact.map((value, index) => ({ index, fraction: value - amounts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; index < remaining; index += 1) amounts[order[index].index] += 1
  return entries.map((entry, index) => ({ usuario_id: entry.usuario_id, monto_asignado: amounts[index] / 100 }))
}

/** Deudas pendientes: cada división no pagada de alguien distinto al pagador. */
export function pendingDebts(gastos, divisiones) {
  const byId = new Map(gastos.map(g => [g.id, g]))
  const out = []
  for (const d of divisiones) {
    const g = byId.get(d.gasto_id)
    if (!g || d.estado_pago === 'pagado' || d.usuario_id === g.pagador_id) continue
    out.push({ grupo_id: g.grupo_id, gasto_id: g.id, deudor_id: d.usuario_id, acreedor_id: g.pagador_id, monto: d.monto_asignado })
  }
  return out
}

/** Saldo neto por usuario (positivo = le deben, negativo = debe). */
export function netBalances(debts) {
  const net = {}
  for (const { deudor_id, acreedor_id, monto } of debts) {
    net[deudor_id] = (net[deudor_id] || 0) - monto
    net[acreedor_id] = (net[acreedor_id] || 0) + monto
  }
  return net
}

/**
 * Balance por pares (tabla BALANCE): para cada par de usuarios de un grupo,
 * compensa lo que A le debe a B con lo que B le debe a A y deja un único
 * saldo neto "deudor -> acreedor".
 */
export function pairwise(debts) {
  const acc = new Map()
  for (const { deudor_id, acreedor_id, monto } of debts) {
    const [a, b] = [deudor_id, acreedor_id].sort()
    const k = `${a}|${b}`
    const sign = deudor_id === a ? 1 : -1 // positivo: a le debe a b
    acc.set(k, (acc.get(k) || 0) + sign * monto)
  }
  const out = []
  for (const [k, v] of acc) {
    const [a, b] = k.split('|')
    if (Math.abs(v) < 1) continue
    out.push(v > 0 ? { de: a, para: b, monto: Math.round(v) } : { de: b, para: a, monto: Math.round(-v) })
  }
  return out.sort((x, y) => y.monto - x.monto)
}

/**
 * Alternativa (no usada por defecto): liquidación mínima global. Minimiza el número de pagos emparejando al mayor
 * deudor con el mayor acreedor (algoritmo voraz).
 */
export function simplify(net) {
  const deudores = [], acreedores = []
  for (const [id, v] of Object.entries(net)) {
    if (v < -0.5) deudores.push({ id, v: -v })
    else if (v > 0.5) acreedores.push({ id, v })
  }
  deudores.sort((a, b) => b.v - a.v)
  acreedores.sort((a, b) => b.v - a.v)
  const pagos = []
  let i = 0, j = 0
  while (i < deudores.length && j < acreedores.length) {
    const monto = Math.min(deudores[i].v, acreedores[j].v)
    pagos.push({ de: deudores[i].id, para: acreedores[j].id, monto: Math.round(monto) })
    deudores[i].v -= monto
    acreedores[j].v -= monto
    if (deudores[i].v < 0.5) i++
    if (acreedores[j].v < 0.5) j++
  }
  return pagos
}
