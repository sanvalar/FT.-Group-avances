import { Pool } from 'pg';
import {
  Conversacion,
  EstadoTicket,
  MensajeConversacion,
  MensajeTicket,
  NuevoMensajeTicket,
  NuevoTicket,
  RolMensajeAsistente,
  SoporteRepository,
  Ticket,
  TicketDetalle,
} from '../../../../../domain/ports/out/SoporteRepository';
import { TicketNoEncontradoError } from '../../../../../domain/errors/DomainErrors';

interface FilaTicket {
  id: number;
  numero: string;
  usuario_id: number;
  categoria: Ticket['categoria'];
  asunto: string;
  descripcion: string;
  prioridad: Ticket['prioridad'];
  estado: EstadoTicket;
  atendido_por: number | null;
  fecha_creacion: Date;
  fecha_cierre: Date | null;
}

interface FilaMensajeTicket {
  id: number;
  autor_id: number | null;
  autor_rol: MensajeTicket['autorRol'];
  contenido: string;
  fecha: Date;
}

const COLUMNAS_TICKET = `id, numero, usuario_id, categoria, asunto, descripcion,
                         prioridad, estado, atendido_por, fecha_creacion, fecha_cierre`;

function aTicket(fila: FilaTicket): Ticket {
  return {
    id: fila.id,
    numero: fila.numero,
    usuarioId: fila.usuario_id,
    categoria: fila.categoria,
    asunto: fila.asunto,
    descripcion: fila.descripcion,
    prioridad: fila.prioridad,
    estado: fila.estado,
    atendidoPor: fila.atendido_por,
    fechaCreacion: new Date(fila.fecha_creacion),
    fechaCierre: fila.fecha_cierre ? new Date(fila.fecha_cierre) : null,
  };
}

export class PostgresSoporteRepository implements SoporteRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Crea el ticket y le asigna el consecutivo del anio en la misma
   * transaccion. El UPSERT sobre ticket_consecutivo bloquea la fila del
   * anio, de modo que dos peticiones simultaneas no pueden recibir el
   * mismo numero.
   */
  async crearTicket(nuevo: NuevoTicket): Promise<Ticket> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const anio = new Date().getFullYear();

      const consecutivo = await client.query<{ ultimo: number }>(
        `INSERT INTO ticket_consecutivo (anio, ultimo)
         VALUES ($1, 1)
         ON CONFLICT (anio) DO UPDATE SET ultimo = ticket_consecutivo.ultimo + 1
         RETURNING ultimo`,
        [anio],
      );
      const secuencia = consecutivo.rows[0]!.ultimo;
      const numero = `FT-${anio}-${String(secuencia).padStart(4, '0')}`;

      const resultado = await client.query<FilaTicket>(
        `INSERT INTO ticket_soporte
           (numero, usuario_id, categoria, asunto, descripcion, prioridad)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${COLUMNAS_TICKET}`,
        [
          numero,
          nuevo.usuarioId,
          nuevo.categoria,
          nuevo.asunto,
          nuevo.descripcion,
          nuevo.prioridad,
        ],
      );

      await client.query('COMMIT');
      return aTicket(resultado.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async buscarTicketPorNumero(numero: string): Promise<TicketDetalle | null> {
    const resultado = await this.pool.query<FilaTicket>(
      `SELECT ${COLUMNAS_TICKET} FROM ticket_soporte WHERE numero = $1`,
      [numero],
    );
    const fila = resultado.rows[0];
    if (!fila) return null;

    const mensajes = await this.pool.query<FilaMensajeTicket>(
      `SELECT id, autor_id, autor_rol, contenido, fecha
       FROM ticket_mensaje
       WHERE ticket_id = $1
       ORDER BY fecha ASC, id ASC`,
      [fila.id],
    );

    return {
      ...aTicket(fila),
      mensajes: mensajes.rows.map((m) => ({
        id: m.id,
        autorId: m.autor_id,
        autorRol: m.autor_rol,
        contenido: m.contenido,
        fecha: new Date(m.fecha),
      })),
    };
  }

  async listarTicketsDeUsuario(usuarioId: number, limite: number): Promise<Ticket[]> {
    const resultado = await this.pool.query<FilaTicket>(
      `SELECT ${COLUMNAS_TICKET}
       FROM ticket_soporte
       WHERE usuario_id = $1
       ORDER BY fecha_creacion DESC, id DESC
       LIMIT $2`,
      [usuarioId, limite],
    );
    return resultado.rows.map(aTicket);
  }

  async listarTickets(filtros: {
    estado?: EstadoTicket;
    limite: number;
    offset: number;
  }): Promise<{ tickets: Ticket[]; total: number }> {
    const where = filtros.estado ? 'WHERE estado = $1' : '';
    const valoresBase = filtros.estado ? [filtros.estado] : [];

    const total = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ticket_soporte ${where}`,
      valoresBase,
    );

    const valores = [...valoresBase, filtros.limite, filtros.offset];
    const resultado = await this.pool.query<FilaTicket>(
      `SELECT ${COLUMNAS_TICKET}
       FROM ticket_soporte ${where}
       ORDER BY
         CASE prioridad WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
         fecha_creacion DESC, id DESC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores,
    );

    return {
      tickets: resultado.rows.map(aTicket),
      total: Number(total.rows[0]?.total ?? 0),
    };
  }

  async agregarMensajeTicket(mensaje: NuevoMensajeTicket): Promise<MensajeTicket> {
    const resultado = await this.pool.query<FilaMensajeTicket>(
      `INSERT INTO ticket_mensaje (ticket_id, autor_id, autor_rol, contenido)
       VALUES ($1, $2, $3, $4)
       RETURNING id, autor_id, autor_rol, contenido, fecha`,
      [mensaje.ticketId, mensaje.autorId, mensaje.autorRol, mensaje.contenido],
    );
    const fila = resultado.rows[0]!;
    return {
      id: fila.id,
      autorId: fila.autor_id,
      autorRol: fila.autor_rol,
      contenido: fila.contenido,
      fecha: new Date(fila.fecha),
    };
  }

  async actualizarEstadoTicket(
    ticketId: number,
    estado: EstadoTicket,
    atendidoPor: number | null,
  ): Promise<Ticket> {
    const cierra = estado === 'resuelto' || estado === 'cerrado';
    const resultado = await this.pool.query<FilaTicket>(
      `UPDATE ticket_soporte
       SET estado = $2,
           atendido_por = COALESCE($3, atendido_por),
           fecha_cierre = CASE WHEN $4 THEN COALESCE(fecha_cierre, NOW()) ELSE NULL END
       WHERE id = $1
       RETURNING ${COLUMNAS_TICKET}`,
      [ticketId, estado, atendidoPor, cierra],
    );
    const fila = resultado.rows[0];
    if (!fila) throw new TicketNoEncontradoError(String(ticketId));
    return aTicket(fila);
  }

  async abrirConversacion(usuarioId: number): Promise<Conversacion> {
    const resultado = await this.pool.query<{
      id: number;
      usuario_id: number;
      ticket_id: number | null;
    }>(
      `INSERT INTO conversacion_asistente (usuario_id)
       VALUES ($1)
       RETURNING id, usuario_id, ticket_id`,
      [usuarioId],
    );
    const fila = resultado.rows[0]!;
    return { id: fila.id, usuarioId: fila.usuario_id, ticketId: fila.ticket_id };
  }

  /**
   * Busca la conversacion exigiendo que pertenezca al usuario indicado.
   * El filtro por usuario_id va en el SQL (no en una comprobacion
   * posterior) para que sea imposible leer la memoria de otra persona.
   */
  async buscarConversacion(id: number, usuarioId: number): Promise<Conversacion | null> {
    const resultado = await this.pool.query<{
      id: number;
      usuario_id: number;
      ticket_id: number | null;
    }>(
      `SELECT id, usuario_id, ticket_id
       FROM conversacion_asistente
       WHERE id = $1 AND usuario_id = $2`,
      [id, usuarioId],
    );
    const fila = resultado.rows[0];
    return fila ? { id: fila.id, usuarioId: fila.usuario_id, ticketId: fila.ticket_id } : null;
  }

  async guardarMensajeConversacion(
    conversacionId: number,
    rol: RolMensajeAsistente,
    contenido: string,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO mensaje_asistente (conversacion_id, rol, contenido)
         VALUES ($1, $2, $3)`,
        [conversacionId, rol, contenido],
      );
      await client.query(
        `UPDATE conversacion_asistente SET fecha_ultimo = NOW() WHERE id = $1`,
        [conversacionId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Devuelve los ultimos `limite` mensajes en orden cronologico. */
  async historialConversacion(
    conversacionId: number,
    limite: number,
  ): Promise<MensajeConversacion[]> {
    const resultado = await this.pool.query<{
      rol: RolMensajeAsistente;
      contenido: string;
      fecha: Date;
    }>(
      `SELECT rol, contenido, fecha FROM (
         SELECT rol, contenido, fecha, id
         FROM mensaje_asistente
         WHERE conversacion_id = $1
         ORDER BY fecha DESC, id DESC
         LIMIT $2
       ) AS recientes
       ORDER BY fecha ASC, id ASC`,
      [conversacionId, limite],
    );
    return resultado.rows.map((fila) => ({
      rol: fila.rol,
      contenido: fila.contenido,
      fecha: new Date(fila.fecha),
    }));
  }

  async vincularTicket(conversacionId: number, ticketId: number): Promise<void> {
    await this.pool.query(
      `UPDATE conversacion_asistente
       SET ticket_id = $2
       WHERE id = $1 AND ticket_id IS NULL`,
      [conversacionId, ticketId],
    );
  }
}
