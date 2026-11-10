export const RESPUESTA_SIN_COINCIDENCIA =
  'Todavía no tengo una respuesta para esa pregunta. Puedo orientarte sobre grupos, integrantes, gastos, divisiones, pagos, balances, historial, análisis, escaneo de recibos y tu perfil.'

const normalizar = texto => texto
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[¿?¡!.,;:]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const temas = [
  {
    palabras: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches'],
    respuesta: '¡Hola! Puedo ayudarte con el uso de FT. GROUP. Pregúntame cómo crear grupos, registrar gastos o consultar tus balances.',
  },
  {
    palabras: ['crear grupo', 'crear un grupo', 'creo un grupo', 'nuevo grupo', 'grupo nuevo'],
    respuesta: 'Abre «Grupos» en el menú y pulsa «Crear grupo». Escribe un nombre y guarda. Después podrás añadir integrantes que ya tengan una cuenta en FT. GROUP.',
  },
  {
    palabras: ['agregar integrante', 'anadir integrante', 'invitar integrante', 'agregar miembro', 'anadir miembro'],
    respuesta: 'Entra en «Grupos», abre el grupo y elige la opción para agregar integrantes. Debes usar el correo asociado a una cuenta registrada.',
  },
  {
    palabras: ['registrar gasto', 'crear gasto', 'anadir gasto', 'nuevo gasto', 'registrar un gasto'],
    respuesta: 'Ve a «Gastos» y selecciona «Agregar gasto». Elige el grupo, completa la descripción, el monto, la fecha y la categoría; después define cómo se divide.',
  },
  {
    palabras: ['dividir gasto', 'divido un gasto', 'division', 'partes iguales', 'division equitativa', 'division personalizada'],
    respuesta: 'Al registrar el gasto puedes elegir una división equitativa para repartirlo por igual, o una división personalizada para indicar cuánto corresponde a cada integrante.',
  },
  {
    palabras: ['registrar pago', 'registro un pago', 'marcar pagado', 'pagar deuda', 'anotar pago', 'hacer un pago'],
    respuesta: 'En «Gastos», abre el gasto correspondiente y registra el pago de la parte pendiente. El balance se actualizará con el estado del pago.',
  },
  {
    palabras: ['mi balance', 'balance', 'cuanto debo', 'cuanto me deben', 'saldo'],
    respuesta: 'Consulta «Panel» para ver tu balance neto, cuánto debes y cuánto te deben. En «Grupos» también puedes revisar el balance de cada grupo.',
  },
  {
    palabras: ['historial', 'movimientos anteriores', 'gastos anteriores'],
    respuesta: 'Abre «Historial» para consultar los movimientos y filtrar por mes, grupo o categoría.',
  },
  {
    palabras: ['analisis', 'proyeccion', 'indicadores', 'predicciones'],
    respuesta: 'La sección «Análisis» presenta indicadores y proyecciones calculados a partir de los gastos que puedes consultar en la aplicación.',
  },
  {
    palabras: ['escanear recibo', 'escaneo un recibo', 'escanear factura', 'ocr', 'foto del recibo', 'leer recibo'],
    respuesta: 'Abre «Escanear» para tomar una foto o cargar un recibo. El reconocimiento prellena algunos campos; revisa y corrige los datos antes de guardar. El primer uso del OCR necesita conexión a internet.',
  },
  {
    palabras: ['cambiar perfil', 'editar perfil', 'actualizar perfil', 'cambiar nombre', 'cerrar sesion'],
    respuesta: 'Entra en «Mi perfil» desde el menú de usuario para editar tus datos o cerrar sesión.',
  },
  {
    palabras: ['crear cuenta', 'registrarme', 'iniciar sesion', 'no puedo entrar', 'olvide mi contrasena'],
    respuesta: 'Usa «Crear cuenta» en la pantalla de acceso para registrarte. Si ya tienes cuenta, vuelve a «Iniciar sesión». Si olvidaste tu contraseña, contacta al administrador del sistema para recibir ayuda.',
  },
]

export function obtenerRespuestaChatbot(pregunta) {
  const texto = normalizar(pregunta)
  if (!texto) return RESPUESTA_SIN_COINCIDENCIA

  const tema = temas.find(({ palabras }) => palabras.some(palabra => texto.includes(normalizar(palabra))))
  return tema?.respuesta ?? RESPUESTA_SIN_COINCIDENCIA
}
