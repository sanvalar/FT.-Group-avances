// Modelos de análisis (semana 4 del cronograma).
//
// Dos bloques:
//   INDICADORES — describen lo que ya ocurrió (gasto, cumplimiento, concentración).
//   ESTIMADORES — proyectan el gasto del mes en curso y de los meses siguientes
//                 a partir del histórico, con cuatro métodos clásicos.
//
// Todo el cálculo es determinista y se hace sobre los gastos que ya entrega
// financeApi, de modo que no depende de endpoints nuevos del backend.

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const periodo = fecha => fecha.slice(0, 7)          // 2026-10-07 -> 2026-10
const media = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

const mediana = xs => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const desviacion = xs => {
  if (xs.length < 2) return 0
  const mu = media(xs)
  return Math.sqrt(media(xs.map(x => (x - mu) ** 2)))
}

const diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate()

const periodoAnterior = p => {
  const [a, m] = p.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

const siguientePeriodo = p => {
  const [a, m] = p.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

/** Serie de gasto mensual, en orden cronológico. */
export function serieMensual(gastos) {
  const acum = new Map()
  for (const g of gastos) {
    const p = periodo(g.fecha_gasto)
    const fila = acum.get(p) || { periodo: p, total: 0, num_gastos: 0 }
    fila.total += g.monto_total
    fila.num_gastos += 1
    acum.set(p, fila)
  }
  return [...acum.values()].sort((a, b) => a.periodo.localeCompare(b.periodo))
}

/* ------------------------------------------------------------------ */
/* INDICADORES                                                         */
/* ------------------------------------------------------------------ */

/**
 * Índice de concentración (Herfindahl normalizado) sobre quién pone el dinero.
 * 0 = todos aportan por igual · 1 = una sola persona paga todo.
 */
function concentracion(gastos) {
  const total = gastos.reduce((s, g) => s + g.monto_total, 0)
  if (!total) return 0
  const porPagador = new Map()
  for (const g of gastos) porPagador.set(g.pagador_id, (porPagador.get(g.pagador_id) || 0) + g.monto_total)
  const n = porPagador.size
  if (n <= 1) return 1
  const hhi = [...porPagador.values()].reduce((s, v) => s + (v / total) ** 2, 0)
  return (hhi - 1 / n) / (1 - 1 / n)
}

/** Días promedio entre el gasto y el pago de cada parte (sin contar al pagador). */
function diasLiquidacion(gastos) {
  const dias = []
  for (const g of gastos) {
    for (const d of g.divisiones || []) {
      if (d.estado_pago !== 'pagado' || !d.fecha_pago) continue
      if (d.usuario_id === g.pagador_id) continue
      const delta = (new Date(d.fecha_pago) - new Date(g.fecha_gasto)) / 86400000
      if (delta >= 0) dias.push(delta)
    }
  }
  return dias.length ? media(dias) : null
}

export function indicadores(gastos, me) {
  if (!gastos.length) return null

  const montos = gastos.map(g => g.monto_total)
  const total = montos.reduce((a, b) => a + b, 0)
  const serie = serieMensual(gastos)

  // Frecuencia sobre el rango realmente observado.
  const fechas = gastos.map(g => g.fecha_gasto).sort()
  const span = Math.max(1, (new Date(fechas.at(-1)) - new Date(fechas[0])) / 86400000)

  const partes = gastos.flatMap(g => g.divisiones || [])
  const saldadas = partes.filter(d => d.estado_pago === 'pagado').length

  const porCategoria = new Map()
  const porGrupo = new Map()
  for (const g of gastos) {
    porCategoria.set(g.categoria, (porCategoria.get(g.categoria) || 0) + g.monto_total)
    const nombre = g.grupo?.nombre || g.grupo_id
    porGrupo.set(nombre, (porGrupo.get(nombre) || 0) + g.monto_total)
  }
  const orden = m => [...m.entries()].sort((a, b) => b[1] - a[1])

  // Posición personal consolidada.
  let debe = 0, leDeben = 0, aportado = 0, asignado = 0
  for (const g of gastos) {
    if (g.pagador_id === me) { aportado += g.monto_total; leDeben += g.me_deben || 0 }
    asignado += g.mi_parte || 0
    if (g.mi_estado === 'pendiente') debe += g.mi_parte || 0
  }

  return {
    gasto_total: total,
    num_gastos: gastos.length,
    ticket_promedio: total / gastos.length,
    ticket_mediano: mediana(montos),
    gasto_mensual_promedio: total / serie.length,
    frecuencia_semanal: gastos.length / (span / 7),
    indice_cumplimiento: partes.length ? (saldadas / partes.length) * 100 : 0,
    dias_liquidacion: diasLiquidacion(gastos),
    indice_concentracion: concentracion(gastos),
    porcentaje_ocr: (gastos.filter(g => g.origen_registro === 'ocr').length / gastos.length) * 100,
    serie,
    por_categoria: orden(porCategoria),
    por_grupo: orden(porGrupo),
    personal: { debe, le_deben: leDeben, balance: leDeben - debe, aportado, asignado },
  }
}

/* ------------------------------------------------------------------ */
/* ESTIMADORES                                                         */
/* ------------------------------------------------------------------ */

const ALFA = 0.4        // ponderación del suavizado exponencial
const VENTANA_DIAS = 7  // días de la media móvil
const UMBRAL_Z = 2      // desviaciones a partir de las cuales un gasto es atípico
const R2_MINIMO = 0.3   // ajuste mínimo para considerar que hay tendencia

/** Mínimos cuadrados sobre la serie. Devuelve intercepto, pendiente y R². */
export function regresion(valores) {
  const n = valores.length
  if (n < 2) return { b0: valores[0] || 0, b1: 0, r2: 0 }
  const xs = valores.map((_, i) => i)
  const mx = media(xs), my = media(valores)
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  if (!sxx) return { b0: my, b1: 0, r2: 0 }
  const b1 = xs.reduce((s, x, i) => s + (x - mx) * (valores[i] - my), 0) / sxx
  const b0 = my - b1 * mx
  const ssTot = valores.reduce((s, y) => s + (y - my) ** 2, 0)
  const ssRes = valores.reduce((s, y, i) => s + (y - (b0 + b1 * i)) ** 2, 0)
  return { b0, b1, r2: ssTot ? 1 - ssRes / ssTot : 0 }
}

/** Suavizado exponencial simple: pondera más los meses recientes. */
export function suavizado(valores, alfa = ALFA) {
  return valores.reduce((s, v, i) => (i === 0 ? v : alfa * v + (1 - alfa) * s), 0)
}

/**
 * Índice estacional por mes calendario: 1,3 en diciembre significa que ese mes
 * gasta un 30 % por encima del promedio. Con una sola observación el factor se
 * atenúa hacia 1 para no sobreajustar.
 */
export function indicesEstacionales(serie) {
  const general = media(serie.map(s => s.total))
  if (!general) return {}
  const porMes = new Map()
  for (const s of serie) {
    const m = Number(s.periodo.slice(5))
    porMes.set(m, [...(porMes.get(m) || []), s.total])
  }
  const out = {}
  for (const [mes, valores] of porMes) {
    const crudo = media(valores) / general
    const peso = Math.min(valores.length / 2, 1)
    out[mes] = 1 + (crudo - 1) * peso
  }
  return out
}

/** Gastos inusualmente altos o bajos, por puntaje z. */
export function atipicos(gastos, umbral = UMBRAL_Z) {
  const montos = gastos.map(g => g.monto_total)
  const mu = media(montos), sd = desviacion(montos)
  if (!sd) return []
  return gastos
    .map(g => ({ ...g, z: (g.monto_total - mu) / sd }))
    .filter(g => Math.abs(g.z) >= umbral)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 8)
}

export function estimadores(gastos, serie, { horizonte = 3, hoy = new Date() } = {}) {
  if (!serie.length) return null

  const anio = hoy.getFullYear(), mes = hoy.getMonth() + 1
  const dias = diasDelMes(anio, mes)
  const transcurridos = Math.min(hoy.getDate(), dias)
  const periodoActual = `${anio}-${String(mes).padStart(2, '0')}`

  // El último mes de la serie solo está "en curso" si es el mes calendario
  // actual. Si el histórico termina antes, todos los meses están cerrados y el
  // run rate no aplica: no hay nada acumulado que extrapolar.
  const abierto = serie.at(-1).periodo === periodoActual
  const enCurso = abierto ? serie.at(-1) : { periodo: periodoActual, total: 0, num_gastos: 0 }
  const cerrados = (abierto ? serie.slice(0, -1) : serie).map(s => s.total)
  const base = cerrados.length ? cerrados : [serie.at(-1).total]

  // 1. Run rate: extrapola el mes en curso por los días transcurridos.
  const runRate = abierto ? (enCurso.total / transcurridos) * dias : null

  // 2. Media móvil de los últimos siete días, expresada como estimación mensual.
  const inicioVentana = new Date(anio, mes - 1, transcurridos)
  inicioVentana.setDate(inicioVentana.getDate() - VENTANA_DIAS + 1)
  const fechaInicio = `${inicioVentana.getFullYear()}-${String(inicioVentana.getMonth() + 1).padStart(2, '0')}-${String(inicioVentana.getDate()).padStart(2, '0')}`
  const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${String(transcurridos).padStart(2, '0')}`
  const totalSemana = gastos.reduce((total, gasto) => (
    gasto.fecha_gasto >= fechaInicio && gasto.fecha_gasto <= fechaFin
      ? total + gasto.monto_total
      : total
  ), 0)
  const mediaMovil = (totalSemana / VENTANA_DIAS) * dias

  // 3. Regresión lineal.
  const { b0, b1, r2 } = regresion(base)
  const lineal = Math.max(b0 + b1 * base.length, 0)

  // 4. Suavizado exponencial.
  const exponencial = suavizado(base)

  const metodos = [
    ...(abierto ? [{ id: 'run_rate', nombre: 'Run rate', valor: runRate, nota: `Mes en curso extrapolado (${transcurridos} de ${dias} días)` }] : []),
    { id: 'media_movil', nombre: 'Media móvil', valor: mediaMovil, nota: `Gasto de los últimos ${VENTANA_DIAS} días, extrapolado al mes` },
    { id: 'regresion', nombre: 'Regresión lineal', valor: lineal, nota: `Mínimos cuadrados · R² = ${r2.toFixed(3)}` },
    { id: 'suavizado', nombre: 'Suavizado exponencial', valor: exponencial, nota: `Alfa = ${ALFA}, pondera los meses recientes` },
  ]

  // El consenso promedia los métodos. Si el ajuste lineal es pobre, la
  // regresión se descarta: la serie es estacional, no tendencial.
  const usaRegresion = r2 >= R2_MINIMO
  const consenso = media(metodos.filter(m => m.id !== 'regresion' || usaRegresion).map(m => m.valor))

  const tendencia = usaRegresion && Math.abs(b1) > media(base) * 0.02
    ? (b1 > 0 ? 'creciente' : 'decreciente')
    : 'estable'

  // Proyección: el consenso marca el nivel y el índice estacional lo corrige.
  const cerrada = abierto && serie.length > 1 ? serie.slice(0, -1) : serie
  const indices = indicesEstacionales(cerrada)
  const proyeccion = []
  // Si el mes actual ya tiene gastos, se proyecta a partir del siguiente;
  // si no, el propio mes actual es el primero por proyectar.
  let p = abierto ? enCurso.periodo : periodoAnterior(periodoActual)
  for (let i = 1; i <= horizonte; i++) {
    p = siguientePeriodo(p)
    const m = Number(p.slice(5))
    const valor = (consenso + (tendencia === 'estable' ? 0 : b1 * i)) * (indices[m] ?? 1)
    proyeccion.push({ periodo: p, total: Math.max(valor, 0), estimado: true })
  }

  return {
    periodo_en_curso: enCurso.periodo,
    acumulado: enCurso.total,
    mes_abierto: abierto,
    dias_transcurridos: transcurridos,
    dias_del_mes: dias,
    metodos,
    usa_regresion: usaRegresion,
    consenso,
    tendencia,
    pendiente: b1,
    r2,
    indices_estacionales: indices,
    proyeccion,
    atipicos: atipicos(gastos),
  }
}

/** Punto de entrada: calcula todo el análisis de una vez. */
export function analizar(gastos, me, opciones = {}) {
  const ind = indicadores(gastos, me)
  if (!ind) return null
  return { indicadores: ind, estimadores: estimadores(gastos, ind.serie, opciones) }
}
