import { Pool } from 'pg';
import { EstadoUsuario, RolUsuario } from '../../../../../domain/entities/Usuario';
import { AdministracionRepository, SupervisionFinanciera, UsuarioAdministracion } from '../../../../../domain/ports/out/AdministracionRepository';

interface FilaUsuarioAdministracion {
  id: number;
  nombre: string;
  email: string;
  estado: EstadoUsuario;
  rol: RolUsuario;
  fecha_registro: Date;
}

export class PostgresAdministracionRepository implements AdministracionRepository {
  /**
   * Recibe dos pools de bases de datos:
   * 1. poolActivos: Contiene usuarios con estado 'activo'
   * 2. poolHistorico: Almacena en frío usuarios 'inactivos' o dados de baja
   */
  constructor(
    private readonly poolActivos: Pool,
    private readonly poolHistorico: Pool,
  ) {}

  async listarUsuarios(): Promise<UsuarioAdministracion[]> {
    // 1. Consultar base de datos activa
    const activosPromise = this.poolActivos.query<FilaUsuarioAdministracion>(
      `SELECT id, nombre, email, estado, rol, fecha_registro 
       FROM usuario 
       WHERE estado IN ('activo', 'bloqueado')
       ORDER BY fecha_registro DESC, id DESC`,
    );

    // 2. Consultar base de datos / esquema de inactivos (cold storage)
    const inactivosPromise = this.poolHistorico.query<{
      id: number;
      nombre: string;
      email: string;
      rol: RolUsuario;
      fecha_registro: Date;
    }>(
      `SELECT id, nombre, email, 'inactivo'::text AS estado, rol, fecha_registro
       FROM historico.usuario_inactivo
       ORDER BY fecha_registro DESC, id DESC`,
    );

    const [resActivos, resInactivos] = await Promise.all([activosPromise, inactivosPromise]);

    const usuariosActivos = resActivos.rows.map((fila) => this.aUsuario(fila));
    const usuariosInactivos = resInactivos.rows.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      estado: 'inactivo' as EstadoUsuario,
      rol: fila.rol,
      fechaRegistro: new Date(fila.fecha_registro),
    }));

    return [...usuariosActivos, ...usuariosInactivos];
  }

  async buscarUsuario(id: number): Promise<UsuarioAdministracion | null> {
    // Buscar primero en la base de datos de activos
    const resultadoActivo = await this.poolActivos.query<FilaUsuarioAdministracion>(
      `SELECT id, nombre, email, estado, rol, fecha_registro FROM usuario WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (resultadoActivo.rows[0]) {
      return this.aUsuario(resultadoActivo.rows[0]);
    }

    // Si no está activo, buscar en la base de datos de inactivos
    const resultadoInactivo = await this.poolHistorico.query<{
        id: number;
        nombre: string;
        email: string;
        rol: RolUsuario;
        fecha_registro: Date;
      }>(
        `SELECT id, nombre, email, rol, fecha_registro FROM historico.usuario_inactivo WHERE id = $1 LIMIT 1`,
        [id],
      );
    if (resultadoInactivo.rows[0]) {
      const fila = resultadoInactivo.rows[0];
      return {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        estado: 'inactivo',
        rol: fila.rol,
        fechaRegistro: new Date(fila.fecha_registro),
      };
    }

    return null;
  }

  async consultarFinanzasUsuario(id: number, limite: number, offset: number): Promise<SupervisionFinanciera | null> {
    const usuarioResultado = await this.poolActivos.query<FilaUsuarioAdministracion>(
      `SELECT id, nombre, email, estado, rol, fecha_registro
       FROM usuario
       WHERE id = $1`,
      [id],
    );
    const filaUsuario = usuarioResultado.rows[0];
    if (!filaUsuario) return null;

    const [gruposResultado, resumenResultado, gastosResultado] = await Promise.all([
      this.poolActivos.query(
        `SELECT g.id, g.nombre, g.estado, m.rol, m.fecha_union, g.fecha_creacion,
                COUNT(DISTINCT ga.id)::int AS numero_gastos
         FROM miembro_grupo m
         JOIN grupo g ON g.id = m.grupo_id
         LEFT JOIN gasto ga ON ga.grupo_id = g.id
         WHERE m.usuario_id = $1
         GROUP BY g.id, g.nombre, g.estado, m.rol, m.fecha_union, g.fecha_creacion
         ORDER BY g.fecha_creacion DESC, g.id DESC`,
        [id],
      ),
      this.poolActivos.query(
        `SELECT
           (SELECT COUNT(*)::int FROM miembro_grupo WHERE usuario_id = $1) AS grupos,
           (SELECT COUNT(DISTINCT g.id)::int
            FROM gasto g
            WHERE EXISTS (SELECT 1 FROM miembro_grupo m WHERE m.grupo_id = g.grupo_id AND m.usuario_id = $1)
              AND (g.pagador_id = $1 OR EXISTS (
                SELECT 1 FROM participacion_gasto px WHERE px.gasto_id = g.id AND px.usuario_id = $1
              ))) AS gastos,
           (SELECT COALESCE(SUM(g.monto_total), 0)::text
            FROM gasto g
            WHERE g.pagador_id = $1
              AND EXISTS (SELECT 1 FROM miembro_grupo m WHERE m.grupo_id = g.grupo_id AND m.usuario_id = $1)) AS monto_pagado,
           (SELECT COALESCE(SUM(p.monto_asignado), 0)::text
            FROM participacion_gasto p
            JOIN gasto g ON g.id = p.gasto_id
            WHERE p.usuario_id = $1
              AND EXISTS (SELECT 1 FROM miembro_grupo m WHERE m.grupo_id = g.grupo_id AND m.usuario_id = $1)) AS monto_asignado,
           (SELECT COALESCE(SUM(p.monto_asignado), 0)::text
            FROM participacion_gasto p
            JOIN gasto g ON g.id = p.gasto_id
            WHERE p.usuario_id = $1 AND p.estado_pago = 'pendiente'
              AND EXISTS (SELECT 1 FROM miembro_grupo m WHERE m.grupo_id = g.grupo_id AND m.usuario_id = $1)) AS monto_pendiente`,
        [id],
      ),
      this.poolActivos.query(
        `SELECT g.id, g.grupo_id, gr.nombre AS grupo, g.pagador_id, pagador.nombre AS pagador,
                g.descripcion, g.monto_total, g.fecha_gasto, g.categoria,
                p.monto_asignado, p.estado_pago, p.fecha_pago
         FROM miembro_grupo mg
         JOIN gasto g ON g.grupo_id = mg.grupo_id
         JOIN grupo gr ON gr.id = g.grupo_id
         JOIN usuario pagador ON pagador.id = g.pagador_id
         LEFT JOIN participacion_gasto p ON p.gasto_id = g.id AND p.usuario_id = $1
         WHERE mg.usuario_id = $1
           AND (g.pagador_id = $1 OR p.usuario_id = $1)
         ORDER BY g.fecha_gasto DESC, g.id DESC
         LIMIT $2 OFFSET $3`,
        [id, limite, offset],
      ),
    ]);

    const resumen = resumenResultado.rows[0];
    return {
      usuario: this.aUsuario(filaUsuario),
      resumen: {
        grupos: resumen.grupos,
        gastos: resumen.gastos,
        montoPagado: resumen.monto_pagado,
        montoAsignado: resumen.monto_asignado,
        montoPendiente: resumen.monto_pendiente,
      },
      grupos: gruposResultado.rows.map((fila) => ({
        id: Number(fila.id),
        nombre: fila.nombre,
        estado: fila.estado,
        rol: fila.rol,
        fechaUnion: new Date(fila.fecha_union),
        fechaCreacion: new Date(fila.fecha_creacion),
        numeroGastos: fila.numero_gastos,
      })),
      gastos: gastosResultado.rows.map((fila) => ({
        id: Number(fila.id),
        grupoId: Number(fila.grupo_id),
        grupo: fila.grupo,
        pagadorId: Number(fila.pagador_id),
        pagador: fila.pagador,
        descripcion: fila.descripcion,
        montoTotal: fila.monto_total,
        fechaGasto: new Date(fila.fecha_gasto),
        categoria: fila.categoria,
        montoAsignado: fila.monto_asignado,
        estadoPago: fila.estado_pago,
        fechaPago: fila.fecha_pago ? new Date(fila.fecha_pago) : null,
      })),
      paginacion: {
        limite,
        offset,
        total: resumen.gastos,
      },
    };
  }

  async cambiarEstado(id: number, estado: EstadoUsuario): Promise<UsuarioAdministracion | null> {
    if (estado === 'inactivo') {
      const usuarioActivo = await this.buscarUsuario(id);
      if (!usuarioActivo) return null;
      await this.poolHistorico.query(
        `INSERT INTO historico.usuario_inactivo (id, nombre, email, rol, fecha_registro)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET fecha_desactivacion = NOW()`,
        [usuarioActivo.id, usuarioActivo.nombre, usuarioActivo.email, usuarioActivo.rol, usuarioActivo.fechaRegistro],
      );
      const res = await this.poolActivos.query<FilaUsuarioAdministracion>(
        `UPDATE usuario SET estado = 'inactivo' WHERE id = $1 RETURNING id, nombre, email, estado, rol, fecha_registro`,
        [id],
      );
      return res.rows[0] ? this.aUsuario(res.rows[0]) : null;
    }

    const res = await this.poolActivos.query<FilaUsuarioAdministracion>(
      `UPDATE usuario SET estado = $1 WHERE id = $2 RETURNING id, nombre, email, estado, rol, fecha_registro`,
      [estado, id],
    );
    if (!res.rows[0]) return null;
    await this.poolHistorico.query(`DELETE FROM historico.usuario_inactivo WHERE id = $1`, [id]);
    return this.aUsuario(res.rows[0]);
  }

  async cambiarRol(id: number, rol: RolUsuario): Promise<UsuarioAdministracion | null> {
    const resultado = await this.poolActivos.query<FilaUsuarioAdministracion>(
      `UPDATE usuario SET rol = $1 WHERE id = $2 RETURNING id, nombre, email, estado, rol, fecha_registro`,
      [rol, id],
    );
    return resultado.rows[0] ? this.aUsuario(resultado.rows[0]) : null;
  }

  private aUsuario(fila: FilaUsuarioAdministracion): UsuarioAdministracion {
    return {
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      estado: fila.estado,
      rol: fila.rol,
      fechaRegistro: new Date(fila.fecha_registro),
    };
  }
}
