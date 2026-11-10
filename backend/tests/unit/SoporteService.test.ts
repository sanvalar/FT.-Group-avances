import { SoporteService } from '../../src/application/services/SoporteService';
import {
  SoporteRepository,
  Ticket,
  TicketDetalle,
} from '../../src/domain/ports/out/SoporteRepository';
import {
  AccesoDenegadoError,
  ConflictoEstadoError,
  TicketNoEncontradoError,
} from '../../src/domain/errors/DomainErrors';

describe('SoporteService', () => {
  const ticketBase = (sobrescribir: Partial<Ticket> = {}): Ticket => ({
    id: 1,
    numero: 'FT-2026-0001',
    usuarioId: 10,
    categoria: 'gastos',
    asunto: 'Un gasto no cuadra',
    descripcion: 'La division de un gasto suma menos que el total.',
    prioridad: 'normal',
    estado: 'abierto',
    atendidoPor: null,
    fechaCreacion: new Date('2026-10-24T12:00:00Z'),
    fechaCierre: null,
    ...sobrescribir,
  });

  function crearServicio(tickets: Ticket[] = [ticketBase()]) {
    const repository: jest.Mocked<SoporteRepository> = {
      crearTicket: jest.fn(async (nuevo) => ticketBase({ ...nuevo, id: 99, numero: 'FT-2026-0099' })),
      buscarTicketPorNumero: jest.fn(async (numero) => {
        const encontrado = tickets.find((t) => t.numero === numero);
        return encontrado ? ({ ...encontrado, mensajes: [] } as TicketDetalle) : null;
      }),
      listarTicketsDeUsuario: jest.fn(async (usuarioId) =>
        tickets.filter((t) => t.usuarioId === usuarioId),
      ),
      listarTickets: jest.fn(async () => ({ tickets, total: tickets.length })),
      agregarMensajeTicket: jest.fn(async (mensaje) => ({
        id: 1,
        autorId: mensaje.autorId,
        autorRol: mensaje.autorRol,
        contenido: mensaje.contenido,
        fecha: new Date(),
      })),
      actualizarEstadoTicket: jest.fn(async (id, estado, atendidoPor) =>
        ticketBase({ id, estado, atendidoPor }),
      ),
      abrirConversacion: jest.fn(),
      buscarConversacion: jest.fn(),
      guardarMensajeConversacion: jest.fn(),
      historialConversacion: jest.fn(),
      vincularTicket: jest.fn(),
    };
    return { service: new SoporteService(repository), repository };
  }

  it('crea el ticket con el id del actor, ignorando cualquier otro origen', async () => {
    const { service, repository } = crearServicio();

    await service.crearTicket(
      { id: 10, rol: 'usuario' },
      {
        categoria: 'pagos',
        asunto: 'No puedo registrar un pago',
        descripcion: 'El boton de registrar pago no responde.',
        prioridad: 'alta',
      },
    );

    expect(repository.crearTicket).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 10, categoria: 'pagos', prioridad: 'alta' }),
    );
  });

  it('recorta los espacios del asunto y la descripcion', async () => {
    const { service, repository } = crearServicio();

    await service.crearTicket(
      { id: 10, rol: 'usuario' },
      {
        categoria: 'otro',
        asunto: '   Algo raro   ',
        descripcion: '   Pasa algo que no entiendo.   ',
        prioridad: 'normal',
      },
    );

    expect(repository.crearTicket).toHaveBeenCalledWith(
      expect.objectContaining({ asunto: 'Algo raro', descripcion: 'Pasa algo que no entiendo.' }),
    );
  });

  it('normaliza el numero de ticket a mayusculas al buscarlo', async () => {
    const { service, repository } = crearServicio();

    await service.obtenerTicket({ id: 10, rol: 'usuario' }, ' ft-2026-0001 ');

    expect(repository.buscarTicketPorNumero).toHaveBeenCalledWith('FT-2026-0001');
  });

  it('oculta como "no encontrado" el ticket de otro usuario', async () => {
    const { service } = crearServicio();

    await expect(
      service.obtenerTicket({ id: 77, rol: 'usuario' }, 'FT-2026-0001'),
    ).rejects.toBeInstanceOf(TicketNoEncontradoError);
  });

  it('permite al personal de soporte ver el ticket de cualquier usuario', async () => {
    const { service } = crearServicio();

    const ticket = await service.obtenerTicket({ id: 77, rol: 'moderador' }, 'FT-2026-0001');

    expect(ticket.numero).toBe('FT-2026-0001');
  });

  it('impide comentar un ticket cerrado', async () => {
    const { service } = crearServicio([ticketBase({ estado: 'cerrado' })]);

    await expect(
      service.comentar({ id: 10, rol: 'usuario' }, 'FT-2026-0001', 'Sigue pasando'),
    ).rejects.toBeInstanceOf(ConflictoEstadoError);
  });

  it('no deja que un usuario comun liste todos los tickets', async () => {
    const { service } = crearServicio();

    await expect(
      service.listarTodos({ id: 10, rol: 'usuario' }, { limite: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(AccesoDenegadoError);
  });

  it('no deja que un usuario comun cambie el estado de su propio ticket', async () => {
    const { service } = crearServicio();

    await expect(
      service.cambiarEstado({ id: 10, rol: 'usuario' }, 'FT-2026-0001', 'resuelto'),
    ).rejects.toBeInstanceOf(AccesoDenegadoError);
  });

  it('registra quien atiende el ticket al cambiar su estado', async () => {
    const { service, repository } = crearServicio();

    const ticket = await service.cambiarEstado({ id: 5, rol: 'moderador' }, 'FT-2026-0001', 'en_revision');

    expect(repository.actualizarEstadoTicket).toHaveBeenCalledWith(1, 'en_revision', 5);
    expect(ticket.estado).toBe('en_revision');
  });

  it('no reescribe el ticket cuando el estado no cambia', async () => {
    const { service, repository } = crearServicio();

    await service.cambiarEstado({ id: 5, rol: 'supervisor' }, 'FT-2026-0001', 'abierto');

    expect(repository.actualizarEstadoTicket).not.toHaveBeenCalled();
  });
});
