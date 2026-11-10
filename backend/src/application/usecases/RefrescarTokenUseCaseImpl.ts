import { TokenInvalidoError, UsuarioNoEncontradoError } from '../../domain/errors/DomainErrors';
import { RefrescarTokenUseCase } from '../../domain/ports/in/UsuarioUseCases';
import { RefreshTokenRepository } from '../../domain/ports/out/RefreshTokenRepository';
import { TokenService } from '../../domain/ports/out/TokenService';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

const REFRESH_TOKEN_DIAS_VALIDEZ = 7;

/**
 * Caso de uso "Refrescar token": permite obtener un nuevo access token
 * (JWT) sin pedir credenciales de nuevo, usando el refresh token
 * (rotacion de refresh token: se revoca el usado y se emite uno nuevo).
 */
export class RefrescarTokenUseCaseImpl implements RefrescarTokenUseCase {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenService: TokenService
  ) {}

  async ejecutar(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const registro = await this.refreshTokenRepository.buscarPorToken(refreshToken);

    if (!registro || registro.revocado) {
      throw new TokenInvalidoError();
    }

    if (registro.fechaExpiracion.getTime() < Date.now()) {
      throw new TokenInvalidoError('El refresh token ha expirado. Inicie sesion nuevamente.');
    }

    const usuario = await this.usuarioRepository.buscarPorId(registro.usuarioId);
    if (!usuario) {
      throw new UsuarioNoEncontradoError(registro.usuarioId);
    }
    if (!usuario.puedeIniciarSesion()) {
      throw new TokenInvalidoError('La cuenta no está activa. Inicie sesión nuevamente.');
    }

    // Rotacion: se revoca el refresh token consumido y se emite uno nuevo.
    await this.refreshTokenRepository.revocar(refreshToken);

    const nuevoAccessToken = this.tokenService.generarAccessToken({
      usuarioId: usuario.id as number,
      email: usuario.email,
      rol: usuario.rol,
    });

    const nuevoRefreshToken = this.tokenService.generarRefreshTokenString();
    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + REFRESH_TOKEN_DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.guardar({
      usuarioId: usuario.id as number,
      token: nuevoRefreshToken,
      fechaCreacion: ahora,
      fechaExpiracion: expiracion,
      revocado: false,
    });

    return { accessToken: nuevoAccessToken, refreshToken: nuevoRefreshToken };
  }
}
