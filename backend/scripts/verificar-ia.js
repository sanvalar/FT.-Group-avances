/**
 * Verificador del asistente de soporte.
 *
 *   node scripts/verificar-ia.js            usa IA_MODELO del .env
 *   node scripts/verificar-ia.js gpt-6-luna prueba ese modelo concreto
 *
 * Comprueba tres cosas, en orden, y para en la primera que falle:
 *   1. Que la clave sirve y lista los modelos que admite la cuenta.
 *   2. Que el modelo responde por /chat/completions.
 *   3. Que el modelo sabe llamar herramientas, que es lo que necesita el
 *      agente para abrir tickets.
 *
 * Gasta unos pocos cientos de tokens: fracciones de centavo.
 */

require('dotenv').config();

const API_KEY = process.env.IA_API_KEY;
const BASE_URL = (process.env.IA_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MODELO = process.argv[2] || process.env.IA_MODELO || 'gpt-6-luna';

const ok = (t) => console.log(`  OK    ${t}`);
const fail = (t) => console.log(`  FALLA ${t}`);

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...(opciones.headers || {}),
    },
  });
  const datos = await respuesta.json().catch(() => ({}));
  return { estado: respuesta.status, ok: respuesta.ok, datos };
}

// Los modelos recientes usan max_completion_tokens; los anteriores y Groq,
// max_tokens. Algunos ademas rechazan una temperatura distinta de la suya.
// Se prueba la convencion nueva y se corrige segun lo que diga el error,
// igual que hace el adaptador del backend.
const ajustes = {
  parametroTokens: 'max_completion_tokens',
  enviarTemperatura: true,
  esfuerzoRazonamiento: null,
};

function resumenAjustes() {
  return `${ajustes.parametroTokens}, temperatura ${ajustes.enviarTemperatura ? 'si' : 'no'}` +
    `, reasoning_effort ${ajustes.esfuerzoRazonamiento ?? 'no se envia'}`;
}

async function chat(cuerpoBase) {
  const aplicadas = new Set();
  for (let intento = 0; intento < 5; intento += 1) {
    const cuerpo = { ...cuerpoBase, [ajustes.parametroTokens]: 200 };
    if (ajustes.enviarTemperatura) cuerpo.temperature = 0.3;
    if (ajustes.esfuerzoRazonamiento) cuerpo.reasoning_effort = ajustes.esfuerzoRazonamiento;

    const r = await pedir('/chat/completions', { method: 'POST', body: JSON.stringify(cuerpo) });
    if (r.ok || r.estado !== 400) return r;

    const texto = (r.datos?.error?.message || '').toLowerCase();
    let clave = null;
    if (texto.includes('reasoning_effort')) {
      const destino = texto.includes("reasoning_effort to 'none'") ? 'none' : null;
      clave = `razonamiento:${destino ?? 'off'}`;
      if (!aplicadas.has(clave)) ajustes.esfuerzoRazonamiento = destino;
    } else if (texto.includes("use 'max_completion_tokens'")) {
      clave = 'tokens:nuevo';
      if (!aplicadas.has(clave)) ajustes.parametroTokens = 'max_completion_tokens';
    } else if (texto.includes("use 'max_tokens'")) {
      clave = 'tokens:viejo';
      if (!aplicadas.has(clave)) ajustes.parametroTokens = 'max_tokens';
    } else if (texto.includes('temperature') && ajustes.enviarTemperatura) {
      clave = 'temperatura:off';
      if (!aplicadas.has(clave)) ajustes.enviarTemperatura = false;
    }

    if (!clave || aplicadas.has(clave)) return r;
    aplicadas.add(clave);
    console.log(`  ...ajustando: ${resumenAjustes()}`);
  }
  return { ok: false, estado: 400, datos: { error: { message: 'No se pudo ajustar la peticion.' } } };
}

async function main() {
  console.log(`\nProveedor : ${BASE_URL}`);
  console.log(`Modelo    : ${MODELO}\n`);

  if (!API_KEY) {
    fail('No hay IA_API_KEY en el .env. Agregala y vuelve a ejecutar.');
    process.exit(1);
  }

  // --- 1. La clave y el catalogo de modelos ---
  const modelos = await pedir('/models');
  if (!modelos.ok) {
    fail(`La clave no sirve o la cuenta no responde (HTTP ${modelos.estado}).`);
    if (modelos.datos?.error?.message) console.log(`        ${modelos.datos.error.message}`);
    process.exit(1);
  }
  ok('La clave funciona.');

  const disponibles = (modelos.datos.data || [])
    .map((m) => m.id)
    .filter((id) => /^(gpt|o\d|llama|qwen|mixtral|gemma|claude)/i.test(id))
    .sort();

  console.log('\n  Modelos de texto disponibles en tu cuenta:');
  for (const id of disponibles) console.log(`    - ${id}`);

  if (disponibles.length && !disponibles.includes(MODELO)) {
    console.log('');
    fail(`"${MODELO}" no aparece en la lista. Elige uno de arriba y ponlo en IA_MODELO.`);
  }

  // --- 2. Respuesta basica por /chat/completions ---
  console.log('');
  const prueba = await chat({
    model: MODELO,
    messages: [{ role: 'user', content: 'Responde unicamente con la palabra: listo' }],
  });

  if (!prueba.ok) {
    fail(`El modelo no respondio por /chat/completions (HTTP ${prueba.estado}).`);
    if (prueba.datos?.error?.message) console.log(`        ${prueba.datos.error.message}`);
    console.log('\n        Si el error dice que el modelo no existe, cambia IA_MODELO.');
    console.log('        Si dice que solo admite otro endpoint, avisame: el adaptador');
    console.log('        usa Chat Completions y habria que ajustarlo.');
    process.exit(1);
  }
  ok(`Responde por /chat/completions: "${(prueba.datos.choices?.[0]?.message?.content || '').trim()}"`);

  // --- 3. Llamada a herramientas ---
  const herramienta = await chat({
      model: MODELO,
      messages: [
        { role: 'system', content: 'Cuando el usuario reporte un problema, abre un ticket con la herramienta.' },
        { role: 'user', content: 'La division de un gasto no suma el total, ya revise dos veces.' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'crear_ticket',
            description: 'Abre un ticket de soporte.',
            parameters: {
              type: 'object',
              properties: {
                categoria: { type: 'string', enum: ['divisiones', 'gastos', 'otro'] },
                asunto: { type: 'string' },
              },
              required: ['categoria', 'asunto'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: 'auto',
  });

  if (!herramienta.ok) {
    fail(`El modelo rechazo la peticion con herramientas (HTTP ${herramienta.estado}).`);
    if (herramienta.datos?.error?.message) console.log(`        ${herramienta.datos.error.message}`);
    process.exit(1);
  }

  const llamadas = herramienta.datos.choices?.[0]?.message?.tool_calls || [];
  if (llamadas.length === 0) {
    fail('El modelo contesto pero no llamo a la herramienta.');
    console.log('        Puede ser que este modelo no soporte tool calling, o que');
    console.log('        simplemente decidiera no usarla. Prueba con otro modelo.');
    process.exit(1);
  }

  ok(`Llama herramientas: ${llamadas[0].function.name}(${llamadas[0].function.arguments})`);
  console.log(`\n  Parametros que admite este modelo: ${resumenAjustes()}.`);
  console.log('  El backend los detecta solo, no hay que configurar nada.');
  console.log('\nTodo listo. El agente puede resolver dudas y abrir tickets.\n');
}

main().catch((error) => {
  fail(`Error inesperado: ${error.message}`);
  process.exit(1);
});
