import { Pool } from 'pg';
import {
  AuditoriaRepository,
  EventoAuditoria,
  FiltrosAuditoria,
  NuevoEventoAuditoria,
} from '../../../../../domain/ports/out/AuditoriaRepository';

interface FilaEventoAuditoria {
  id: number;
  actor_id: number | null;
  actor_email: string;
  actor_rol: EventoAuditoria['actorRol'];
  accion: string;
  motivo: string;
  metodo: string;
  ruta: string;
  estado_http: number;
  solicitud_id: string | null;
  fecha: Date;
}

export class PostgresAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly pool: Pool) {}

  async registrar(evento: NuevoEventoAuditoria): Promise<void> {
    await this.pool.query(
      `INSERT INTO auditoria_evento
         (actor_id, actor_email, actor_rol, accion, motivo, metodo, ruta, estado_http, solicitud_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        evento.actorId,
        evento.actorEmail,
        evento.actorRol,
        evento.accion,
        evento.motivo,
        evento.metodo,
        evento.ruta,
        evento.estadoHttp,
        evento.solicitudId ?? null,
      ],
    );
  }

  async listar(filtros: FiltrosAuditoria): Promise<{ eventos: EventoAuditoria[]; total: number }> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    const agregar = (condicion: string, valor: unknown) => {
      valores.push(valor);
      condiciones.push(condicion.replace('?', `$${valores.length}`));
    };

    if (filtros.desde) agregar('fecha >= ?::date', filtros.desde);
    if (filtros.hasta) agregar("fecha < (?::date + INTERVAL '1 day')", filtros.hasta);
    if (filtros.rol) agregar('actor_rol = ?', filtros.rol);
    if (filtros.metodo) agregar('metodo = ?', filtros.metodo);
    if (filtros.buscar) {
      valores.push(`%${filtros.buscar}%`);
      condiciones.push(`(actor_email ILIKE $${valores.length} OR accion ILIKE $${valores.length} OR ruta ILIKE $${valores.length})`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const totalResultado = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM auditoria_evento ${where}`,
      valores,
    );

    const pageValues = [...valores, filtros.limite, filtros.offset];
    const resultado = await this.pool.query<FilaEventoAuditoria>(
      `SELECT id, actor_id, actor_email, actor_rol, accion, motivo, metodo, ruta,
              estado_http, solicitud_id, fecha
       FROM auditoria_evento ${where}
       ORDER BY fecha DESC, id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );

    return {
      eventos: resultado.rows.map((fila) => ({
        id: fila.id,
        actorId: fila.actor_id,
        actorEmail: fila.actor_email,
        actorRol: fila.actor_rol,
        accion: fila.accion,
        motivo: fila.motivo,
        metodo: fila.metodo,
        ruta: fila.ruta,
        estadoHttp: fila.estado_http,
        solicitudId: fila.solicitud_id,
        fecha: new Date(fila.fecha),
      })),
      total: Number(totalResultado.rows[0]?.total ?? 0),
    };
  }
}
