import { OpenAIAsistente } from '../../src/infrastructure/adapters/out/ia/OpenAIAsistente';
import { EntradaModelo } from '../../src/domain/ports/out/AsistenteIA';

/**
 * Pruebas del adaptador del modelo. Se sustituye `fetch` por un doble, de
 * modo que se verifica el cuerpo que se envia y la correccion automatica
 * de parametros sin salir a la red ni gastar tokens.
 */
describe('OpenAIAsistente', () => {
  const entrada: EntradaModelo = {
    instrucciones: 'Eres soporte.',
    turnos: [{ tipo: 'usuario', contenido: '¿Como creo un grupo?' }],
    herramientas: [
      {
        nombre: 'crear_ticket',
        descripcion: 'Abre un ticket.',
        parametros: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
  };

  const opciones = {
    apiKey: 'clave-de-prueba',
    baseUrl: 'https://api.ejemplo.com/v1/',
    modelo: 'modelo-x',
    temperatura: 0.3,
    maxTokens: 700,
    timeoutMs: 5000,
  };

  const respuestaOk = (contenido: string | null, toolCalls?: unknown[]) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: contenido, tool_calls: toolCalls } }],
    }),
  });

  const respuestaError = (status: number, message: string) => ({
    ok: false,
    status,
    json: async () => ({ error: { message, type: 'invalid_request_error' } }),
  });

  /** Cuerpos enviados en cada llamada, ya deserializados. */
  function cuerposDe(mock: jest.Mock): Record<string, unknown>[] {
    return mock.mock.calls.map((llamada) => JSON.parse(llamada[1].body as string));
  }

  let fetchMock: jest.Mock;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('no esta disponible sin clave', () => {
    expect(new OpenAIAsistente({ ...opciones, apiKey: undefined }).disponible()).toBe(false);
    expect(new OpenAIAsistente(opciones).disponible()).toBe(true);
  });

  it('normaliza la URL y manda la clave en la cabecera', async () => {
    fetchMock.mockResolvedValueOnce(respuestaOk('Listo.'));

    await new OpenAIAsistente(opciones).generar(entrada);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.ejemplo.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer clave-de-prueba');
  });

  it('empieza usando max_completion_tokens', async () => {
    fetchMock.mockResolvedValueOnce(respuestaOk('Listo.'));

    await new OpenAIAsistente(opciones).generar(entrada);

    const cuerpo = cuerposDe(fetchMock)[0]!;
    expect(cuerpo.max_completion_tokens).toBe(700);
    expect(cuerpo.max_tokens).toBeUndefined();
    expect(cuerpo.temperature).toBe(0.3);
  });

  it('cambia a max_tokens cuando el proveedor lo pide', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuestaError(400, "Unsupported parameter: 'max_completion_tokens'. Use 'max_tokens' instead."),
      )
      .mockResolvedValueOnce(respuestaOk('Listo.'));

    const adaptador = new OpenAIAsistente(opciones);
    const resultado = await adaptador.generar(entrada);

    expect(resultado.texto).toBe('Listo.');
    const cuerpos = cuerposDe(fetchMock);
    expect(cuerpos[1]!.max_tokens).toBe(700);
    expect(cuerpos[1]!.max_completion_tokens).toBeUndefined();
    expect(adaptador.compatibilidad().parametroTokens).toBe('max_tokens');
  });

  it('recuerda la correccion y no la repite en la siguiente llamada', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuestaError(400, "Unsupported parameter: 'max_completion_tokens'. Use 'max_tokens' instead."),
      )
      .mockResolvedValueOnce(respuestaOk('Uno.'))
      .mockResolvedValueOnce(respuestaOk('Dos.'));

    const adaptador = new OpenAIAsistente(opciones);
    await adaptador.generar(entrada);
    await adaptador.generar(entrada);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cuerposDe(fetchMock)[2]!.max_tokens).toBe(700);
  });

  it('deja de enviar temperature si el modelo no la admite', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuestaError(400, "Unsupported value: 'temperature' does not support 0.3 with this model."),
      )
      .mockResolvedValueOnce(respuestaOk('Listo.'));

    const adaptador = new OpenAIAsistente(opciones);
    await adaptador.generar(entrada);

    expect(cuerposDe(fetchMock)[1]!.temperature).toBeUndefined();
    expect(adaptador.compatibilidad().enviarTemperatura).toBe(false);
  });

  it('desactiva el razonamiento cuando el modelo no admite herramientas con el activo', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuestaError(
          400,
          "Function tools with reasoning_effort are not supported for gpt-6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
        ),
      )
      .mockResolvedValueOnce(respuestaOk('Listo.'));

    const adaptador = new OpenAIAsistente(opciones);
    await adaptador.generar(entrada);

    expect(cuerposDe(fetchMock)[0]!.reasoning_effort).toBeUndefined();
    expect(cuerposDe(fetchMock)[1]!.reasoning_effort).toBe('none');
    expect(adaptador.compatibilidad().esfuerzoRazonamiento).toBe('none');
  });

  it('no entra en bucle si el proveedor se contradice sobre el mismo parametro', async () => {
    fetchMock
      .mockResolvedValue(
        respuestaError(400, "Unsupported parameter: 'reasoning_effort' is not supported."),
      );

    await expect(new OpenAIAsistente(opciones).generar(entrada)).rejects.toThrow('estado 400');
    // Un intento inicial y uno tras la unica correccion posible.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('corrige los dos parametros si el proveedor se queja de ambos', async () => {
    fetchMock
      .mockResolvedValueOnce(
        respuestaError(400, "'max_completion_tokens' is not supported. Use 'max_tokens' instead."),
      )
      .mockResolvedValueOnce(
        respuestaError(400, "Unsupported value: 'temperature' does not support 0.3."),
      )
      .mockResolvedValueOnce(respuestaOk('Listo.'));

    const adaptador = new OpenAIAsistente(opciones);
    await adaptador.generar(entrada);

    const ultimo = cuerposDe(fetchMock)[2]!;
    expect(ultimo.max_tokens).toBe(700);
    expect(ultimo.temperature).toBeUndefined();
  });

  it('no reintenta ante un error que no sea de parametros', async () => {
    fetchMock.mockResolvedValueOnce(respuestaError(401, 'Incorrect API key provided.'));

    await expect(new OpenAIAsistente(opciones).generar(entrada)).rejects.toThrow('estado 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no filtra el mensaje del proveedor al propagar el error', async () => {
    fetchMock.mockResolvedValueOnce(
      respuestaError(401, 'Incorrect API key provided: sk-secreto-123.'),
    );

    await expect(new OpenAIAsistente(opciones).generar(entrada)).rejects.not.toThrow(/sk-secreto/);
  });

  it('traduce las llamadas a herramientas del proveedor', async () => {
    fetchMock.mockResolvedValueOnce(
      respuestaOk(null, [
        { id: 'call_7', function: { name: 'crear_ticket', arguments: '{"categoria":"gastos"}' } },
      ]),
    );

    const resultado = await new OpenAIAsistente(opciones).generar(entrada);

    expect(resultado.texto).toBeNull();
    expect(resultado.llamadas).toEqual([
      { id: 'call_7', nombre: 'crear_ticket', argumentos: { categoria: 'gastos' } },
    ]);
  });

  it('tolera argumentos mal formados devolviendo un objeto vacio', async () => {
    fetchMock.mockResolvedValueOnce(
      respuestaOk(null, [{ id: 'call_8', function: { name: 'crear_ticket', arguments: '{rota' } }]),
    );

    const resultado = await new OpenAIAsistente(opciones).generar(entrada);

    expect(resultado.llamadas[0]!.argumentos).toEqual({});
  });

  it('convierte los turnos de herramienta al formato del proveedor', async () => {
    fetchMock.mockResolvedValueOnce(respuestaOk('Hecho.'));

    await new OpenAIAsistente(opciones).generar({
      ...entrada,
      turnos: [
        { tipo: 'usuario', contenido: 'Un gasto no cuadra' },
        {
          tipo: 'asistente',
          contenido: null,
          llamadas: [{ id: 'call_1', nombre: 'crear_ticket', argumentos: { categoria: 'gastos' } }],
        },
        { tipo: 'herramienta', idLlamada: 'call_1', nombre: 'crear_ticket', resultado: 'FT-2026-0001' },
      ],
    });

    const mensajes = cuerposDe(fetchMock)[0]!.messages as Record<string, unknown>[];
    expect(mensajes[0]).toEqual({ role: 'system', content: 'Eres soporte.' });
    expect(mensajes[2]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_1' }] });
    expect(mensajes[3]).toEqual({
      role: 'tool',
      content: 'FT-2026-0001',
      tool_call_id: 'call_1',
    });
  });

  it('avisa con un mensaje claro si el modelo no responde a tiempo', async () => {
    const abortada = Object.assign(new Error('abortada'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abortada);

    await expect(new OpenAIAsistente(opciones).generar(entrada)).rejects.toThrow(
      'El modelo no respondio a tiempo.',
    );
  });
});
