import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

register('./helpers/resolverSinExtension.mjs', import.meta.url)
const { extractFields } = await import('../src/services/ocr.js')

const RECIBO = `ALMACENES EXITO S.A.
NIT 890.900.608-9
Calle 10 # 43-20 Medellin
Fecha: 18/10/2026 14:32
LECHE ENTERA 1L        4.900
ARROZ DIANA 5KG       24.900
SUBTOTAL              73.487
IVA                   13.963
TOTAL A PAGAR       $ 87.450
EFECTIVO           $ 100.000`

test('OCR: toma el TOTAL y no el subtotal ni el efectivo recibido', () => {
  assert.equal(extractFields(RECIBO).monto, 87450)
})

test('OCR: interpreta fechas colombianas día/mes/año y formato ISO', () => {
  assert.equal(extractFields(RECIBO).fecha, '2026-10-18')
  assert.equal(extractFields('Taxi\n2026-03-05\nTOTAL 12.000').fecha, '2026-03-05')
  assert.equal(extractFields('Cafe\n05-03-26\nTOTAL 5.000').fecha, '2026-03-05')
})

test('OCR: identifica comercio y categoría', () => {
  const campos = extractFields(RECIBO)
  assert.equal(campos.comercio, 'ALMACENES EXITO S.A.')
  assert.equal(campos.categoria, 'alimentacion')
  assert.equal(extractFields('TERPEL\nGasolina corriente\nTOTAL 80.000').categoria, 'transporte')
})

test('OCR: sin datos legibles devuelve valores seguros para llenar a mano', () => {
  const campos = extractFields('@@ ## ..')
  assert.equal(campos.monto, 0)
  assert.equal(campos.comercio, '')
  assert.equal(campos.categoria, 'otro')
  assert.match(campos.fecha, /^\d{4}-\d{2}-\d{2}$/)
})
