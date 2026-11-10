import {
  comentarioTicketSchema,
  crearTicketSchema,
  estadoTicketSchema,
  filtrosTicketsSchema,
  mensajeAsistenteSchema,
  numeroTicketParamsSchema,
} from '../../src/infrastructure/adapters/in/http/validators/soporteValidators';

describe('validadores del modulo de soporte', () => {
  describe('mensajeAsistenteSchema', () => {
    it('acepta un mensaje sin conversacion previa', () => {
      const resultado = mensajeAsistenteSchema.parse({ mensaje: '  ¿Como creo un grupo?  ' });
      expect(resultado).toEqual({ mensaje: '¿Como creo un grupo?' });
    });

    it('convierte la conversacion recibida como texto en numero', () => {
      const resultado = mensajeAsistenteSchema.parse({ mensaje: 'Hola', conversacionId: '55' });
      expect(resultado.conversacionId).toBe(55);
    });

    it('rechaza un mensaje vacio', () => {
      expect(() => mensajeAsistenteSchema.parse({ mensaje: '   ' })).toThrow();
    });

    it('rechaza un mensaje demasiado largo', () => {
      expect(() => mensajeAsistenteSchema.parse({ mensaje: 'a'.repeat(1001) })).toThrow();
    });

    it('rechaza una conversacion negativa', () => {
      expect(() => mensajeAsistenteSchema.parse({ mensaje: 'Hola', conversacionId: -3 })).toThrow();
    });
  });

  describe('numeroTicketParamsSchema', () => {
    it('normaliza el numero a mayusculas', () => {
      expect(numeroTicketParamsSchema.parse({ numero: 'ft-2026-0007' })).toEqual({
        numero: 'FT-2026-0007',
      });
    });

    it.each(['FT-26-0007', 'FT-2026-7', 'XX-2026-0007', '2026-0007', 'FT-2026-00007'])(
      'rechaza el formato invalido %s',
      (numero) => {
        expect(() => numeroTicketParamsSchema.parse({ numero })).toThrow();
      },
    );
  });

  describe('crearTicketSchema', () => {
    const valido = {
      categoria: 'gastos',
      asunto: 'No puedo editar un gasto',
      descripcion: 'Al guardar los cambios la pantalla no hace nada.',
    };

    it('aplica prioridad normal por defecto', () => {
      expect(crearTicketSchema.parse(valido).prioridad).toBe('normal');
    });

    it('rechaza una categoria fuera del catalogo', () => {
      expect(() => crearTicketSchema.parse({ ...valido, categoria: 'facturacion' })).toThrow();
    });

    it('rechaza un asunto demasiado corto', () => {
      expect(() => crearTicketSchema.parse({ ...valido, asunto: 'uf' })).toThrow();
    });

    it('rechaza una descripcion demasiado corta', () => {
      expect(() => crearTicketSchema.parse({ ...valido, descripcion: 'no va' })).toThrow();
    });
  });

  describe('comentarioTicketSchema y estadoTicketSchema', () => {
    it('recorta el comentario', () => {
      expect(comentarioTicketSchema.parse({ comentario: '  sigue igual  ' })).toEqual({
        comentario: 'sigue igual',
      });
    });

    it('rechaza un estado inexistente', () => {
      expect(() => estadoTicketSchema.parse({ estado: 'archivado' })).toThrow();
    });

    it('acepta los cuatro estados validos', () => {
      for (const estado of ['abierto', 'en_revision', 'resuelto', 'cerrado']) {
        expect(estadoTicketSchema.parse({ estado }).estado).toBe(estado);
      }
    });
  });

  describe('filtrosTicketsSchema', () => {
    it('aplica paginacion por defecto', () => {
      expect(filtrosTicketsSchema.parse({})).toEqual({ limite: 25, offset: 0 });
    });

    it('limita el tamano de pagina', () => {
      expect(() => filtrosTicketsSchema.parse({ limite: 500 })).toThrow();
    });
  });
});
