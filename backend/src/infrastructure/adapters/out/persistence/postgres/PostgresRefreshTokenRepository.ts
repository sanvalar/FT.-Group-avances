import { Pool } from 'pg';
import {
  RefreshTokenRegistro,
  RefreshTokenRepository,
} from '../../../../../domain/ports/out/RefreshTokenRepository';

interface FilaRefreshToken {
  id: number;
  usuario_id: number;
  token: string;
  fecha_creacion: Date;
  fecha_expiracion: Date;
  revocado: boolean;
}

/**
 * Adaptador de salida (persistencia): implementa RefreshTokenRepository
 * usando PostgreSQL (tabla REFRESH_TOKEN, seccion 3.2 del esquema de BD).
 */
export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(registro: RefreshTokenRegistro): Promise<RefreshTokenRegistro> {
    const query = `
      INSERT INTO refresh_token (usuario_id, token, fecha_creacion, fecha_expiracion, revocado)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, usuario_id, token, fecha_creacion, fecha_expiracion, revocado
    `;
    const valores = [
      registro.usuarioId,
      registro.token,
      registro.fechaCreacion,
      registro.fechaExpiracion,
      registro.revocado,
    ];
    const resultado = await this.pool.query<FilaRefreshToken>(query, valores);
    return this.aRegistro(resultado.rows[0]);
  }

  async buscarPorToken(token: string): Promise<RefreshTokenRegistro | null> {
    const query = `
      SELECT id, usuario_id, token, fecha_creacion, fecha_expiracion, revocado
      FROM refresh_token
      WHERE token = $1
      LIMIT 1
    `;
    const resultado = await this.pool.query<FilaRefreshToken>(query, [token]);
    if (resultado.rowCount === 0) return null;
    return this.aRegistro(resultado.rows[0]);
  }

  async revocar(token: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_token SET revocado = true WHERE token = $1`, [token]);
  }

  async revocarTodosDeUsuario(usuarioId: number): Promise<void> {
    await this.pool.query(`UPDATE refresh_token SET revocado = true WHERE usuario_id = $1`, [usuarioId]);
  }

  private aRegistro(fila: FilaRefreshToken): RefreshTokenRegistro {
    return {
      id: fila.id,
      usuarioId: fila.usuario_id,
      token: fila.token,
      fechaCreacion: new Date(fila.fecha_creacion),
      fechaExpiracion: new Date(fila.fecha_expiracion),
      revocado: fila.revocado,
    };
  }
}
