import {
  AsistenteService,
  ContextoUsuario,
  limpiarMarcado,
} from '../../src/application/services/AsistenteService';
import { SoporteService } from '../../src/application/services/SoporteService';
import {
  AsistenteIA,
  EntradaModelo,
  RespuestaModelo,
} from '../../src/domain/ports/out/AsistenteIA';
import {
  Conversacion,
  SoporteRepository,
  Ticket,
} from '../../src/domain/ports/out/SoporteRepository';
import { AsistenteNoDisponibleError } from '../../src/domain/errors/DomainErrors';

/**
 * El modelo se sustituye por un doble que devuelve respuestas programadas,
 * de modo que el bucle del agente se prueba completo sin consumir tokens
 * ni depender de la red.
 */
describe('AsistenteService', () => {
  const usuario: ContextoUsuario = {
    id: 10,
    nombre: 'Jheinson',
    email: 'jheinson@example.com',
    rol: 'usuario',
  };

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

  function crearEntorno(respuestas: RespuestaModelo[], opciones: { disponible?: boolean } = {}) {
    const entradas: EntradaModelo[] = [];
    let indice = 0;

    const ia: jest.Mocked<AsistenteIA> = {
      disponible: jest.fn(() => opciones.disponible ?? true),
      generar: jest.fn(async (entrada: EntradaModelo) => {
        entradas.push(JSON.parse(JSON.stringify(entrada)) as EntradaModelo);
        return respuestas[Math.min(indice++, respuestas.length - 1)]!;
      }),
    };

    const conversacion: Conversacion = { id: 55, usuarioId: 10, ticketId: null };

    const repository = {
      abrirConversacion: jest.fn(async () => conversacion),
      buscarConversacion: jest.fn(async (id: number, usuarioId: number) =>
        id === 55 && usuarioId === 10 ? conversacion : null,
      ),
      guardarMensajeConversacion: jest.fn(async () => undefined),
      historialConversacion: jest.fn(async () => []),
      vincularTicket: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<SoporteRepository>;

    const soporte = {
      crearTicket: jest.fn(async () => ticket),
      listarMisTickets: jest.fn(async () => [ticket]),
      obtenerTicket: jest.fn(async () => ({ ...ticket, mensajes: [] })),
      comentar: jest.fn(),
    } as unknown as jest.Mocked<SoporteService>;

    const service = new AsistenteService(ia, soporte, repository, () => 'PROMPT DE PRUEBA');
    return { service, ia, repository, soporte, entradas };
  }

  const texto = (contenido: string): RespuestaModelo => ({ texto: contenido, llamadas: [] });
  const conHerramienta = (nombre: string, argumentos: Record<string, unknown>): RespuestaModelo => ({
    texto: null,
    llamadas: [{ id: 'call_1', nombre, argumentos }],
  });

  describe('limpiarMarcado', () => {
    it('quita la negrita de Markdown que el chat mostraria literal', () => {
      expect(limpiarMarcado('Abre **Panel** y revisa **Debes**.')).toBe(
        'Abre Panel y revisa Debes.',
      );
      expect(limpiarMarcado('Entra en __Grupos__.')).toBe('Entra en Grupos.');
    });

    it('quita las almohadillas de titulo', () => {
      expect(limpiarMarcado('## Pasos\nAbre Gastos.')).toBe('Pasos\nAbre Gastos.');
    });

    it('no toca los asteriscos sueltos ni el resto del texto', () => {
      expect(limpiarMarcado('El total es 3 * 2 = 6.')).toBe('El total es 3 * 2 = 6.');
      expect(limpiarMarcado('Usa «Panel» para verlo.')).toBe('Usa «Panel» para verlo.');
    });
  });

  it('limpia el marcado antes de guardar y devolver la respuesta', async () => {
    const { service, repository } = crearEntorno([texto('Abre **Grupos** y pulsa **Crear grupo**.')]);

    const resultado = await service.atender({ usuario, mensaje: '¿Como creo un grupo?' });

    expect(resultado.respuesta).toBe('Abre Grupos y pulsa Crear grupo.');
    expect(repository.guardarMensajeConversacion).toHaveBeenNthCalledWith(
      2, 55, 'asistente', 'Abre Grupos y pulsa Crear grupo.',
    );
  });

  it('falla con AsistenteNoDisponibleError si no hay credenciales', async () => {
    const { service } = crearEntorno([texto('hola')], { disponible: false });

    await expect(
      service.atender({ usuario, mensaje: 'Hola' }),
    ).rejects.toBeInstanceOf(AsistenteNoDisponibleError);
  });

  it('responde en una sola vuelta cuando no necesita herramientas', async () => {
    const { service, ia } = crearEntorno([texto('Abre «Grupos» y pulsa «Crear grupo».')]);

    const resultado = await service.atender({ usuario, mensaje: '¿Como creo un grupo?' });

    expect(resultado.respuesta).toContain('Crear grupo');
    expect(resultado.ticket).toBeNull();
    expect(ia.generar).toHaveBeenCalledTimes(1);
  });

  it('ejecuta la herramienta y vuelve al modelo con el resultado', async () => {
    const { service, ia, soporte, entradas } = crearEntorno([
      conHerramienta('crear_ticket', {
        categoria: 'divisiones',
        asunto: 'La division no suma el total',
        descripcion: 'Reparti 100.000 entre tres y la suma da menos.',
      }),
      texto('Te abri el caso FT-2026-0003. El equipo lo revisara.'),
    ]);

    const resultado = await service.atender({ usuario, mensaje: 'Un gasto no me cuadra' });

    expect(soporte.crearTicket).toHaveBeenCalled();
    expect(ia.generar).toHaveBeenCalledTimes(2);
    expect(resultado.ticket).toEqual({ numero: 'FT-2026-0003', estado: 'abierto', prioridad: 'normal' });

    // La segunda llamada al modelo incluye el turno de herramienta.
    const turnos = entradas[1]!.turnos;
    expect(turnos.at(-1)).toMatchObject({ tipo: 'herramienta', nombre: 'crear_ticket' });
  });

  it('vincula el ticket a la conversacion para que soporte vea el dialogo', async () => {
    const { service, repository } = crearEntorno([
      conHerramienta('crear_ticket', {
        categoria: 'pagos',
        asunto: 'No puedo registrar un pago',
        descripcion: 'El boton no responde al pulsarlo.',
      }),
      texto('Listo, quedo registrado.'),
    ]);

    await service.atender({ usuario, mensaje: 'No puedo pagar' });

    expect(repository.vincularTicket).toHaveBeenCalledWith(55, 3);
  });

  it('guarda el mensaje del usuario y la respuesta en la memoria', async () => {
    const { service, repository } = crearEntorno([texto('Claro, te explico.')]);

    await service.atender({ usuario, mensaje: '  ¿Como divido un gasto?  ' });

    expect(repository.guardarMensajeConversacion).toHaveBeenNthCalledWith(
      1, 55, 'usuario', '¿Como divido un gasto?',
    );
    expect(repository.guardarMensajeConversacion).toHaveBeenNthCalledWith(
      2, 55, 'asistente', 'Claro, te explico.',
    );
  });

  it('reutiliza la conversacion propia enviada por el cliente', async () => {
    const { service, repository } = crearEntorno([texto('Seguimos.')]);

    const resultado = await service.atender({ usuario, mensaje: 'Sigo aqui', conversacionId: 55 });

    expect(resultado.conversacionId).toBe(55);
    expect(repository.abrirConversacion).not.toHaveBeenCalled();
  });

  it('abre una conversacion nueva si el identificador no es del usuario', async () => {
    const { service, repository } = crearEntorno([texto('Hola.')]);

    await service.atender({ usuario, mensaje: 'Hola', conversacionId: 4242 });

    expect(repository.buscarConversacion).toHaveBeenCalledWith(4242, 10);
    expect(repository.abrirConversacion).toHaveBeenCalledWith(10);
  });

  it('envia el historial previo como contexto al modelo', async () => {
    const { service, repository, entradas } = crearEntorno([texto('Ya te dije como.')]);
    repository.historialConversacion.mockResolvedValueOnce([
      { rol: 'usuario', contenido: 'Hola', fecha: new Date() },
      { rol: 'asistente', contenido: 'Hola, ¿que necesitas?', fecha: new Date() },
    ]);

    await service.atender({ usuario, mensaje: 'Lo de los grupos', conversacionId: 55 });

    expect(entradas[0]!.turnos).toHaveLength(3);
    expect(entradas[0]!.turnos[0]).toEqual({ tipo: 'usuario', contenido: 'Hola' });
  });

  it('corta el bucle y responde algo util si el modelo solo pide herramientas', async () => {
    const { service, ia } = crearEntorno([
      conHerramienta('consultar_mis_tickets', {}),
    ]);

    const resultado = await service.atender({ usuario, mensaje: '¿Como van mis casos?' });

    expect(ia.generar).toHaveBeenCalledTimes(4);
    expect(resultado.respuesta.length).toBeGreaterThan(0);
  });

  it('no deja la respuesta vacia cuando el modelo devuelve texto en blanco', async () => {
    const { service } = crearEntorno([texto('   ')]);

    const resultado = await service.atender({ usuario, mensaje: 'Hola' });

    expect(resultado.respuesta.trim().length).toBeGreaterThan(0);
  });

  it('solo registra el primer ticket si el modelo intenta crear dos', async () => {
    const { service, repository } = crearEntorno([
      {
        texto: null,
        llamadas: [
          { id: 'a', nombre: 'crear_ticket', argumentos: { categoria: 'otro', asunto: 'Primer caso raro', descripcion: 'Descripcion suficiente.' } },
          { id: 'b', nombre: 'crear_ticket', argumentos: { categoria: 'otro', asunto: 'Segundo caso raro', descripcion: 'Otra descripcion suficiente.' } },
        ],
      },
      texto('Quedo registrado.'),
    ]);

    const resultado = await service.atender({ usuario, mensaje: 'Dos problemas' });

    expect(repository.vincularTicket).toHaveBeenCalledTimes(1);
    expect(resultado.ticket?.numero).toBe('FT-2026-0003');
  });
});
