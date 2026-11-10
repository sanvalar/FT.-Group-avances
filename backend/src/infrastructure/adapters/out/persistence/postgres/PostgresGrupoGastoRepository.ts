import { Pool, PoolClient } from 'pg';
import {
  AccesoDenegadoError,
  ConflictoEstadoError,
  GastoNoEncontradoError,
  GrupoNoEncontradoError,
  NotificacionNoEncontradaError,
  UsuarioNoEncontradoError,
  ValidacionError,
} from '../../../../../domain/errors/DomainErrors';
import { CrearGastoDatos, GrupoGastoRepository, GrupoResumen } from '../../../../../domain/ports/out/GrupoGastoRepository';

export class PostgresGrupoGastoRepository implements GrupoGastoRepository {
  constructor(private readonly pool: Pool) {}

  async crearGrupo(usuarioId: number, nombre: string, descripcion?: string): Promise<GrupoResumen> {
    return this.enTransaccion(async (client) => {
      const resultado = await client.query(
        `INSERT INTO grupo (nombre, descripcion, creado_por)
         VALUES ($1, $2, $3)
         RETURNING id, nombre, descripcion, fecha_creacion`,
        [nombre, descripcion || null, usuarioId],
      );
      const grupo = resultado.rows[0];
      await client.query(
        `INSERT INTO miembro_grupo (grupo_id, usuario_id, rol)
         VALUES ($1, $2, 'administrador')`,
        [grupo.id, usuarioId],
      );
      return {
        id: grupo.id,
        nombre: grupo.nombre,
        descripcion: grupo.descripcion,
        rol: 'administrador',
        miembrosActivos: 1,
        fechaCreacion: grupo.fecha_creacion,
      };
    });
  }

  async listarGrupos(usuarioId: number): Promise<GrupoResumen[]> {
    const resultado = await this.pool.query(
      `SELECT g.id, g.nombre, g.descripcion, m.rol, g.fecha_creacion,
              COUNT(mi.id)::int AS miembros_activos
       FROM grupo g
       JOIN miembro_grupo m ON m.grupo_id = g.id AND m.usuario_id = $1 AND m.estado = 'activo'
       JOIN miembro_grupo mi ON mi.grupo_id = g.id AND mi.estado = 'activo'
       WHERE g.estado = 'activo'
       GROUP BY g.id, g.nombre, g.descripcion, m.rol, g.fecha_creacion
       ORDER BY g.fecha_creacion DESC`,
      [usuarioId],
    );
    return resultado.rows.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      rol: fila.rol,
      miembrosActivos: fila.miembros_activos,
      fechaCreacion: fila.fecha_creacion,
    }));
  }

  async agregarMiembro(actorId: number, grupoId: number, usuarioId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      await this.exigirAdministrador(client, actorId, grupoId);
      const usuario = await client.query(
        `SELECT id FROM usuario WHERE id = $1 AND estado = 'activo'`,
        [usuarioId],
      );
      if (usuario.rowCount === 0) throw new UsuarioNoEncontradoError(usuarioId);

      const existente = await client.query(
        `SELECT estado FROM miembro_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, usuarioId],
      );
      if (existente.rows[0]?.estado === 'activo') {
        throw new ConflictoEstadoError('El usuario ya pertenece a este grupo.');
      }

      await client.query(
        `INSERT INTO miembro_grupo (grupo_id, usuario_id, rol, estado)
         VALUES ($1, $2, 'miembro', 'activo')
         ON CONFLICT (grupo_id, usuario_id)
         DO UPDATE SET rol = 'miembro', estado = 'activo', fecha_union = NOW()`,
        [grupoId, usuarioId],
      );
      await this.registrarMovimiento(client, actorId, grupoId, null, 'miembro_agregado', 'Se agregó un integrante al grupo.');
      await client.query(
        `INSERT INTO notificacion (usuario_id, tipo, mensaje)
         VALUES ($1, 'invitacion_grupo', 'Te agregaron a un grupo de gastos compartidos.')`,
        [usuarioId],
      );
    });
  }

  async listarIntegrantes(usuarioId: number, grupoId: number): Promise<unknown[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT u.id, u.nombre, u.email, m.rol, m.fecha_union AS "fechaUnion"
       FROM miembro_grupo m
       JOIN usuario u ON u.id = m.usuario_id
       WHERE m.grupo_id = $1 AND m.estado = 'activo'
       ORDER BY m.fecha_union, u.nombre`,
      [grupoId],
    );
    return resultado.rows;
  }

  async quitarMiembro(actorId: number, grupoId: number, usuarioId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      await this.exigirAdministrador(client, actorId, grupoId);
      const objetivo = await client.query(
        `SELECT rol FROM miembro_grupo
         WHERE grupo_id = $1 AND usuario_id = $2 AND estado = 'activo'`,
        [grupoId, usuarioId],
      );
      if (objetivo.rowCount === 0) throw new UsuarioNoEncontradoError(usuarioId);
      if (objetivo.rows[0].rol === 'administrador') {
        const administradores = await client.query(
          `SELECT COUNT(*)::int AS total FROM miembro_grupo
           WHERE grupo_id = $1 AND rol = 'administrador' AND estado = 'activo'`,
          [grupoId],
        );
        if (administradores.rows[0].total <= 1) {
          throw new ConflictoEstadoError('El grupo debe conservar al menos un administrador activo.');
        }
      }
      const resultado = await client.query(
        `UPDATE miembro_grupo SET estado = 'expulsado'
         WHERE grupo_id = $1 AND usuario_id = $2 AND estado = 'activo'
         RETURNING id`,
        [grupoId, usuarioId],
      );
      await this.registrarMovimiento(client, actorId, grupoId, null, 'miembro_expulsado', 'Se retiró un integrante del grupo.');
    });
  }

  async crearGasto(actorId: number, grupoId: number, datos: CrearGastoDatos): Promise<unknown> {
    return this.enTransaccion(async (client) => {
      await this.exigirMiembro(client, actorId, grupoId, true);
      const usuarioIds = datos.participaciones.map(({ usuarioId }) => usuarioId);
      const miembros = await client.query(
        `SELECT usuario_id FROM miembro_grupo
         WHERE grupo_id = $1 AND estado = 'activo' AND usuario_id = ANY($2::bigint[])`,
        [grupoId, usuarioIds],
      );
      if (miembros.rowCount !== usuarioIds.length) {
        throw new ValidacionError('Todos los participantes deben pertenecer al grupo y estar activos.');
      }

      const gastoResultado = await client.query(
        `INSERT INTO gasto (grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria, tipo_division)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria, tipo_division, fecha_registro`,
        [grupoId, actorId, datos.descripcion, datos.montoTotal, datos.fechaGasto, datos.categoria, datos.tipoDivision],
      );
      const gasto = gastoResultado.rows[0];

      for (const participacion of datos.participaciones) {
        await client.query(
          `INSERT INTO participacion_gasto (gasto_id, usuario_id, monto_asignado, estado_pago, fecha_pago)
           VALUES ($1, $2, $3, $4, CASE WHEN $4::varchar = 'pagado' THEN NOW() ELSE NULL END)`,
          [gasto.id, participacion.usuarioId, participacion.montoAsignado, participacion.usuarioId === actorId ? 'pagado' : 'pendiente'],
        );
      }

      await this.registrarMovimiento(client, actorId, grupoId, gasto.id, 'gasto_creado', `Se registró el gasto: ${datos.descripcion}.`);
      await client.query(
        `INSERT INTO notificacion (usuario_id, tipo, mensaje)
         SELECT usuario_id, 'nuevo_gasto', $2 FROM unnest($1::bigint[]) AS usuario_id
         WHERE usuario_id <> $3`,
        [usuarioIds, `Se registró un gasto compartido: ${datos.descripcion}.`, actorId],
      );
      await this.recalcularBalances(client, grupoId);

      return { ...gasto, participaciones: datos.participaciones };
    });
  }

  async listarGastos(usuarioId: number, grupoId: number): Promise<unknown[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT g.id, g.grupo_id, g.pagador_id, u.nombre AS pagador, g.descripcion,
              g.monto_total, g.fecha_gasto, g.categoria, g.tipo_division, g.fecha_registro,
              COALESCE(json_agg(json_build_object(
                'usuarioId', p.usuario_id, 'nombre', up.nombre, 'montoAsignado', p.monto_asignado,
                'estadoPago', p.estado_pago, 'fechaPago', p.fecha_pago
              ) ORDER BY p.usuario_id) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS participaciones
       FROM gasto g
       JOIN usuario u ON u.id = g.pagador_id
       LEFT JOIN participacion_gasto p ON p.gasto_id = g.id
       LEFT JOIN usuario up ON up.id = p.usuario_id
       WHERE g.grupo_id = $1
       GROUP BY g.id, u.nombre
       ORDER BY g.fecha_gasto DESC, g.id DESC`,
      [grupoId],
    );
    return resultado.rows;
  }

  async registrarPago(usuarioId: number, gastoId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      const gasto = await client.query(`SELECT id, grupo_id, pagador_id FROM gasto WHERE id = $1`, [gastoId]);
      if (gasto.rowCount === 0) throw new GastoNoEncontradoError(gastoId);
      const { grupo_id: grupoId, pagador_id: pagadorId } = gasto.rows[0];
      await this.exigirMiembro(client, usuarioId, grupoId, true);

      const pago = await client.query(
        `UPDATE participacion_gasto
         SET estado_pago = 'pagado', fecha_pago = NOW()
         WHERE gasto_id = $1 AND usuario_id = $2 AND estado_pago = 'pendiente'
         RETURNING id`,
        [gastoId, usuarioId],
      );
      if (pago.rowCount === 0) {
        throw new ConflictoEstadoError('No existe un pago pendiente de este usuario para el gasto.');
      }
      await this.registrarMovimiento(client, usuarioId, grupoId, gastoId, 'pago_registrado', 'Se confirmó el pago de una participación.');
      if (pagadorId !== usuarioId) {
        await client.query(
          `INSERT INTO notificacion (usuario_id, tipo, mensaje)
           VALUES ($1, 'pago_recibido', 'Un integrante confirmó el pago de un gasto.')`,
          [pagadorId],
        );
      }
      await this.recalcularBalances(client, grupoId);
    });
  }

  async listarBalances(usuarioId: number, grupoId: number): Promise<unknown[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT b.deudor_id AS "deudorId", deudor.nombre AS deudor,
              b.acreedor_id AS "acreedorId", acreedor.nombre AS acreedor, b.monto
       FROM balance b
       JOIN usuario deudor ON deudor.id = b.deudor_id
       JOIN usuario acreedor ON acreedor.id = b.acreedor_id
       WHERE b.grupo_id = $1 AND (b.deudor_id = $2 OR b.acreedor_id = $2)
       ORDER BY b.monto DESC`,
      [grupoId, usuarioId],
    );
    return resultado.rows;
  }

  async listarHistorial(usuarioId: number, grupoId: number, limite: number): Promise<unknown[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT m.id, m.tipo_movimiento AS "tipoMovimiento", m.descripcion, m.fecha,
              m.usuario_id AS "usuarioId", u.nombre AS usuario,
              m.gasto_id AS "gastoId", g.descripcion AS gasto
       FROM movimiento m
       JOIN usuario u ON u.id = m.usuario_id
       LEFT JOIN gasto g ON g.id = m.gasto_id
       WHERE m.grupo_id = $1
       ORDER BY m.fecha DESC, m.id DESC
       LIMIT $2`,
      [grupoId, limite],
    );
    return resultado.rows;
  }

  async obtenerResumen(usuarioId: number): Promise<unknown> {
    const resultado = await this.pool.query(
      `WITH meses AS (
         SELECT generate_series(
           date_trunc('month', CURRENT_DATE) - INTERVAL '3 months',
           date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', INTERVAL '1 month'
         ) AS mes
       ), gasto_mensual AS (
         SELECT date_trunc('month', fecha_gasto)::date AS mes, SUM(monto_total) AS total
         FROM gasto
         WHERE pagador_id = $1
           AND fecha_gasto >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
           AND fecha_gasto < date_trunc('month', CURRENT_DATE)
         GROUP BY date_trunc('month', fecha_gasto)
       )
       SELECT
         (SELECT COUNT(*)::int FROM miembro_grupo WHERE usuario_id = $1 AND estado = 'activo') AS "gruposActivos",
         (SELECT COUNT(*)::int FROM gasto WHERE pagador_id = $1) AS "gastosRegistrados",
         COALESCE((SELECT SUM(monto_total) FROM gasto
                   WHERE pagador_id = $1 AND fecha_gasto >= date_trunc('month', CURRENT_DATE)), 0) AS "gastoMesActual",
         COALESCE((SELECT SUM(p.monto_asignado) FROM participacion_gasto p
                   WHERE p.usuario_id = $1 AND p.estado_pago = 'pendiente'), 0) AS "deudaPendiente",
         COALESCE((SELECT ROUND(AVG(COALESCE(gm.total, 0)), 2)
                   FROM meses m LEFT JOIN gasto_mensual gm ON gm.mes = m.mes), 0) AS "proyeccionMensual",
         'promedio_movil_3_meses' AS "metodoProyeccion"`,
      [usuarioId],
    );
    return resultado.rows[0];
  }

  async listarNotificaciones(usuarioId: number, limite: number): Promise<unknown[]> {
    const resultado = await this.pool.query(
      `SELECT id, tipo, mensaje, leido, fecha_creacion AS "fechaCreacion"
       FROM notificacion WHERE usuario_id = $1
       ORDER BY fecha_creacion DESC, id DESC LIMIT $2`,
      [usuarioId, limite],
    );
    return resultado.rows;
  }

  async marcarNotificacionLeida(usuarioId: number, notificacionId: number): Promise<void> {
    const resultado = await this.pool.query(
      `UPDATE notificacion SET leido = TRUE
       WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [notificacionId, usuarioId],
    );
    if (resultado.rowCount === 0) throw new NotificacionNoEncontradaError(notificacionId);
  }

  private async exigirMiembro(
    client: Pool | PoolClient,
    usuarioId: number,
    grupoId: number,
    bloquear = false,
  ): Promise<void> {
    if (bloquear) {
      const grupo = await client.query(`SELECT id FROM grupo WHERE id = $1 FOR UPDATE`, [grupoId]);
      if (grupo.rowCount === 0) throw new GrupoNoEncontradoError(grupoId);
    }
    const resultado = await client.query(
      `SELECT 1 FROM miembro_grupo
       WHERE grupo_id = $1 AND usuario_id = $2 AND estado = 'activo'`,
      [grupoId, usuarioId],
    );
    if (resultado.rowCount === 0) throw new AccesoDenegadoError('No tienes acceso a este grupo.');
  }

  private async exigirAdministrador(client: PoolClient, usuarioId: number, grupoId: number): Promise<void> {
    const resultado = await client.query(
      `SELECT g.id FROM grupo g
       JOIN miembro_grupo m ON m.grupo_id = g.id
       WHERE g.id = $1 AND m.usuario_id = $2 AND m.estado = 'activo' AND m.rol = 'administrador'
       FOR UPDATE OF g`,
      [grupoId, usuarioId],
    );
    if (resultado.rowCount === 0) throw new AccesoDenegadoError('Solo un administrador activo puede gestionar integrantes.');
  }

  private async registrarMovimiento(
    client: PoolClient,
    usuarioId: number,
    grupoId: number,
    gastoId: number | null,
    tipo: string,
    descripcion: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO movimiento (usuario_id, grupo_id, gasto_id, tipo_movimiento, descripcion)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuarioId, grupoId, gastoId, tipo, descripcion],
    );
  }

  private async recalcularBalances(client: PoolClient, grupoId: number): Promise<void> {
    await client.query(`DELETE FROM balance WHERE grupo_id = $1`, [grupoId]);
    await client.query(
      `WITH deudas AS (
         SELECT p.usuario_id AS deudor_id, g.pagador_id AS acreedor_id,
                SUM(p.monto_asignado) AS monto
         FROM participacion_gasto p
         JOIN gasto g ON g.id = p.gasto_id
         WHERE g.grupo_id = $1 AND p.estado_pago = 'pendiente' AND p.usuario_id <> g.pagador_id
         GROUP BY p.usuario_id, g.pagador_id
       ), pares AS (
         SELECT LEAST(deudor_id, acreedor_id) AS usuario_a,
                GREATEST(deudor_id, acreedor_id) AS usuario_b,
                SUM(CASE WHEN deudor_id < acreedor_id THEN monto ELSE 0 END) AS deuda_a_b,
                SUM(CASE WHEN deudor_id > acreedor_id THEN monto ELSE 0 END) AS deuda_b_a
         FROM deudas
         GROUP BY LEAST(deudor_id, acreedor_id), GREATEST(deudor_id, acreedor_id)
       )
       INSERT INTO balance (grupo_id, deudor_id, acreedor_id, monto)
       SELECT $1,
              CASE WHEN deuda_a_b > deuda_b_a THEN usuario_a ELSE usuario_b END,
              CASE WHEN deuda_a_b > deuda_b_a THEN usuario_b ELSE usuario_a END,
              ABS(deuda_a_b - deuda_b_a)
       FROM pares
       WHERE deuda_a_b <> deuda_b_a`,
      [grupoId],
    );
  }

  private async enTransaccion<T>(operacion: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const resultado = await operacion(client);
      await client.query('COMMIT');
      return resultado;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}