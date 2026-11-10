import assert from 'node:assert/strict'
import { test } from 'node:test'
import { netBalances, pairwise, pendingDebts, simplify, splitEqual } from '../src/utils/balances.js'

test('splitEqual reparte sin perder ni inventar pesos', () => {
  for (const [total, n] of [[100000, 3], [10, 3], [1, 4], [99999, 7], [0, 2]]) {
    const ids = Array.from({ length: n }, (_, i) => `u${i}`)
    const partes = splitEqual(total, ids)
    assert.equal(partes.reduce((s, p) => s + p.monto_asignado, 0), total)
    const montos = partes.map(p => p.monto_asignado)
    assert.ok(Math.max(...montos) - Math.min(...montos) <= 1, 'la diferencia entre partes es como máximo 1 peso')
  }
  assert.deepEqual(splitEqual(100, []), [])
})

test('pendingDebts ignora lo pagado y la parte del propio pagador', () => {
  const gastos = [{ id: 'g1', grupo_id: 'a', pagador_id: 'ana' }]
  const divisiones = [
    { gasto_id: 'g1', usuario_id: 'ana', monto_asignado: 100, estado_pago: 'pendiente' },
    { gasto_id: 'g1', usuario_id: 'beto', monto_asignado: 100, estado_pago: 'pendiente' },
    { gasto_id: 'g1', usuario_id: 'carla', monto_asignado: 100, estado_pago: 'pagado' },
    { gasto_id: 'otro', usuario_id: 'beto', monto_asignado: 999, estado_pago: 'pendiente' },
  ]
  assert.deepEqual(pendingDebts(gastos, divisiones), [
    { grupo_id: 'a', gasto_id: 'g1', deudor_id: 'beto', acreedor_id: 'ana', monto: 100 },
  ])
})

test('netBalances suma cero: lo que unos deben es lo que otros reciben', () => {
  const net = netBalances([
    { deudor_id: 'b', acreedor_id: 'a', monto: 300 },
    { deudor_id: 'c', acreedor_id: 'a', monto: 200 },
    { deudor_id: 'a', acreedor_id: 'c', monto: 50 },
  ])
  assert.deepEqual(net, { a: 450, b: -300, c: -150 })
  assert.equal(Object.values(net).reduce((s, v) => s + v, 0), 0)
})

test('pairwise compensa deudas cruzadas entre el mismo par', () => {
  const pares = pairwise([
    { deudor_id: 'b', acreedor_id: 'a', monto: 300 },
    { deudor_id: 'a', acreedor_id: 'b', monto: 100 },
    { deudor_id: 'c', acreedor_id: 'a', monto: 50 },
    { deudor_id: 'a', acreedor_id: 'c', monto: 50 },
  ])
  assert.deepEqual(pares, [{ de: 'b', para: 'a', monto: 200 }])
})

test('simplify liquida todos los saldos con el menor número de pagos', () => {
  const net = { a: 500, b: -300, c: -200, d: 0 }
  const pagos = simplify(net)
  assert.equal(pagos.length, 2)
  const saldo = { ...net }
  for (const p of pagos) { saldo[p.de] += p.monto; saldo[p.para] -= p.monto }
  assert.ok(Object.values(saldo).every(v => Math.abs(v) < 1))
})
