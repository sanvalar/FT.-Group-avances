import { ValidacionError } from '../errors/DomainErrors';

type BloqueQuiz = {
  tipo?: unknown;
  opciones?: unknown;
  respuesta?: unknown;
};

function esBloqueQuiz(bloque: unknown): bloque is BloqueQuiz {
  return typeof bloque === 'object'
    && bloque !== null
    && 'tipo' in bloque
    && bloque.tipo === 'quiz';
}

export function evaluarRespuestaAcademia(contenido: unknown, respuestaSeleccionada: number): number {
  if (!Array.isArray(contenido)) {
    throw new ValidacionError('La lección no contiene una evaluación válida.');
  }
  const quiz = contenido.find(esBloqueQuiz);
  if (!quiz || !Array.isArray(quiz.opciones) || !Number.isInteger(quiz.respuesta)) {
    throw new ValidacionError('La evaluación de esta lección no está disponible.');
  }
  if (
    !Number.isInteger(respuestaSeleccionada)
    || respuestaSeleccionada < 0
    || respuestaSeleccionada >= quiz.opciones.length
  ) {
    throw new ValidacionError('Selecciona una respuesta válida.');
  }
  return respuestaSeleccionada === quiz.respuesta ? 100 : 0;
}
