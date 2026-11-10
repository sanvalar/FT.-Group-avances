/**
 * Puerto de salida para la persistencia de refresh tokens
 * (entidad REFRESH_TOKEN del esquema de base de datos, seccion 3.2
 * del documento "Esquema de Base de Datos y Documentacion Tecnica").
 */

export interface RefreshTokenRegistro {
  id?: number;
  usuarioId: number;
  token: string;
  fechaCreacion: Date;
  fechaExpiracion: Date;
  revocado: boolean;
}

export interface RefreshTokenRepository {
  guardar(registro: RefreshTokenRegistro): Promise<RefreshTokenRegistro>;
  buscarPorToken(token: string): Promise<RefreshTokenRegistro | null>;
  revocar(token: string): Promise<void>;
  revocarTodosDeUsuario(usuarioId: number): Promise<void>;
}
