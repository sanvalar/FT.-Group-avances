import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PayloadTokenAcceso, TokenService } from '../../../../domain/ports/out/TokenService';
import { TokenInvalidoError } from '../../../../domain/errors/DomainErrors';
import { RolUsuario } from '../../../../domain/entities/Usuario';

const ROLES_VALIDOS: RolUsuario[] = ['usuario', 'moderador', 'supervisor'];

/**
 * Adaptador de salida: implementa el puerto TokenService usando la
 * libreria jsonwebtoken (JWT) para access tokens, y crypto.randomBytes
 * para refresh tokens opacos (no-JWT), que se validan contra la tabla
 * REFRESH_TOKEN en base de datos (permite revocacion inmediata).
 */
export class JwtTokenService implements TokenService {
  constructor(
    private readonly secreto: string,
    private readonly expiracionAccessToken: string = '15m',
    private readonly emisor: string = 'ft-group',
    private readonly audiencia: string = 'ft-group-api',
  ) {}

  generarAccessToken(payload: PayloadTokenAcceso): string {
    return jwt.sign(payload, this.secreto, {
      algorithm: 'HS256',
      expiresIn: this.expiracionAccessToken as jwt.SignOptions['expiresIn'],
      issuer: this.emisor,
      audience: this.audiencia,
      subject: String(payload.usuarioId),
    });
  }

  verificarAccessToken(token: string): PayloadTokenAcceso {
    try {
      const decodificado = jwt.verify(token, this.secreto, {
        algorithms: ['HS256'],
        issuer: this.emisor,
        audience: this.audiencia,
      });
      if (typeof decodificado === 'string') {
        throw new TokenInvalidoError('El contenido del token no es válido.');
      }
      const usuarioId = decodificado.usuarioId;
      const rol = decodificado.rol;
      if (
        !Number.isSafeInteger(usuarioId) ||
        Number(usuarioId) <= 0 ||
        decodificado.sub !== String(usuarioId) ||
        typeof decodificado.email !== 'string' ||
        !decodificado.email.trim() ||
        typeof rol !== 'string' ||
        !ROLES_VALIDOS.includes(rol as RolUsuario) ||
        typeof decodificado.exp !== 'number'
      ) {
        throw new TokenInvalidoError('El contenido del token no es válido.');
      }
      return {
        usuarioId: Number(usuarioId),
        email: decodificado.email,
        rol: rol as RolUsuario,
      };
    } catch (error) {
      throw new TokenInvalidoError('El access token es invalido o ha expirado.');
    }
  }

  generarRefreshTokenString(): string {
    return crypto.randomBytes(64).toString('hex');
  }
}
