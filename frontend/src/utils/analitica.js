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

const diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate()

const periodoAnterior = p => {
  const [a, m] = p.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

const siguientePeriodo = p => {
  const [a, m] = p.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

const sumarMes = p => {
  const [anio, mes] = p.split('-').map(Number)
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`
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
  const periodos = [...acum.keys()].sort()
  if (!periodos.length) return []
  const serie = []
  for (let p = periodos[0]; p <= periodos.at(-1); p = sumarMes(p)) {
    serie.push(acum.get(p) || { periodo: p, total: 0, num_gastos: 0 })
  }
  return serie
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

function sumarPeriodo(gastos, desde, hasta, selector = () => 'total') {
  const acumulados = new Map()
  for (const gasto of gastos) {
    if (gasto.fecha_gasto < desde || gasto.fecha_gasto > hasta) continue
    const clave = selector(gasto)
    if (clave === null || clave === undefined || clave === '') continue
    acumulados.set(clave, (acumulados.get(clave) || 0) + gasto.monto_total)
  }
  return acumulados
}

function comparacionSegmentos(gastos, hoy) {
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const actualDesde = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
  const actualHasta = `${actualDesde.slice(0, 7)}-${String(fecha.getDate()).padStart(2, '0')}`
  const anterior = new Date(fecha.getFullYear(), fecha.getMonth() - 1, 1)
  const corteAnterior = Math.min(fecha.getDate(), diasDelMes(anterior.getFullYear(), anterior.getMonth() + 1))
  const anteriorDesde = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}-01`
  const anteriorHasta = `${anteriorDesde.slice(0, 7)}-${String(corteAnterior).padStart(2, '0')}`
  const categoriasActual = sumarPeriodo(gastos, actualDesde, actualHasta, g => g.categoria || 'otro')
  const categoriasAnterior = sumarPeriodo(gastos, anteriorDesde, anteriorHasta, g => g.categoria || 'otro')
  const gruposActual = sumarPeriodo(gastos, actualDesde, actualHasta, g => g.grupo?.nombre || String(g.grupo_id ?? 'sin grupo'))
  const gruposAnterior = sumarPeriodo(gastos, anteriorDesde, anteriorHasta, g => g.grupo?.nombre || String(g.grupo_id ?? 'sin grupo'))
  const combinar = (actual, pasado) => [...new Set([...actual.keys(), ...pasado.keys()])]
    .map(clave => {
      const montoActual = actual.get(clave) || 0
      const montoAnterior = pasado.get(clave) || 0
      return {
        clave,
        actual: montoActual,
        anterior: montoAnterior,
        variacion: montoAnterior > 0 ? ((montoActual - montoAnterior) / montoAnterior) * 100 : null,
      }
    })
    .sort((a, b) => b.actual - a.actual)
  return {
    actual: { desde: actualDesde, hasta: actualHasta },
    anterior: { desde: anteriorDesde, hasta: anteriorHasta },
    categorias: combinar(categoriasActual, categoriasAnterior),
    grupos: combinar(gruposActual, gruposAnterior),
  }
}

export function indicadores(gastos, me, { hoy = new Date() } = {}) {
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
    comparacion_periodos: comparacionSegmentos(gastos, hoy),
    personal: { debe, le_deben: leDeben, balance: leDeben - debe, aportado, asignado },
  }
}

/* ------------------------------------------------------------------ */
/* ESTIMADORES                                                         */
/* ------------------------------------------------------------------ */

const ALFA = 0.4        // ponderación del suavizado exponencial
const VENTANA_DIAS = 7  // días de la media móvil
const UMBRAL_ROBUSTO = 3.5
const R2_MINIMO = 0.3   // ajuste mínimo para considerar que hay tendencia

function cuantil(valores, q) {
  if (!valores.length) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  const posicion = (ordenados.length - 1) * q
  const inferior = Math.floor(posicion)
  const fraccion = posicion - inferior
  return ordenados[inferior] + (ordenados[inferior + 1] - ordenados[inferior] || 0) * fraccion
}

function estadisticasRobustas(valores) {
  const centro = mediana(valores)
  const mad = mediana(valores.map(valor => Math.abs(valor - centro)))
  const rangoIntercuartil = cuantil(valores, 0.75) - cuantil(valores, 0.25)
  const escala = mad > 0 ? mad * 1.4826 : rangoIntercuartil / 1.349
  return { centro, escala }
}

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
 * gasta un 30 % por encima del promedio. Se requieren dos años/observaciones
 * del mes para evitar ajustar la proyección a un caso aislado.
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
    if (valores.length < 2) {
      out[mes] = 1
      continue
    }
    const crudo = media(valores) / general
    out[mes] = crudo
  }
  return out
}

/** Compara cada gasto con referencias similares, usando mediana y MAD/IQR. */
export function atipicos(gastos, umbral = UMBRAL_ROBUSTO) {
  const crearCubetas = selector => {
    const cubetas = new Map()
    for (const gasto of gastos) {
      const clave = selector(gasto)
      const filas = cubetas.get(clave) || []
      filas.push(gasto)
      cubetas.set(clave, filas)
    }
    return cubetas
  }
  const porGrupoCategoria = crearCubetas(g => JSON.stringify([g.grupo_id ?? null, g.categoria ?? null]))
  const porCategoria = crearCubetas(g => g.categoria ?? null)
  const porGrupo = crearCubetas(g => g.grupo_id ?? null)
  const prepararCubetas = cubetas => new Map([...cubetas].map(([clave, filas]) => [
    clave,
    filas.length >= 5 ? { cantidad: filas.length, ...estadisticasRobustas(filas.map(g => g.monto_total)) } : null,
  ]))
  const datosGrupoCategoria = prepararCubetas(porGrupoCategoria)
  const datosCategoria = prepararCubetas(porCategoria)
  const datosGrupo = prepararCubetas(porGrupo)
  const datosGlobales = gastos.length >= 5
    ? { cantidad: gastos.length, ...estadisticasRobustas(gastos.map(g => g.monto_total)) }
    : null
  const anomalos = []
  for (const gasto of gastos) {
    const comparables = [
      { fuente: 'mismo grupo y categoría', datos: datosGrupoCategoria.get(JSON.stringify([gasto.grupo_id ?? null, gasto.categoria ?? null])) },
      { fuente: 'misma categoría', datos: datosCategoria.get(gasto.categoria ?? null) },
      { fuente: 'mismo grupo', datos: datosGrupo.get(gasto.grupo_id ?? null) },
      { fuente: 'todos los gastos', datos: datosGlobales },
    ].find(candidato => candidato.datos)
    if (!comparables) continue

    const { centro, escala } = comparables.datos
    const diferencia = gasto.monto_total - centro
    const z = escala > 0 ? diferencia / escala : diferencia === 0 ? 0 : Math.sign(diferencia) * umbral
    if (Math.abs(z) >= umbral) {
      anomalos.push({
        ...gasto,
        z,
        mediana_comparable: centro,
        referencia: comparables.fuente,
        cantidad_referencias: comparables.datos.cantidad - 1,
      })
    }
  }
  return anomalos.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8)
}

function pronosticoSiguienteMes(valores) {
  const base = valores.slice(-12)
  const mediaReciente = media(base.slice(-3))
  const exponencial = suavizado(base)
  const { b0, b1, r2 } = regresion(base)
  const lineal = Math.max(b0 + b1 * base.length, 0)
  const candidatos = [mediaReciente, exponencial]
  if (base.length >= 4 && r2 >= R2_MINIMO) candidatos.push(lineal)
  return { valor: media(candidatos), r2 }
}

function evaluarPronostico(serie) {
  const errores = []
  for (let indice = 3; indice < serie.length; indice += 1) {
    const historialSerie = serie.slice(0, indice)
    const historial = historialSerie.map(fila => fila.total)
    const esperado = serie[indice].total
    const mesObjetivo = Number(serie[indice].periodo.slice(5))
    const factorEstacional = indicesEstacionales(historialSerie)[mesObjetivo] ?? 1
    const pronosticado = pronosticoSiguienteMes(historial).valor * factorEstacional
    errores.push({
      periodo: serie[indice].periodo,
      errorAbsoluto: Math.abs(esperado - pronosticado),
      errorPorcentual: esperado > 0 ? Math.abs(esperado - pronosticado) / esperado * 100 : null,
    })
  }
  const porcentuales = errores.map(error => error.errorPorcentual).filter(Number.isFinite)
  const margen80 = porcentuales.length >= 3 ? cuantil(errores.map(error => error.errorAbsoluto), 0.8) : null
  const errorPorcentualMedio = porcentuales.length ? media(porcentuales) : null
  const nivel = porcentuales.length < 3 ? 'insuficiente'
    : errorPorcentualMedio <= 15 ? 'alto'
      : errorPorcentualMedio <= 30 ? 'medio' : 'bajo'
  return {
    mesesEvaluados: errores.length,
    errorAbsolutoMedio: errores.length ? media(errores.map(error => error.errorAbsoluto)) : null,
    errorPorcentualMedio,
    margen80,
    nivel,
    errores,
  }
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
  const cerrada = abierto ? serie.slice(0, -1) : serie
  const basePronostico = cerrada.length ? cerrada.map(fila => fila.total) : [enCurso.total]
  const indices = indicesEstacionales(cerrada)
  const proyeccion = []
  const evaluacion = evaluarPronostico(cerrada)
  // Si el mes actual ya tiene gastos, se proyecta a partir del siguiente;
  // si no, el propio mes actual es el primero por proyectar.
  let p = abierto ? enCurso.periodo : periodoAnterior(periodoActual)
  for (let i = 1; i <= horizonte; i++) {
    p = siguientePeriodo(p)
    const m = Number(p.slice(5))
    const historial = i === 1 ? basePronostico : [...basePronostico, ...proyeccion.map(fila => fila.total)]
    const pronostico = pronosticoSiguienteMes(historial)
    const valor = pronostico.valor * (indices[m] ?? 1)
    const margen = evaluacion.margen80 === null ? null : evaluacion.margen80 * Math.sqrt(i)
    proyeccion.push({
      periodo: p,
      total: Math.max(valor, 0),
      estimado: true,
      minimo: margen === null ? null : Math.max(valor - margen, 0),
      maximo: margen === null ? null : valor + margen,
    })
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
    evaluacion,
    atipicos: atipicos(gastos),
  }
}

/** Punto de entrada: calcula todo el análisis de una vez. */
export function analizar(gastos, me, opciones = {}) {
  const ind = indicadores(gastos, me, opciones)
  if (!ind) return null
  return { indicadores: ind, estimadores: estimadores(gastos, ind.serie, opciones) }
}
