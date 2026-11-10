import { CerrarSesionUseCase } from '../../domain/ports/in/UsuarioUseCases';
import { RefreshTokenRepository } from '../../domain/ports/out/RefreshTokenRepository';

/**
 * Caso de uso "Cerrar sesion": revoca el refresh token para que no
 * pueda usarse nuevamente para obtener access tokens.
 */
export class CerrarSesionUseCaseImpl implements CerrarSesionUseCase {
  constructor(private readonly refreshTokenRepository: RefreshTokenRepository) {}

  async ejecutar(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.revocar(refreshToken);
  }
}
