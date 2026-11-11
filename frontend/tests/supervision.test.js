import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leerFinanzasDemoLocal } from '../src/utils/supervision.js'

function guardarDemo(usuarioId, state) {
  const valores = new Map([[`ft_finanzas_${usuarioId}`, JSON.stringify(state)]])
  globalThis.localStorage = {
    getItem: key => valores.get(key) ?? null,
  }
}

test('supervision muestra datos locales de demostracion solo para la cuenta demo', () => {
  guardarDemo('7', {
    demo: true,
    usuarios: [{ id: '7', nombre: 'Carlos Usuario' }, { id: '8', nombre: 'Ana' }],
    grupos: [{ id: 'g-1', nombre: 'Casa', estado: 'activo', fecha_creacion: '2026-10-01' }],
    miembros: [{ grupo_id: 'g-1', usuario_id: '7', rol: 'administrador' }],
    gastos: [
      { id: 'e-1', grupo_id: 'g-1', pagador_id: '7', descripcion: 'Arriendo', monto_total: 100, fecha_gasto: '2026-11-02', categoria: 'vivienda' },
      { id: 'e-2', grupo_id: 'g-1', pagador_id: '8', descripcion: 'Mercado', monto_total: 60, fecha_gasto: '2026-11-03', categoria: 'alimentacion' },
    ],
    divisiones: [
      { gasto_id: 'e-1', usuario_id: '7', monto_asignado: 50, estado_pago: 'pagado' },
      { gasto_id: 'e-2', usuario_id: '7', monto_asignado: 30, estado_pago: 'pendiente' },
    ],
  })

  const finance = leerFinanzasDemoLocal('7', 'USUARIO@FTGROUP.TEST', { limite: 1, offset: 0 })

  assert.equal(finance.origenDatos, 'demo_local')
  assert.equal(finance.usuario.nombre, 'Carlos Usuario')
  assert.equal(finance.resumen.grupos, 1)
  assert.equal(finance.resumen.gastos, 2)
  assert.equal(finance.resumen.montoPagado, '100')
  assert.equal(finance.resumen.montoAsignado, '80')
  assert.equal(finance.resumen.montoPendiente, '30')
  assert.equal(finance.grupos[0].numeroGastos, 2)
  assert.equal(finance.gastos.length, 1)
  assert.equal(finance.gastos[0].descripcion, 'Mercado')
  assert.equal(finance.paginacion.total, 2)
})

test('no expone datos locales si la cuenta no es demo o el almacenamiento no lo marca como demo', () => {
  guardarDemo('7', { demo: true })
  assert.equal(leerFinanzasDemoLocal('7', 'carlos@example.com'), null)

  guardarDemo('7', { demo: false })
  assert.equal(leerFinanzasDemoLocal('7', 'usuario@ftgroup.test'), null)
})
