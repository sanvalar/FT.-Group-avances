import { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import {
  AccesoDenegadoError,
  ConflictoEstadoError,
  GastoNoEncontradoError,
  GrupoNoEncontradoError,
  NotificacionNoEncontradaError,
  UsuarioNoEncontradoError,
  ValidacionError,
} from '../../../../../domain/errors/DomainErrors';
import {
  exigirCupoEnGrupos as validarCupoDeGrupos,
  validarMaximoIntegrantes,
} from '../../../../../domain/services/groupLimits';
import {
  CrearGastoDatos,
  GrupoGastoRepository,
  GrupoResumen,
  LiquidacionPendiente,
  PlantillaDivision,
} from '../../../../../domain/ports/out/GrupoGastoRepository';
import { verificarDatosFactura } from '../../../../../domain/services/verificadorFacturaInternacional';

export class PostgresGrupoGastoRepository implements GrupoGastoRepository {
  constructor(private readonly pool: Pool, private readonly poolHistorico: Pool) {}

  async crearGrupo(
    usuarioId: number,
    nombre: string,
    descripcion?: string,
    integrantes: string[] = [],
    moneda = 'COP',
    tasaCop = 1,
    instruccionesPago?: string,
  ): Promise<GrupoResumen> {
    return this.enTransaccion(async (client) => {
      const invitados = new Set<number>();
      for (const email of new Set(integrantes.map((valor) => valor.trim().toLowerCase()))) {
        const resultadoUsuario = await client.query(
          `SELECT id FROM usuario WHERE LOWER(email) = $1 AND estado = 'activo'`,
          [email],
        );
        if (resultadoUsuario.rowCount === 0) throw new UsuarioNoEncontradoError(email);
        const integranteId = Number(resultadoUsuario.rows[0].id);
        if (integranteId !== usuarioId) invitados.add(integranteId);
      }

      const usuarioIds = [usuarioId, ...invitados];
      validarMaximoIntegrantes(usuarioIds.length);
      await this.bloquearLimitesUsuario(client, usuarioIds);
      for (const integranteId of usuarioIds) {
        await this.validarCupoGrupoUsuario(client, integranteId);
      }

      const resultado = await client.query(
        `INSERT INTO grupo (nombre, descripcion, creado_por, moneda, tasa_cop, instrucciones_pago)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nombre, descripcion, fecha_creacion, moneda, tasa_cop, instrucciones_pago`,
        [nombre, descripcion || null, usuarioId, moneda, tasaCop, instruccionesPago || null],
      );
      const grupo = resultado.rows[0];
      let miembrosActivos = 1;
      await client.query(
        `INSERT INTO miembro_grupo (grupo_id, usuario_id, rol)
         VALUES ($1, $2, 'administrador')`,
        [grupo.id, usuarioId],
      );
      for (const integranteId of invitados) {
        await client.query(
          `INSERT INTO miembro_grupo (grupo_id, usuario_id, rol)
           VALUES ($1, $2, 'miembro')`,
          [grupo.id, integranteId],
        );
        miembrosActivos += 1;
        await client.query(
          `INSERT INTO notificacion (usuario_id, tipo, mensaje)
           VALUES ($1, 'invitacion_grupo', 'Te agregaron a un grupo de gastos compartidos.')`,
          [integranteId],
        );
        await this.registrarMovimiento(client, usuarioId, grupo.id, null, 'miembro_agregado', 'Se agregó un integrante al grupo.');
      }
      return {
        id: grupo.id,
        nombre: grupo.nombre,
        descripcion: grupo.descripcion,
        rol: 'administrador',
        miembrosActivos,
        fechaCreacion: grupo.fecha_creacion,
        moneda: grupo.moneda,
        tasaCop: Number(grupo.tasa_cop),
        instruccionesPago: grupo.instrucciones_pago,
      };
    });
  }

  async listarGrupos(usuarioId: number): Promise<GrupoResumen[]> {
    const resultado = await this.pool.query(
      `SELECT g.id, g.nombre, g.descripcion, g.moneda, g.tasa_cop, g.instrucciones_pago,
              m.rol, g.fecha_creacion,
              COUNT(mi.id)::int AS miembros_activos
       FROM grupo g
       JOIN miembro_grupo m ON m.grupo_id = g.id AND m.usuario_id = $1 AND m.estado = 'activo'
       JOIN miembro_grupo mi ON mi.grupo_id = g.id AND mi.estado = 'activo'
       WHERE g.estado = 'activo'
       GROUP BY g.id, g.nombre, g.descripcion, g.moneda, g.tasa_cop, g.instrucciones_pago, m.rol, g.fecha_creacion
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
      moneda: fila.moneda,
      tasaCop: Number(fila.tasa_cop),
      instruccionesPago: fila.instrucciones_pago,
    }));
  }

  async archivarGrupo(actorId: number, grupoId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      const resultado = await client.query(
        `SELECT g.id, g.nombre, g.descripcion, g.creado_por, g.fecha_creacion
         FROM grupo g
         JOIN miembro_grupo m ON m.grupo_id = g.id
         WHERE g.id = $1 AND g.estado = 'activo' AND m.usuario_id = $2
           AND m.estado = 'activo' AND m.rol = 'administrador'
         FOR UPDATE OF g`,
        [grupoId, actorId],
      );
      if (resultado.rowCount === 0) {
        throw new AccesoDenegadoError('No tienes permiso: solo un administrador activo del grupo puede archivarlo.');
      }

      const grupo = resultado.rows[0];
      await this.poolHistorico.query(
        `INSERT INTO historico.grupo_archivado (id, nombre, descripcion, creado_por, fecha_creacion)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [grupo.id, grupo.nombre, grupo.descripcion, grupo.creado_por, grupo.fecha_creacion],
      );
      await client.query(`UPDATE grupo SET estado = 'archivado' WHERE id = $1`, [grupoId]);
    });
  }

  listarGruposArchivados(usuarioId: number): Promise<unknown[]> {
    return this.poolHistorico.query(
      `SELECT id, nombre, descripcion, 'archivado' AS estado, fecha_creacion AS "fechaCreacion"
       FROM historico.grupo_archivado
       WHERE creado_por = $1
       ORDER BY fecha_creacion DESC, id DESC`,
      [usuarioId],
    ).then((resultado) => resultado.rows);
  }

  async agregarMiembro(actorId: number, grupoId: number, identificador: number | string): Promise<void> {
    await this.enTransaccion(async (client) => {
      await this.exigirAdministrador(client, actorId, grupoId);
      let usuarioId = identificador;
      if (typeof identificador === 'string') {
        const usuarioPorCorreo = await client.query(
          `SELECT id FROM usuario WHERE LOWER(email) = $1 AND estado = 'activo'`,
          [identificador.trim().toLowerCase()],
        );
        if (usuarioPorCorreo.rowCount === 0) throw new UsuarioNoEncontradoError(identificador);
        usuarioId = Number(usuarioPorCorreo.rows[0].id);
      }
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

      await this.bloquearLimitesUsuario(client, [Number(usuarioId)]);
      await this.validarCupoGrupoUsuario(client, Number(usuarioId));
      const integrantesActivos = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM miembro_grupo WHERE grupo_id = $1 AND estado = 'activo'`,
        [grupoId],
      );
      validarMaximoIntegrantes(integrantesActivos.rows[0].total + 1);

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
      const huellaSolicitud = datos.solicitudId
        ? createHash('sha256').update(JSON.stringify(datos)).digest('hex')
        : null;
      if (datos.solicitudId) {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`${grupoId}:${actorId}:${datos.solicitudId}`],
        );
        const existente = await client.query(
          `SELECT id, grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria,
                  tipo_division, origen_registro, fecha_registro, moneda_original, monto_original,
                  tasa_cambio, huella_solicitud,
                  (SELECT COALESCE(json_agg(json_build_object(
                    'usuarioId', p.usuario_id, 'montoAsignado', p.monto_asignado
                  ) ORDER BY p.usuario_id), '[]'::json)
                   FROM participacion_gasto p WHERE p.gasto_id = gasto.id) AS participaciones,
                  (SELECT COALESCE(json_agg(json_build_object(
                    'descripcion', a.descripcion, 'cantidad', a.cantidad, 'montoTotal', a.monto_total
                  ) ORDER BY a.orden), '[]'::json)
                   FROM gasto_articulo a WHERE a.gasto_id = gasto.id) AS articulos
           FROM gasto
           WHERE grupo_id = $1 AND creado_por = $2 AND solicitud_id = $3
           FOR UPDATE`,
          [grupoId, actorId, datos.solicitudId],
        );
        if (existente.rows[0]) {
          if (existente.rows[0].huella_solicitud !== huellaSolicitud) {
            throw new ConflictoEstadoError('El identificador de sincronización ya se usó con datos distintos.');
          }
          const { huella_solicitud: _huella, ...gastoExistente } = existente.rows[0];
          return gastoExistente;
        }
      }
      const pagadorId = datos.pagadorId ?? actorId;
      const pagadorActivo = await client.query(
        `SELECT 1 FROM miembro_grupo WHERE grupo_id = $1 AND usuario_id = $2 AND estado = 'activo'`,
        [grupoId, pagadorId],
      );
      if (pagadorActivo.rowCount === 0) {
        throw new ValidacionError('El pagador debe pertenecer al grupo y estar activo.');
      }
      let duplicada = false;
      let nitNormalizado: string | null = null;
      let numeroFacturaNormalizado: string | null = null;
      if (datos.comprobante) {
        nitNormalizado = datos.comprobante.nit?.replace(/\D/g, '') || null;
        numeroFacturaNormalizado = datos.comprobante.numeroFactura?.trim().toUpperCase() || null;
        const existente = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM comprobante_factura
             WHERE archivo_hash = $1
                OR ($2::varchar IS NOT NULL AND $3::varchar IS NOT NULL
                    AND nit_normalizado = $2 AND numero_factura_normalizado = $3)
           ) AS duplicada`,
          [datos.comprobante.archivoHash, nitNormalizado, numeroFacturaNormalizado],
        );
        duplicada = existente.rows[0].duplicada;
      }
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
        `INSERT INTO gasto
          (grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria, tipo_division,
           origen_registro, moneda_original, monto_original, tasa_cambio, creado_por, solicitud_id, huella_solicitud)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria,
                   tipo_division, origen_registro, fecha_registro, moneda_original, monto_original, tasa_cambio`,
        [
          grupoId,
          pagadorId,
          datos.descripcion,
          datos.montoTotal,
          datos.fechaGasto,
          datos.categoria,
          datos.tipoDivision,
          datos.origenRegistro ?? 'manual',
          datos.monedaOriginal ?? 'COP',
          datos.montoOriginal ?? datos.montoTotal,
          datos.tasaCambio ?? 1,
          actorId,
          datos.solicitudId ?? null,
          huellaSolicitud,
        ],
      );
      const gasto = gastoResultado.rows[0];
      for (const [orden, articulo] of (datos.articulos ?? []).entries()) {
        await client.query(
          `INSERT INTO gasto_articulo (gasto_id, descripcion, cantidad, monto_total, orden)
           VALUES ($1, $2, $3, $4, $5)`,
          [gasto.id, articulo.descripcion, articulo.cantidad, articulo.montoTotal, orden],
        );
      }
      let comprobanteVerificacion;
      if (datos.comprobante) {
        comprobanteVerificacion = verificarDatosFactura(datos.comprobante, duplicada);
        await client.query(
          `INSERT INTO comprobante_factura
            (gasto_id, archivo_hash, comercio, nit_normalizado, numero_factura_normalizado,
             cufe, fecha_factura, monto_total, estado_verificacion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            gasto.id,
            datos.comprobante.archivoHash,
            datos.comprobante.comercio,
            nitNormalizado,
            numeroFacturaNormalizado,
            datos.comprobante.cufe,
            datos.comprobante.fecha,
            datos.comprobante.montoTotal,
            comprobanteVerificacion.estado,
          ],
        );
      }

      for (const participacion of datos.participaciones) {
        await client.query(
          `INSERT INTO participacion_gasto (gasto_id, usuario_id, monto_asignado, estado_pago, fecha_pago)
           VALUES ($1, $2, $3, $4, CASE WHEN $4::varchar = 'pagado' THEN NOW() ELSE NULL END)`,
          [gasto.id, participacion.usuarioId, participacion.montoAsignado, participacion.usuarioId === pagadorId ? 'pagado' : 'pendiente'],
        );
      }

      if (datos.recurrencia) {
        if (datos.recurrencia.proximaFecha <= new Date().toISOString().slice(0, 10)) {
          throw new ValidacionError('La primera fecha recurrente debe ser futura.');
        }
        await client.query(
          `INSERT INTO gasto_recurrente
            (grupo_id, creado_por, pagador_id, descripcion, monto_total, categoria, tipo_division,
             participaciones, articulos, moneda_original, monto_original, tasa_cambio, frecuencia,
             proxima_fecha, mes_ano, dia_mes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14,
                   EXTRACT(MONTH FROM $14::date)::smallint, EXTRACT(DAY FROM $14::date)::smallint)`,
          [
            grupoId, actorId, pagadorId, datos.descripcion, datos.montoTotal, datos.categoria,
            datos.tipoDivision, JSON.stringify(datos.participaciones), JSON.stringify(datos.articulos ?? []),
            datos.monedaOriginal ?? 'COP', datos.montoOriginal ?? datos.montoTotal,
            datos.tasaCambio ?? 1, datos.recurrencia.frecuencia, datos.recurrencia.proximaFecha,
          ],
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

      return {
        ...gasto,
        participaciones: datos.participaciones,
        articulos: datos.articulos ?? [],
        comprobanteVerificacion,
      };
    });
  }

  async listarGastos(usuarioId: number, grupoId: number): Promise<unknown[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    await this.generarGastosRecurrentes(grupoId);
    const resultado = await this.pool.query(
      `SELECT g.id, g.grupo_id, g.pagador_id, u.nombre AS pagador, g.descripcion,
              g.monto_total, g.fecha_gasto, g.categoria, g.tipo_division, g.origen_registro, g.fecha_registro,
              g.moneda_original, g.monto_original, g.tasa_cambio,
              COALESCE(grupo.tasa_cop, 1) AS tasa_cop,
              (SELECT COALESCE(json_agg(json_build_object(
                'descripcion', a.descripcion, 'cantidad', a.cantidad, 'montoTotal', a.monto_total
              ) ORDER BY a.orden), '[]'::json)
               FROM gasto_articulo a WHERE a.gasto_id = g.id) AS articulos,
              (SELECT json_build_object(
                'archivoHash', cf.archivo_hash, 'comercio', cf.comercio, 'nit', cf.nit_normalizado,
                'numeroFactura', cf.numero_factura_normalizado, 'cufe', cf.cufe,
                'fecha', cf.fecha_factura, 'montoTotal', cf.monto_total,
                'estado', cf.estado_verificacion, 'fuente', 'validacion_local',
                'verificacionOficial', FALSE
              ) FROM comprobante_factura cf WHERE cf.gasto_id = g.id) AS comprobante_verificacion,
              COALESCE(json_agg(json_build_object(
                'usuarioId', p.usuario_id, 'nombre', up.nombre, 'montoAsignado', p.monto_asignado,
                'estadoPago', p.estado_pago, 'fechaPago', p.fecha_pago
              ) ORDER BY p.usuario_id) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS participaciones
       FROM gasto g
       JOIN grupo ON grupo.id = g.grupo_id
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

  async listarRecurrencias(usuarioId: number, grupoId: number): Promise<unknown[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT id, descripcion, monto_total AS "montoTotal", categoria, frecuencia,
              proxima_fecha AS "proximaFecha", activa, moneda_original AS "monedaOriginal"
       FROM gasto_recurrente
       WHERE grupo_id = $1
       ORDER BY proxima_fecha, id`,
      [grupoId],
    );
    return resultado.rows;
  }

  async cambiarRecurrencia(actorId: number, grupoId: number, recurrenciaId: number, activa: boolean): Promise<void> {
    await this.enTransaccion(async (client) => {
      await this.exigirAdministrador(client, actorId, grupoId);
      const resultado = await client.query(
        `UPDATE gasto_recurrente SET activa = $3
         WHERE id = $1 AND grupo_id = $2 AND activa <> $3`,
        [recurrenciaId, grupoId, activa],
      );
      if (resultado.rowCount === 0) {
        throw new ConflictoEstadoError('La recurrencia no existe, ya tiene ese estado o ya finalizó.');
      }
    });
  }

  async listarPlantillas(usuarioId: number, grupoId: number): Promise<PlantillaDivision[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT id, grupo_id AS "grupoId", nombre, tipo_division AS "tipoDivision", asignaciones
       FROM plantilla_division
       WHERE grupo_id = $1 AND usuario_id = $2
       ORDER BY nombre, id`,
      [grupoId, usuarioId],
    );
    return resultado.rows;
  }

  async guardarPlantilla(
    usuarioId: number,
    grupoId: number,
    nombre: string,
    tipoDivision: 'equitativa' | 'personalizada' | 'porcentaje' | 'participaciones',
    asignaciones: Array<{ usuarioId: number; valor: number }>,
  ): Promise<{
    id: number;
    grupoId: number;
    nombre: string;
    tipoDivision: 'equitativa' | 'personalizada' | 'porcentaje' | 'participaciones';
    asignaciones: Array<{ usuarioId: number; valor: number }>;
  }> {
    return this.enTransaccion(async (client) => {
      await this.exigirMiembro(client, usuarioId, grupoId, true);
      if (new Set(asignaciones.map(item => item.usuarioId)).size !== asignaciones.length) {
        throw new ValidacionError('La plantilla contiene participantes duplicados.');
      }
      const resultado = await client.query(
        `INSERT INTO plantilla_division (grupo_id, usuario_id, nombre, tipo_division, asignaciones)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (grupo_id, usuario_id, nombre)
         DO UPDATE SET tipo_division = EXCLUDED.tipo_division, asignaciones = EXCLUDED.asignaciones
         RETURNING id, grupo_id AS "grupoId", nombre, tipo_division AS "tipoDivision", asignaciones`,
        [grupoId, usuarioId, nombre, tipoDivision, JSON.stringify(asignaciones)],
      );
      return resultado.rows[0];
    });
  }

  async eliminarPlantilla(actorId: number, grupoId: number, plantillaId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      await this.exigirMiembro(client, actorId, grupoId, true);
      const resultado = await client.query(
        `DELETE FROM plantilla_division
         WHERE id = $1 AND grupo_id = $2 AND usuario_id = $3
         RETURNING id`,
        [plantillaId, grupoId, actorId],
      );
      if (resultado.rowCount === 0) {
        throw new ConflictoEstadoError('No se encontró una plantilla propia en este grupo.');
      }
    });
  }

  private async generarGastosRecurrentes(grupoId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      const recurrencias = await client.query(
        `SELECT * FROM gasto_recurrente
         WHERE grupo_id = $1 AND activa = TRUE AND proxima_fecha <= CURRENT_DATE
         ORDER BY proxima_fecha, id
         FOR UPDATE`,
        [grupoId],
      );
      for (const recurrencia of recurrencias.rows) {
        let generados = 0;
        while (String(recurrencia.proxima_fecha).slice(0, 10) <= new Date().toISOString().slice(0, 10) && generados < 12) {
          const pagadorActivo = await client.query(
            `SELECT 1 FROM miembro_grupo WHERE grupo_id = $1 AND usuario_id = $2 AND estado = 'activo'`,
            [grupoId, recurrencia.pagador_id],
          );
          if (pagadorActivo.rowCount === 0) {
            await client.query(`UPDATE gasto_recurrente SET activa = FALSE WHERE id = $1`, [recurrencia.id]);
            break;
          }
          const fechaProgramada = String(recurrencia.proxima_fecha).slice(0, 10);
          const gasto = await client.query(
            `INSERT INTO gasto
              (grupo_id, pagador_id, descripcion, monto_total, fecha_gasto, categoria, tipo_division,
               origen_registro, moneda_original, monto_original, tasa_cambio, creado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, $10, $11)
             RETURNING id`,
            [
              grupoId, recurrencia.pagador_id, recurrencia.descripcion, recurrencia.monto_total,
              fechaProgramada, recurrencia.categoria, recurrencia.tipo_division,
              recurrencia.moneda_original, recurrencia.monto_original, recurrencia.tasa_cambio,
              recurrencia.creado_por,
            ],
          );
          const gastoId = Number(gasto.rows[0].id);
          const participaciones = typeof recurrencia.participaciones === 'string'
            ? JSON.parse(recurrencia.participaciones) as Array<{ usuarioId: number; montoAsignado: number }>
            : recurrencia.participaciones as Array<{ usuarioId: number; montoAsignado: number }>;
          const activos = await client.query(
            `SELECT usuario_id FROM miembro_grupo
             WHERE grupo_id = $1 AND estado = 'activo' AND usuario_id = ANY($2::bigint[])`,
            [grupoId, participaciones.map(parte => parte.usuarioId)],
          );
          if (activos.rowCount !== participaciones.length) {
            await client.query(`DELETE FROM gasto WHERE id = $1`, [gastoId]);
            await client.query(`UPDATE gasto_recurrente SET activa = FALSE WHERE id = $1`, [recurrencia.id]);
            break;
          }
          for (const parte of participaciones) {
            await client.query(
              `INSERT INTO participacion_gasto (gasto_id, usuario_id, monto_asignado, estado_pago, fecha_pago)
               VALUES ($1, $2, $3, $4, CASE WHEN $4::varchar = 'pagado' THEN NOW() ELSE NULL END)`,
              [gastoId, parte.usuarioId, parte.montoAsignado, parte.usuarioId === Number(recurrencia.pagador_id) ? 'pagado' : 'pendiente'],
            );
          }
          const articulos = typeof recurrencia.articulos === 'string'
            ? JSON.parse(recurrencia.articulos) as Array<{ descripcion: string; cantidad: number; montoTotal: number }>
            : recurrencia.articulos as Array<{ descripcion: string; cantidad: number; montoTotal: number }>;
          for (const [orden, articulo] of (articulos ?? []).entries()) {
            await client.query(
              `INSERT INTO gasto_articulo (gasto_id, descripcion, cantidad, monto_total, orden)
               VALUES ($1, $2, $3, $4, $5)`,
              [gastoId, articulo.descripcion, articulo.cantidad, articulo.montoTotal, orden],
            );
          }
          await client.query(
            `INSERT INTO gasto_recurrente_instancia (recurrencia_id, fecha_programada, gasto_id)
             VALUES ($1, $2, $3)`,
            [recurrencia.id, fechaProgramada, gastoId],
          );
          await this.registrarMovimiento(client, Number(recurrencia.creado_por), grupoId, gastoId, 'gasto_creado', `Se generó el gasto recurrente: ${recurrencia.descripcion}.`);
          await client.query(
            `INSERT INTO notificacion (usuario_id, tipo, mensaje)
             SELECT usuario_id, 'nuevo_gasto', $2 FROM miembro_grupo
             WHERE grupo_id = $1 AND estado = 'activo' AND usuario_id <> $3`,
            [grupoId, `Se generó un gasto recurrente: ${recurrencia.descripcion}.`, recurrencia.creado_por],
          );
          await this.recalcularBalances(client, grupoId);
          const siguiente = await client.query(
            `UPDATE gasto_recurrente
             SET proxima_fecha = CASE frecuencia
               WHEN 'semanal' THEN proxima_fecha + 7
               WHEN 'mensual' THEN (
                 date_trunc('month', proxima_fecha) + INTERVAL '1 month'
                 + (
                   LEAST(
                     dia_mes,
                     EXTRACT(DAY FROM (
                       date_trunc('month', proxima_fecha) + INTERVAL '2 months' - INTERVAL '1 day'
                     ))::int
                   ) - 1
                 ) * INTERVAL '1 day'
               )::date
               ELSE make_date(
                 EXTRACT(YEAR FROM proxima_fecha)::int + 1,
                 mes_ano,
                 LEAST(
                   dia_mes,
                   EXTRACT(DAY FROM (
                     make_date(EXTRACT(YEAR FROM proxima_fecha)::int + 1, mes_ano, 1)
                     + INTERVAL '1 month' - INTERVAL '1 day'
                   ))::int
                 )
               )
             END
             WHERE id = $1
             RETURNING proxima_fecha`,
            [recurrencia.id],
          );
          recurrencia.proxima_fecha = siguiente.rows[0].proxima_fecha;
          generados += 1;
        }
      }
    });
  }

  async eliminarGasto(actorId: number, gastoId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      const referencia = await client.query(
        `SELECT grupo_id FROM gasto WHERE id = $1`,
        [gastoId],
      );
      if (referencia.rowCount === 0) throw new GastoNoEncontradoError(gastoId);
      const grupoId = Number(referencia.rows[0].grupo_id);
      await this.exigirMiembro(client, actorId, grupoId, true);

      const gastoResultado = await client.query(
        `SELECT pagador_id, descripcion FROM gasto WHERE id = $1 FOR UPDATE`,
        [gastoId],
      );
      if (Number(gastoResultado.rows[0].pagador_id) !== actorId) {
        throw new AccesoDenegadoError('Solo quien registró el gasto puede eliminarlo.');
      }

      const pagosConfirmados = await client.query(
        `SELECT 1 FROM participacion_gasto
         WHERE gasto_id = $1 AND usuario_id <> $2 AND estado_pago = 'pagado'
         LIMIT 1`,
        [gastoId, actorId],
      );
      if (pagosConfirmados.rows.length > 0) {
        throw new ConflictoEstadoError('No se puede eliminar un gasto con pagos confirmados. Registra una corrección en lugar de borrarlo.');
      }
      const liquidaciones = await client.query(
        `SELECT 1
         FROM liquidacion_pago l
         WHERE l.grupo_id = $1
           AND l.acreedor_id = $2
           AND (l.gasto_id IS NULL OR l.gasto_id = $3)
           AND l.deudor_id IN (
             SELECT usuario_id FROM participacion_gasto
             WHERE gasto_id = $3 AND usuario_id <> $2
           )
         LIMIT 1`,
        [grupoId, actorId, gastoId],
      );
      if (liquidaciones.rows.length > 0) {
        throw new ConflictoEstadoError('No se puede eliminar un gasto relacionado con una liquidación reportada. Registra una corrección en lugar de borrarlo.');
      }

      await this.registrarMovimiento(
        client,
        actorId,
        grupoId,
        null,
        'gasto_eliminado',
        `Se eliminó el gasto #${gastoId}: ${gastoResultado.rows[0].descripcion}.`,
      );
      await client.query(`DELETE FROM gasto WHERE id = $1`, [gastoId]);
      await this.recalcularBalances(client, grupoId);
    });
  }

  async registrarPago(usuarioId: number, gastoId: number): Promise<LiquidacionPendiente> {
    const gasto = await this.pool.query(
      `SELECT grupo_id, pagador_id FROM gasto WHERE id = $1`,
      [gastoId],
    );
    if (gasto.rowCount === 0) throw new GastoNoEncontradoError(gastoId);

    const grupoId = Number(gasto.rows[0].grupo_id);
    const acreedorId = Number(gasto.rows[0].pagador_id);
    const participacion = await this.pool.query(
      `SELECT monto_asignado FROM participacion_gasto
       WHERE gasto_id = $1 AND usuario_id = $2 AND estado_pago = 'pendiente'`,
      [gastoId, usuarioId],
    );
    if (participacion.rowCount === 0 || usuarioId === acreedorId) {
      throw new ConflictoEstadoError('No existe un pago pendiente de este usuario para el gasto.');
    }

    return this.reportarLiquidacion(
      usuarioId,
      grupoId,
      acreedorId,
      Number(participacion.rows[0].monto_asignado),
      gastoId,
    );
  }

  async listarLiquidacionesPendientes(usuarioId: number, grupoId: number): Promise<LiquidacionPendiente[]> {
    await this.exigirMiembro(this.pool, usuarioId, grupoId);
    const resultado = await this.pool.query(
      `SELECT l.id, l.grupo_id AS "grupoId", l.gasto_id AS "gastoId",
              l.deudor_id AS "deudorId", deudor.nombre AS deudor,
              l.acreedor_id AS "acreedorId", acreedor.nombre AS acreedor,
              l.monto, l.fecha_reporte AS "fechaReporte"
       FROM liquidacion_pago l
       JOIN usuario deudor ON deudor.id = l.deudor_id
       JOIN usuario acreedor ON acreedor.id = l.acreedor_id
       WHERE l.grupo_id = $1 AND l.estado = 'pendiente'
         AND (l.deudor_id = $2 OR l.acreedor_id = $2)
       ORDER BY l.fecha_reporte, l.id`,
      [grupoId, usuarioId],
    );
    return resultado.rows;
  }

  async reportarLiquidacion(
    deudorId: number,
    grupoId: number,
    acreedorId: number,
    monto: number,
    gastoId?: number,
  ): Promise<LiquidacionPendiente> {
    return this.enTransaccion(async (client) => {
      await this.exigirMiembro(client, deudorId, grupoId, true);
      const acreedor = await client.query(
        `SELECT 1 FROM miembro_grupo
         WHERE grupo_id = $1 AND usuario_id = $2 AND estado = 'activo'`,
        [grupoId, acreedorId],
      );
      if (acreedor.rowCount === 0) {
        throw new ValidacionError('El acreedor debe pertenecer al grupo y estar activo.');
      }
      if (deudorId === acreedorId) throw new ValidacionError('No puedes liquidar una deuda contigo mismo.');

      const montoCentavos = Math.round(monto * 100);
      if (gastoId !== undefined) {
        const participacion = await client.query(
          `SELECT p.monto_asignado
           FROM participacion_gasto p
           JOIN gasto g ON g.id = p.gasto_id
           WHERE g.id = $1 AND g.grupo_id = $2 AND g.pagador_id = $3
             AND p.usuario_id = $4 AND p.estado_pago = 'pendiente'`,
          [gastoId, grupoId, acreedorId, deudorId],
        );
        if (participacion.rowCount === 0
          || Math.round(Number(participacion.rows[0].monto_asignado) * 100) !== montoCentavos) {
          throw new ConflictoEstadoError('El gasto ya no tiene una participación pendiente por ese monto.');
        }
      }
      const balance = await client.query(
        `SELECT monto FROM balance WHERE grupo_id = $1 AND deudor_id = $2 AND acreedor_id = $3`,
        [grupoId, deudorId, acreedorId],
      );
      const pendiente = await client.query(
        `SELECT COALESCE(SUM(monto), 0) AS monto
         FROM liquidacion_pago
         WHERE grupo_id = $1 AND deudor_id = $2 AND acreedor_id = $3 AND estado = 'pendiente'`,
        [grupoId, deudorId, acreedorId],
      );
      if (Number(pendiente.rows[0].monto) > 0) {
        throw new ConflictoEstadoError('Ya existe un pago pendiente de confirmación entre estas personas.');
      }
      const disponibleCentavos = Math.round(Number(balance.rows[0]?.monto ?? 0) * 100)
        - Math.round(Number(pendiente.rows[0].monto) * 100);
      if (montoCentavos <= 0 || montoCentavos > disponibleCentavos) {
        throw new ConflictoEstadoError('El monto reportado supera la deuda disponible o ya tiene un pago pendiente de confirmación.');
      }

      const creado = await client.query(
        `INSERT INTO liquidacion_pago (grupo_id, gasto_id, deudor_id, acreedor_id, monto)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, grupo_id AS "grupoId", gasto_id AS "gastoId", deudor_id AS "deudorId",
                   acreedor_id AS "acreedorId", monto, fecha_reporte AS "fechaReporte"`,
        [grupoId, gastoId ?? null, deudorId, acreedorId, montoCentavos / 100],
      );
      await this.registrarMovimiento(
        client,
        deudorId,
        grupoId,
        null,
        'pago_reportado',
        `Se reportó una transferencia de ${montoCentavos / 100} para confirmar.`,
      );
      await client.query(
        `INSERT INTO notificacion (usuario_id, tipo, mensaje)
         VALUES ($1, 'pago_reportado', 'Un integrante reportó un pago pendiente de tu confirmación.')`,
        [acreedorId],
      );
      const nombres = await client.query(
        `SELECT
           (SELECT nombre FROM usuario WHERE id = $1) AS deudor,
           (SELECT nombre FROM usuario WHERE id = $2) AS acreedor`,
        [deudorId, acreedorId],
      );
      return {
        ...creado.rows[0],
        deudor: nombres.rows[0].deudor,
        acreedor: nombres.rows[0].acreedor,
      };
    });
  }

  async confirmarLiquidacion(acreedorId: number, grupoId: number, liquidacionId: number): Promise<void> {
    await this.enTransaccion(async (client) => {
      await this.exigirMiembro(client, acreedorId, grupoId, true);
      const resultado = await client.query(
        `SELECT deudor_id, acreedor_id, monto, estado
         FROM liquidacion_pago
         WHERE id = $1 AND grupo_id = $2
         FOR UPDATE`,
        [liquidacionId, grupoId],
      );
      if (resultado.rowCount === 0) throw new GastoNoEncontradoError(liquidacionId);
      const liquidacion = resultado.rows[0];
      if (Number(liquidacion.acreedor_id) !== acreedorId) {
        throw new AccesoDenegadoError('Solo el acreedor puede confirmar la recepción del pago.');
      }
      if (liquidacion.estado !== 'pendiente') {
        throw new ConflictoEstadoError('Este pago ya fue confirmado.');
      }

      const balance = await client.query(
        `SELECT monto FROM balance WHERE grupo_id = $1 AND deudor_id = $2 AND acreedor_id = $3`,
        [grupoId, liquidacion.deudor_id, acreedorId],
      );
      if (Math.round(Number(balance.rows[0]?.monto ?? 0) * 100) < Math.round(Number(liquidacion.monto) * 100)) {
        throw new ConflictoEstadoError('La deuda cambió y ya no cubre el monto reportado.');
      }

      await client.query(
        `UPDATE liquidacion_pago
         SET estado = 'confirmada', fecha_confirmacion = NOW()
         WHERE id = $1`,
        [liquidacionId],
      );
      await this.registrarMovimiento(
        client,
        acreedorId,
        grupoId,
        null,
        'pago_registrado',
        `Se confirmó la recepción de una transferencia de ${liquidacion.monto}.`,
      );
      await client.query(
        `INSERT INTO notificacion (usuario_id, tipo, mensaje)
         VALUES ($1, 'pago_recibido', 'El acreedor confirmó la recepción de tu pago.')`,
        [liquidacion.deudor_id],
      );
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

  private async bloquearLimitesUsuario(client: PoolClient, usuarioIds: number[]): Promise<void> {
    for (const usuarioId of [...new Set(usuarioIds)].sort((a, b) => a - b)) {
      await client.query('SELECT pg_advisory_xact_lock(771, $1)', [usuarioId]);
    }
  }

  private async validarCupoGrupoUsuario(client: PoolClient, usuarioId: number): Promise<void> {
    const resultado = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM miembro_grupo m
       JOIN grupo g ON g.id = m.grupo_id
       WHERE m.usuario_id = $1 AND m.estado = 'activo' AND g.estado = 'activo'`,
      [usuarioId],
    );
    validarCupoDeGrupos(resultado.rows[0].total);
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
      `WITH movimientos AS (
         SELECT p.usuario_id AS deudor_id, g.pagador_id AS acreedor_id,
                SUM(p.monto_asignado) AS monto
         FROM participacion_gasto p
         JOIN gasto g ON g.id = p.gasto_id
         WHERE g.grupo_id = $1 AND p.estado_pago = 'pendiente' AND p.usuario_id <> g.pagador_id
         GROUP BY p.usuario_id, g.pagador_id
         UNION ALL
         SELECT deudor_id, acreedor_id, -SUM(monto) AS monto
         FROM liquidacion_pago
         WHERE grupo_id = $1 AND estado = 'confirmada'
         GROUP BY deudor_id, acreedor_id
       ), pares AS (
         SELECT LEAST(deudor_id, acreedor_id) AS usuario_a,
                GREATEST(deudor_id, acreedor_id) AS usuario_b,
                SUM(CASE WHEN deudor_id < acreedor_id THEN monto ELSE 0 END) AS deuda_a_b,
                SUM(CASE WHEN deudor_id > acreedor_id THEN monto ELSE 0 END) AS deuda_b_a
         FROM movimientos
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