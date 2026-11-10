/**
 * Puerto de salida: generacion y verificacion de tokens de acceso (JWT).
 * (ver "Uso de tokens JWT para mantener la sesion de los usuarios").
 */

import { RolUsuario } from '../../entities/Usuario';

export interface PayloadTokenAcceso {
  usuarioId: number;
  email: string;
  rol: RolUsuario;
}

export interface TokenService {
  generarAccessToken(payload: PayloadTokenAcceso): string;
  verificarAccessToken(token: string): PayloadTokenAcceso;
  generarRefreshTokenString(): string;
}
