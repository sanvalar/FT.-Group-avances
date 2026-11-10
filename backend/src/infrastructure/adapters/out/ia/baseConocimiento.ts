import fs from 'fs';
import path from 'path';

/**
 * Carga del manual de usuario como base de conocimiento del asistente.
 *
 * El manual completo (unas 2.800 palabras) entra holgadamente en la ventana
 * de contexto del modelo, asi que se inyecta entero en el prompt de sistema.
 * No se usa busqueda semantica ni embeddings: con un documento de este
 * tamano, inyectarlo completo es mas barato y mas fiable que recuperar
 * fragmentos, y elimina el riesgo de que el modelo responda sin ver la
 * seccion pertinente.
 *
 * Mantener sincronizado: si cambia knowledge/MANUAL_USUARIO.md, el asistente
 * cambia con el. Reiniciar el servidor para recargarlo.
 */

const NOMBRE_ARCHIVO = 'MANUAL_USUARIO.md';

/**
 * Rutas candidatas, en orden. Cubre `npm run dev` (ts-node desde backend/),
 * `npm start` (node dist/ desde backend/) y la ejecucion de pruebas.
 */
function rutasCandidatas(): string[] {
  return [
    path.join(process.cwd(), 'knowledge', NOMBRE_ARCHIVO),
    path.join(__dirname, '..', '..', '..', '..', '..', 'knowledge', NOMBRE_ARCHIVO),
    path.join(__dirname, '..', '..', '..', '..', '..', '..', 'knowledge', NOMBRE_ARCHIVO),
  ];
}

let cache: string | null = null;

/**
 * Devuelve el texto del manual. Si no se encuentra el archivo devuelve
 * cadena vacia y lo registra: el asistente sigue funcionando (puede abrir
 * tickets), pero sin base de conocimiento para resolver dudas.
 */
export function cargarManualUsuario(): string {
  if (cache !== null) return cache;

  for (const ruta of rutasCandidatas()) {
    try {
      if (fs.existsSync(ruta)) {
        cache = fs.readFileSync(ruta, 'utf-8').trim();
        return cache;
      }
    } catch {
      // Se intenta con la siguiente ruta candidata.
    }
  }

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      type: 'knowledge_base_not_found',
      archivo: NOMBRE_ARCHIVO,
    }),
  );
  cache = '';
  return cache;
}

/** Solo para pruebas: fuerza una recarga en la siguiente llamada. */
export function limpiarCacheManual(): void {
  cache = null;
}
