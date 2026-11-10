import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arrayFromResponse } from '../src/utils/apiResponse.js'
import { isDemoFinanceAccount, usesLocalFinance } from '../src/utils/demoAccount.js'

test('acepta listas directas y listas envueltas por el backend', () => {
  const items = [{ id: 1 }]
  assert.equal(arrayFromResponse(items, ['grupos'], '/grupos'), items)
  assert.equal(arrayFromResponse({ grupos: items }, ['grupos'], '/grupos'), items)
})

test('acepta los nombres alternativos definidos para una lista', () => {
  const items = [{ id: 1 }]
  assert.equal(arrayFromResponse({ movimientos: items }, ['historial', 'movimientos'], '/historial'), items)
})

test('informa claramente cuando la respuesta no contiene una lista', () => {
  assert.throws(
    () => arrayFromResponse({ grupos: { items: [] } }, ['grupos'], '/grupos'),
    /lista inválida para \/grupos/,
  )
})

test('detecta la cuenta común de demostración sin afectar las demás cuentas', () => {
  assert.equal(isDemoFinanceAccount({ email: 'usuario@ftgroup.test' }), true)
  assert.equal(isDemoFinanceAccount({ email: ' Usuario@FTGROUP.TEST ' }), true)
  assert.equal(isDemoFinanceAccount({ email: 'otra@ftgroup.test' }), false)
  assert.equal(isDemoFinanceAccount(null), false)
})

test('activa datos locales solo para la cuenta de exposición o el modo local explícito', () => {
  assert.equal(usesLocalFinance({ email: 'usuario@ftgroup.test' }, 'api'), true)
  assert.equal(usesLocalFinance({ email: 'otra@ftgroup.test' }, 'api'), false)
  assert.equal(usesLocalFinance({ email: 'otra@ftgroup.test' }, 'local'), true)
})
