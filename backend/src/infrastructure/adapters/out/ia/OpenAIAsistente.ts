import {
  AsistenteIA,
  EntradaModelo,
  LlamadaHerramienta,
  RespuestaModelo,
  TurnoModelo,
} from '../../../../domain/ports/out/AsistenteIA';

/**
 * Adaptador de salida hacia un modelo de lenguaje compatible con la API de
 * Chat Completions de OpenAI.
 *
 * Se usa `fetch` nativo (Node 22) en lugar del SDK oficial para no añadir
 * dependencias al proyecto y para que el contrato HTTP quede a la vista.
 * Al ser una API ampliamente replicada, el mismo adaptador sirve para otros
 * proveedores compatibles cambiando solo IA_BASE_URL y IA_MODELO
 * (por ejemplo Groq: https://api.groq.com/openai/v1).
 */

interface MensajeApi {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

interface RespuestaApi {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  error?: { message?: string; type?: string };
}

export interface OpcionesOpenAIAsistente {
  apiKey?: string;
  baseUrl: string;
  modelo: string;
  temperatura: number;
  maxTokens: number;
  timeoutMs: number;
}

function aMensajeApi(turno: TurnoModelo): MensajeApi {
  if (turno.tipo === 'usuario') {
    return { role: 'user', content: turno.contenido };
  }
  if (turno.tipo === 'herramienta') {
    return { role: 'tool', content: turno.resultado, tool_call_id: turno.idLlamada };
  }
  const mensaje: MensajeApi = { role: 'assistant', content: turno.contenido };
  if (turno.llamadas?.length) {
    mensaje.tool_calls = turno.llamadas.map((llamada) => ({
      id: llamada.id,
      type: 'function' as const,
      function: { name: llamada.nombre, arguments: JSON.stringify(llamada.argumentos) },
    }));
  }
  return mensaje;
}

/**
 * Diferencias entre familias de modelos que solo se descubren al llamar.
 *
 * Los modelos recientes de OpenAI (GPT-5 en adelante) renombraron
 * `max_tokens` a `max_completion_tokens` y algunos rechazan `temperature`
 * distinta de la suya por defecto. Los modelos anteriores y los
 * proveedores compatibles, como Groq, siguen usando los nombres viejos.
 *
 * En lugar de obligar a configurarlo a mano, el adaptador empieza con la
 * convencion nueva y se corrige solo leyendo el error del proveedor, que
 * dice exactamente que parametro sobra. La correccion se recuerda en la
 * instancia, asi que el ajuste se paga una vez por arranque.
 */
interface AjustesCompatibilidad {
  parametroTokens: 'max_completion_tokens' | 'max_tokens';
  enviarTemperatura: boolean;
  /**
   * Los modelos de razonamiento recientes rechazan las herramientas en
   * /chat/completions salvo que se desactive el razonamiento. null = no
   * enviar el parametro, que es lo correcto para los demas proveedores.
   */
  esfuerzoRazonamiento: 'none' | null;
}

/** Intentos maximos por mensaje: el original mas las correcciones. */
const MAX_INTENTOS = 5;

export class OpenAIAsistente implements AsistenteIA {
  private readonly ajustes: AjustesCompatibilidad = {
    parametroTokens: 'max_completion_tokens',
    enviarTemperatura: true,
    esfuerzoRazonamiento: null,
  };

  /**
   * Correcciones ya aplicadas. Impide repetir una y quedar oscilando entre
   * dos configuraciones cuando el proveedor devuelve errores contradictorios.
   */
  private readonly aplicadas = new Set<string>();

  constructor(private readonly opciones: OpcionesOpenAIAsistente) {}

  disponible(): boolean {
    return Boolean(this.opciones.apiKey);
  }

  /** Ajustes vigentes; expuesto para diagnostico y pruebas. */
  compatibilidad(): Readonly<AjustesCompatibilidad> {
    return { ...this.ajustes };
  }

  async generar(entrada: EntradaModelo): Promise<RespuestaModelo> {
    const mensajes: MensajeApi[] = [
      { role: 'system', content: entrada.instrucciones },
      ...entrada.turnos.map(aMensajeApi),
    ];

    const herramientas = entrada.herramientas.map((herramienta) => ({
      type: 'function' as const,
      function: {
        name: herramienta.nombre,
        description: herramienta.descripcion,
        parameters: herramienta.parametros,
      },
    }));

    let ultimoEstado = 0;

    for (let intento = 0; intento < MAX_INTENTOS; intento += 1) {
      const cuerpo: Record<string, unknown> = {
        model: this.opciones.modelo,
        messages: mensajes,
        tools: herramientas,
        tool_choice: 'auto',
        [this.ajustes.parametroTokens]: this.opciones.maxTokens,
      };
      if (this.ajustes.enviarTemperatura) {
        cuerpo.temperature = this.opciones.temperatura;
      }
      if (this.ajustes.esfuerzoRazonamiento) {
        cuerpo.reasoning_effort = this.ajustes.esfuerzoRazonamiento;
      }

      const { respuesta, datos } = await this.enviar(cuerpo);

      if (respuesta.ok) {
        const mensaje = datos.choices?.[0]?.message;
        const llamadas: LlamadaHerramienta[] = (mensaje?.tool_calls ?? [])
          .filter((llamada) => Boolean(llamada.function?.name))
          .map((llamada, indice) => ({
            id: llamada.id ?? `llamada_${indice}`,
            nombre: llamada.function!.name!,
            argumentos: parsearArgumentos(llamada.function?.arguments),
          }));
        return { texto: mensaje?.content ?? null, llamadas };
      }

      ultimoEstado = respuesta.status;

      // Solo se reintenta si el proveedor señala un parametro corregible.
      const corregido =
        respuesta.status === 400 && this.corregirParametro(datos.error?.message ?? '');

      if (!corregido) {
        // No se propaga el mensaje del proveedor al usuario final: podria
        // contener detalles de la cuenta o de la clave.
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            type: 'llm_request_failed',
            status: respuesta.status,
            errorType: datos.error?.type,
          }),
        );
        throw new Error(`El modelo respondio con estado ${respuesta.status}.`);
      }

      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          type: 'llm_parameter_adjusted',
          parametroTokens: this.ajustes.parametroTokens,
          enviarTemperatura: this.ajustes.enviarTemperatura,
          esfuerzoRazonamiento: this.ajustes.esfuerzoRazonamiento,
        }),
      );
    }

    throw new Error(`El modelo respondio con estado ${ultimoEstado}.`);
  }

  private async enviar(
    cuerpo: Record<string, unknown>,
  ): Promise<{ respuesta: Response; datos: RespuestaApi }> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.opciones.timeoutMs);

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.opciones.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opciones.apiKey ?? ''}`,
        },
        body: JSON.stringify(cuerpo),
        signal: controlador.signal,
      });
    } catch (error) {
      const abortada = error instanceof Error && error.name === 'AbortError';
      throw new Error(
        abortada ? 'El modelo no respondio a tiempo.' : 'No fue posible contactar al modelo.',
      );
    } finally {
      clearTimeout(temporizador);
    }

    const datos = (await respuesta.json().catch(() => ({}))) as RespuestaApi;
    return { respuesta, datos };
  }

  /**
   * Lee el mensaje de error del proveedor y ajusta el cuerpo si describe un
   * parametro no soportado. Devuelve true solo si cambio algo, para que el
   * reintento no repita la misma peticion.
   */
  private corregirParametro(mensaje: string): boolean {
    const texto = mensaje.toLowerCase();

    // "Function tools with reasoning_effort are not supported ... set
    //  reasoning_effort to 'none'": el modelo razona por defecto y hay que
    //  desactivarlo para poder usar herramientas.
    if (texto.includes('reasoning_effort')) {
      const pideDesactivar = texto.includes("reasoning_effort to 'none'");
      const destino: AjustesCompatibilidad['esfuerzoRazonamiento'] = pideDesactivar ? 'none' : null;
      if (this.registrar(`razonamiento:${destino ?? 'off'}`)) {
        this.ajustes.esfuerzoRazonamiento = destino;
        return true;
      }
    }

    const mencionaTokens = texto.includes('max_tokens') || texto.includes('max_completion_tokens');
    if (mencionaTokens) {
      // "'max_tokens' is not supported with this model. Use
      //  'max_completion_tokens' instead" y su equivalente a la inversa.
      const pideNuevo = texto.includes("use 'max_completion_tokens'");
      const pideViejo = texto.includes("use 'max_tokens'");
      const destino: AjustesCompatibilidad['parametroTokens'] = pideNuevo
        ? 'max_completion_tokens'
        : pideViejo
          ? 'max_tokens'
          : this.ajustes.parametroTokens === 'max_completion_tokens'
            ? 'max_tokens'
            : 'max_completion_tokens';

      if (destino !== this.ajustes.parametroTokens && this.registrar(`tokens:${destino}`)) {
        this.ajustes.parametroTokens = destino;
        return true;
      }
    }

    // "Unsupported value: 'temperature' does not support 0.3 with this model"
    if (texto.includes('temperature') && this.ajustes.enviarTemperatura) {
      if (this.registrar('temperatura:off')) {
        this.ajustes.enviarTemperatura = false;
        return true;
      }
    }

    return false;
  }

  /** Devuelve false si esta correccion ya se intento antes. */
  private registrar(clave: string): boolean {
    if (this.aplicadas.has(clave)) return false;
    this.aplicadas.add(clave);
    return true;
  }
}

/**
 * Los argumentos llegan como cadena JSON generada por el modelo, que
 * ocasionalmente viene vacia o mal formada. En ese caso se devuelve un
 * objeto vacio y la validacion de la herramienta pedira la correccion.
 */
function parsearArgumentos(bruto: string | undefined): Record<string, unknown> {
  if (!bruto) return {};
  try {
    const valor: unknown = JSON.parse(bruto);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
