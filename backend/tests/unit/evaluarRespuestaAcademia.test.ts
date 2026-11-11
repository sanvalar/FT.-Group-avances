import { evaluarRespuestaAcademia } from '../../src/domain/services/evaluarRespuestaAcademia';

describe('evaluarRespuestaAcademia', () => {
  const contenido = [{
    tipo: 'quiz',
    opciones: ['Incorrecta', 'Correcta'],
    respuesta: 1,
  }];

  it('aprueba únicamente cuando la opción seleccionada es la correcta', () => {
    expect(evaluarRespuestaAcademia(contenido, 1)).toBe(100);
    expect(evaluarRespuestaAcademia(contenido, 0)).toBe(0);
  });

  it('rechaza respuestas fuera del rango de opciones', () => {
    expect(() => evaluarRespuestaAcademia(contenido, 2)).toThrow('Selecciona una respuesta válida.');
    expect(() => evaluarRespuestaAcademia(contenido, -1)).toThrow('Selecciona una respuesta válida.');
  });

  it('rechaza lecciones sin una evaluación válida', () => {
    expect(() => evaluarRespuestaAcademia([], 0)).toThrow('La evaluación de esta lección no está disponible.');
  });
});
