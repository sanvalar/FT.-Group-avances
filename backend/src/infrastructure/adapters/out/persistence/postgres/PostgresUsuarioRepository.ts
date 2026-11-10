import { Pool } from 'pg';
import { Usuario, EstadoUsuario, RolUsuario } from '../../../../../domain/entities/Usuario';
import { UsuarioRepository } from '../../../../../domain/ports/out/UsuarioRepository';

interface FilaUsuario {
  id: number;
  nombre: string;
  email: string;
  password_hash: string;
  telefono: string | null;
  fecha_registro: Date;
  estado: EstadoUsuario;
  rol: RolUsuario;
}

/**
 * Adaptador de salida (persistencia): implementa el puerto
 * UsuarioRepository usando PostgreSQL. Toda sentencia SQL relacionada
 * con la tabla USUARIO vive unicamente aqui (ver seccion 3.1 del
 * esquema de base de datos).
 *
 * Usa consultas parametrizadas ($1, $2, ...) para evitar inyeccion SQL,
 * conforme a las "Consideraciones de seguridad" del documento de
 * arquitectura.
 */
export class PostgresUsuarioRepository implements UsuarioRepository {
  constructor(private readonly pool: Pool) {}

  async guardar(usuario: Usuario): Promise<Usuario> {
    if (usuario.id) {
      return this.actualizar(usuario);
    }

    const query = `
      INSERT INTO usuario (nombre, email, password_hash, telefono, estado)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nombre, email, password_hash, telefono, fecha_registro, estado, rol
    `;
    const valores = [usuario.nombre, usuario.email, usuario.passwordHash, usuario.telefono, usuario.estado];

    const resultado = await this.pool.query<FilaUsuario>(query, valores);
    return this.aEntidad(resultado.rows[0]);
  }

  private async actualizar(usuario: Usuario): Promise<Usuario> {
    const query = `
      UPDATE usuario
      SET nombre = $1, telefono = $2, estado = $3
      WHERE id = $4
      RETURNING id, nombre, email, password_hash, telefono, fecha_registro, estado, rol
    `;
    const valores = [usuario.nombre, usuario.telefono, usuario.estado, usuario.id];
    const resultado = await this.pool.query<FilaUsuario>(query, valores);
    return this.aEntidad(resultado.rows[0]);
  }

  async actualizarPasswordHash(usuarioId: number, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE usuario SET password_hash = $1 WHERE id = $2', [passwordHash, usuarioId]);
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const query = `
      SELECT id, nombre, email, password_hash, telefono, fecha_registro, estado, rol
      FROM usuario
      WHERE email = $1
      LIMIT 1
    `;
    const resultado = await this.pool.query<FilaUsuario>(query, [email.toLowerCase()]);
    if (resultado.rowCount === 0) return null;
    return this.aEntidad(resultado.rows[0]);
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    const query = `
      SELECT id, nombre, email, password_hash, telefono, fecha_registro, estado, rol
      FROM usuario
      WHERE id = $1
      LIMIT 1
    `;
    const resultado = await this.pool.query<FilaUsuario>(query, [id]);
    if (resultado.rowCount === 0) return null;
    return this.aEntidad(resultado.rows[0]);
  }

  async existeEmail(email: string): Promise<boolean> {
    const query = `SELECT 1 FROM usuario WHERE email = $1 LIMIT 1`;
    const resultado = await this.pool.query(query, [email.toLowerCase()]);
    return (resultado.rowCount ?? 0) > 0;
  }

  private aEntidad(fila: FilaUsuario): Usuario {
    return Usuario.reconstruir({
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      passwordHash: fila.password_hash,
      telefono: fila.telefono,
      fechaRegistro: new Date(fila.fecha_registro),
      estado: fila.estado,
      rol: fila.rol,
    });
  }
}
