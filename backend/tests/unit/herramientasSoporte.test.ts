import {
  DEFINICIONES_HERRAMIENTAS,
  crearEjecutorHerramientas,
} from '../../src/application/services/herramientasSoporte';
import { SoporteService } from '../../src/application/services/SoporteService';
import { Ticket } from '../../src/domain/ports/out/SoporteRepository';
import { TicketNoEncontradoError } from '../../src/domain/errors/DomainErrors';

/**
 * Pruebas de las herramientas del agente. No se llama a ningun modelo de
 * lenguaje: se simulan las llamadas que el modelo haria, que es donde
 * puede equivocarse o intentar salirse de su alcance.
 */
describe('herramientas del asistente de soporte', () => {
  const ticket: Ticket = {
    id: 3,
    numero: 'FT-2026-0003',
    usuarioId: 10,
    categoria: 'divisiones',
    asunto: 'La division no suma el total',
    descripcion: 'Reparti 100.000 entre tres y la suma da menos.',
    prioridad: 'normal',
    estado: 'abierto',
    atendidoPor: null,
    fechaCreacion: new Date('2026-10-24T12:00:00Z'),
    fechaCierre: null,
  };

  function crearEntorno() {
    const servicio = {
      listarMisTickets: jest.fn(async () => [ticket]),
      obtenerTicket: jest.fn(async () => ({ ...ticket, mensajes: [] })),
      crearTicket: jest.fn(async () => ticket),
      comentar: jest.fn(async () => ({
        id: 1,
        autorId: 10,
        autorRol: 'usuario' as const,
        contenido: 'Sigue pasando',
        fecha: new Date(),
      })),
    } as unknown as jest.Mocked<SoporteService>;

    const ejecutar = crearEjecutorHerramientas(servicio, { id: 10, rol: 'usuario' });
    return { servicio, ejecutar };
  }

  const llamada = (nombre: string, argumentos: Record<string, unknown> = {}) => ({
    id: 'call_1',
    nombre,
    argumentos,
  });

  it('declara exactamente las cuatro herramientas del modulo', () => {
    expect(DEFINICIONES_HERRAMIENTAS.map((h) => h.nombre)).toEqual([
      'consultar_mis_tickets',
      'consultar_ticket',
      'crear_ticket',
      'agregar_comentario',
    ]);
  });

  it('ninguna herramienta acepta un identificador de usuario como argumento', () => {
    // Es la barrera que impide que el modelo consulte datos de otra persona.
    for (const herramienta of DEFINICIONES_HERRAMIENTAS) {
      const propiedades = Object.keys(herramienta.parametros.properties);
      expect(propiedades).not.toContain('usuarioId');
      expect(propiedades).not.toContain('usuario_id');
      expect(propiedades).not.toContain('id_usuario');
      expect(propiedades).not.toContain('cedula');
      expect(propiedades).not.toContain('email');
    }
  });

  it('usa el actor de la sesion y descarta un usuario inyectado en los argumentos', async () => {
    const { servicio, ejecutar } = crearEntorno();

    await ejecutar(
      llamada('crear_ticket', {
        categoria: 'gastos',
        asunto: 'No puedo editar un gasto',
        descripcion: 'El formulario no guarda los cambios.',
        prioridad: 'normal',
        usuarioId: 999,
      }),
    );

    expect(servicio.crearTicket).toHaveBeenCalledWith(
      { id: 10, rol: 'usuario' },
      expect.not.objectContaining({ usuarioId: expect.anything() }),
    );
  });

  it('aplica prioridad normal cuando el modelo no la indica', async () => {
    const { servicio, ejecutar } = crearEntorno();

    await ejecutar(
      llamada('crear_ticket', {
        categoria: 'cuenta',
        asunto: 'No me llega el correo de acceso',
        descripcion: 'Intente entrar varias veces y no recibo nada.',
      }),
    );

    expect(servicio.crearTicket).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prioridad: 'normal' }),
    );
  });

  it('devuelve el numero del ticket creado para que el agente lo comunique', async () => {
    const { ejecutar } = crearEntorno();

    const resultado = await ejecutar(
      llamada('crear_ticket', {
        categoria: 'divisiones',
        asunto: 'La division no suma el total',
        descripcion: 'Reparti 100.000 entre tres y la suma da menos.',
      }),
    );

    expect(resultado.texto).toContain('FT-2026-0003');
    expect(resultado.ticketCreado?.numero).toBe('FT-2026-0003');
  });

  it('pide corregir los argumentos en vez de fallar cuando el modelo envia basura', async () => {
    const { servicio, ejecutar } = crearEntorno();

    const resultado = await ejecutar(llamada('crear_ticket', { categoria: 'inventada', asunto: 'x' }));

    expect(resultado.texto).toContain('Argumentos invalidos');
    expect(servicio.crearTicket).not.toHaveBeenCalled();
  });

  it('rechaza un numero de ticket con formato incorrecto', async () => {
    const { servicio, ejecutar } = crearEntorno();

    const resultado = await ejecutar(llamada('consultar_ticket', { numero: '3' }));

    expect(resultado.texto).toContain('FT-AAAA-NNNN');
    expect(servicio.obtenerTicket).not.toHaveBeenCalled();
  });

  it('traduce un error de dominio a texto sin romper la conversacion', async () => {
    const { servicio, ejecutar } = crearEntorno();
    servicio.obtenerTicket.mockRejectedValueOnce(new TicketNoEncontradoError('FT-2026-9999'));

    const resultado = await ejecutar(llamada('consultar_ticket', { numero: 'FT-2026-9999' }));

    expect(resultado.texto).toContain('No se pudo completar');
    expect(resultado.ticketCreado).toBeUndefined();
  });

  it('propaga un error inesperado para que quede registrado', async () => {
    const { servicio, ejecutar } = crearEntorno();
    servicio.listarMisTickets.mockRejectedValueOnce(new Error('fallo de conexion'));

    await expect(ejecutar(llamada('consultar_mis_tickets'))).rejects.toThrow('fallo de conexion');
  });

  it('informa cuando el usuario no tiene tickets', async () => {
    const { servicio, ejecutar } = crearEntorno();
    servicio.listarMisTickets.mockResolvedValueOnce([]);

    const resultado = await ejecutar(llamada('consultar_mis_tickets'));

    expect(resultado.texto).toContain('no tiene ningun ticket');
  });

  it('responde con un aviso si el modelo invoca una herramienta inexistente', async () => {
    const { ejecutar } = crearEntorno();

    const resultado = await ejecutar(llamada('borrar_base_de_datos', {}));

    expect(resultado.texto).toContain('no existe');
  });

  it('normaliza a mayusculas el numero al añadir un comentario', async () => {
    const { servicio, ejecutar } = crearEntorno();

    const resultado = await ejecutar(
      llamada('agregar_comentario', { numero: 'ft-2026-0003', comentario: 'Sigue pasando' }),
    );

    expect(servicio.comentar).toHaveBeenCalledWith(
      { id: 10, rol: 'usuario' },
      'ft-2026-0003',
      'Sigue pasando',
    );
    expect(resultado.texto).toContain('FT-2026-0003');
  });
});
