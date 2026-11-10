// Pruebas de los KPIs básicos y de los modelos de análisis.
// Ejecutar con: npm test   (usa el runner nativo de Node, sin dependencias)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularKpis, periodos, variacion } from '../src/utils/kpis.js'
import { analizar } from '../src/utils/analitica.js'

const HOY = new Date(2026, 9, 13) // 13 de octubre de 2026
const ME = 'u-yo'

const div = (usuario_id, monto_asignado, estado_pago = 'pendiente', fecha_pago = null) =>
  ({ usuario_id, monto_asignado, estado_pago, fecha_pago })

const gasto = (id, fecha_gasto, monto_total, pagador_id, divisiones, grupo_id = 'g1') =>
  ({ id, grupo_id, fecha_gasto, monto_total, pagador_id, categoria: 'otro', origen_registro: 'manual', divisiones })

const grupos = [{ id: 'g1', miembros: [{ id: ME }, { id: 'u-a' }, { id: 'u-b' }] }]

const gastos = [
  // Mes en curso (hasta el día 13)
  gasto('e1', '2026-10-02', 300000, ME, [div(ME, 100000, 'pagado'), div('u-a', 100000, 'pagado', '2026-10-05'), div('u-b', 100000)]),
  gasto('e2', '2026-10-10', 90000, 'u-a', [div(ME, 30000), div('u-a', 30000, 'pagado'), div('u-b', 30000)]),
  // Mes anterior: el 12 entra en el corte, el 20 no
  gasto('e3', '2026-09-12', 240000, 'u-b', [div(ME, 80000, 'pagado', '2026-09-14'), div('u-a', 80000, 'pagado', '2026-09-15'), div('u-b', 80000, 'pagado')]),
  gasto('e4', '2026-09-20', 600000, 'u-a', [div(ME, 200000, 'pagado', '2026-09-25'), div('u-a', 200000, 'pagado'), div('u-b', 200000, 'pagado', '2026-09-30')]),
]

const kpi = (r, id) => r.kpis.find(k => k.id === id)

test('periodos: compara contra el mes anterior hasta el mismo día', () => {
  const p = periodos(HOY)
  assert.deepEqual(p.actual, { desde: '2026-10-01', hasta: '2026-10-13', periodo: '2026-10' })
  assert.deepEqual(p.anterior, { desde: '2026-09-01', hasta: '2026-09-13', periodo: '2026-09' })
})

test('periodos: el corte se ajusta a meses más cortos y al cambio de año', () => {
  assert.equal(periodos(new Date(2026, 2, 31)).anterior.hasta, '2026-02-28')
  assert.equal(periodos(new Date(2027, 0, 5)).anterior.desde, '2026-12-01')
})

test('variacion: sin base devuelve null', () => {
  assert.equal(variacion(100, 0), null)
  assert.equal(variacion(150, 100), 50)
})

test('gasto del mes y variación al mismo corte', () => {
  const r = calcularKpis(gastos, grupos, ME, { hoy: HOY })
  const k = kpi(r, 'gasto_mes')
  assert.equal(k.valor, 390000)
  assert.equal(k.anterior, 240000) // solo e3; e4 (día 20) queda fuera del corte
  assert.equal(k.variacion, 62.5)
  assert.equal(k.estado, 'critico') // subió más de 15 %
})

test('conteo, ticket promedio y gasto por integrante', () => {
  const r = calcularKpis(gastos, grupos, ME, { hoy: HOY })
  assert.equal(kpi(r, 'num_gastos').valor, 2)
  assert.equal(kpi(r, 'ticket_promedio').valor, 195000)
  assert.equal(kpi(r, 'gasto_integrante').valor, 130000)
})

test('cartera: excluye la parte del pagador', () => {
  const r = calcularKpis(gastos, grupos, ME, { hoy: HOY })
  // Deudas (sin pagador): 100k+100k+30k+30k+80k+80k+200k+200k = 820k; pendientes: 100k+30k+30k = 160k
  assert.equal(kpi(r, 'cartera_pendiente').valor, 160000)
  const tasa = kpi(r, 'tasa_recaudo')
  assert.ok(Math.abs(tasa.valor - (660000 / 820000) * 100) < 1e-9)
  assert.equal(tasa.estado, 'ok') // 80,5 % ≥ 80 %
  // Antigüedad: e1 lleva 11 días (1 parte) y e2 lleva 3 días (2 partes) -> (11+3+3)/3
  assert.ok(Math.abs(kpi(r, 'antiguedad_cartera').valor - 17 / 3) < 1e-9)
  assert.equal(kpi(r, 'antiguedad_cartera').estado, 'ok')
})

test('posición personal', () => {
  const r = calcularKpis(gastos, grupos, ME, { hoy: HOY })
  assert.equal(r.resumen.me_deben, 100000) // u-b en e1
  assert.equal(r.resumen.debo, 30000)      // mi parte de e2
  assert.ok(Math.abs(kpi(r, 'mi_participacion').valor - (300000 / 390000) * 100) < 1e-9)
})

test('sin datos: los KPIs no fallan y quedan como informativos', () => {
  const r = calcularKpis([], [], ME, { hoy: HOY })
  assert.equal(kpi(r, 'gasto_mes').valor, 0)
  assert.equal(kpi(r, 'gasto_mes').estado, 'neutro')
  assert.equal(kpi(r, 'tasa_recaudo').valor, null)
  assert.equal(kpi(r, 'antiguedad_cartera').estado, 'neutro')
})

test('gasto que baja respecto al mes anterior queda en meta', () => {
  const pocos = [gasto('x1', '2026-10-03', 100000, ME, []), gasto('x2', '2026-09-03', 200000, ME, [])]
  assert.equal(kpi(calcularKpis(pocos, grupos, ME, { hoy: HOY }), 'gasto_mes').estado, 'ok')
})

test('modelos de análisis existentes: indicadores, estimadores y proyección', () => {
  const r = analizar(gastos, ME, { horizonte: 3, hoy: HOY })
  assert.equal(r.indicadores.num_gastos, 4)
  assert.equal(r.estimadores.proyeccion.length, 3)
  assert.equal(r.estimadores.proyeccion[0].periodo, '2026-11')
  assert.ok(r.estimadores.metodos.some(m => m.id === 'suavizado'))
})

test('media móvil: usa los gastos de los últimos siete días y los extrapola al mes', () => {
  const r = analizar(gastos, ME, { horizonte: 3, hoy: HOY })
  const metodo = r.estimadores.metodos.find(m => m.id === 'media_movil')
  assert.equal(metodo.valor, (90000 / 7) * 31)
  assert.equal(metodo.nota, 'Gasto de los últimos 7 días, extrapolado al mes')
})
