/**
 * Puerto de salida del modelo de lenguaje.
 *
 * La capa de aplicacion razona en terminos de "turnos" y "herramientas",
 * nunca en terminos de un proveedor concreto. Cambiar de OpenAI a Groq,
 * Gemini o un modelo local solo requiere escribir otro adaptador que
 * implemente esta interfaz, sin tocar el agente ni las herramientas.
 */

/** Declaracion de una herramienta que el modelo puede invocar. */
export interface DefinicionHerramienta {
  nombre: string;
  descripcion: string;
  /** Esquema JSON de los parametros (subconjunto de JSON Schema). */
  parametros: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/** Peticion del modelo para ejecutar una herramienta. */
export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  /** Argumentos ya deserializados; su forma la valida la herramienta. */
  argumentos: Record<string, unknown>;
}

/** Un turno del dialogo tal como lo ve el modelo. */
export type TurnoModelo =
  | { tipo: 'usuario'; contenido: string }
  | { tipo: 'asistente'; contenido: string | null; llamadas?: LlamadaHerramienta[] }
  | { tipo: 'herramienta'; idLlamada: string; nombre: string; resultado: string };

export interface EntradaModelo {
  /** Prompt de sistema: identidad, reglas y base de conocimiento. */
  instrucciones: string;
  turnos: TurnoModelo[];
  herramientas: DefinicionHerramienta[];
}

export interface RespuestaModelo {
  /** Texto para el usuario, o null si el modelo solo pidio herramientas. */
  texto: string | null;
  llamadas: LlamadaHerramienta[];
}

export interface AsistenteIA {
  /** true cuando hay credenciales configuradas y se puede llamar al modelo. */
  disponible(): boolean;
  generar(entrada: EntradaModelo): Promise<RespuestaModelo>;
}
