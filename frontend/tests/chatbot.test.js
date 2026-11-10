import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obtenerRespuestaChatbot, RESPUESTA_SIN_COINCIDENCIA } from '../src/utils/chatbot.js'

test('chatbot reconoce preguntas frecuentes ignorando mayúsculas y tildes', () => {
  assert.match(obtenerRespuestaChatbot('¿CÓMO CREO UN GRUPO?'), /Grupos/)
  assert.match(obtenerRespuestaChatbot('¿Cómo divido un gasto?'), /equitativa/)
  assert.match(obtenerRespuestaChatbot('¿Cómo registro un pago?'), /Gastos/)
})

test('chatbot responde a saludos y explica sus temas cuando no reconoce la pregunta', () => {
  assert.match(obtenerRespuestaChatbot('hola'), /¡Hola!/)
  assert.equal(obtenerRespuestaChatbot('cuéntame algo sin relación'), RESPUESTA_SIN_COINCIDENCIA)
})

test('chatbot orienta sobre el escaneo y el historial', () => {
  assert.match(obtenerRespuestaChatbot('¿Cómo escaneo un recibo?'), /Escanear/)
  assert.match(obtenerRespuestaChatbot('¿Dónde veo el historial?'), /Historial/)
})
