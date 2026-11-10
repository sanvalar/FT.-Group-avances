import { CredencialesInvalidasError, UsuarioInactivoError } from '../../domain/errors/DomainErrors';
import {
  IniciarSesionComando,
  IniciarSesionUseCase,
  SesionResultado,
} from '../../domain/ports/in/UsuarioUseCases';
import { PasswordHasher } from '../../domain/ports/out/PasswordHasher';
import { RefreshTokenRepository } from '../../domain/ports/out/RefreshTokenRepository';
import { TokenService } from '../../domain/ports/out/TokenService';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

const REFRESH_TOKEN_DIAS_VALIDEZ = 7;

/**
 * Caso de uso "Iniciar sesion".
 *
 * 1. Verifica credenciales contra el hash almacenado.
 * 2. Verifica que el usuario pueda iniciar sesion (estado = activo).
 * 3. Genera un access token (JWT de corta duracion) y un refresh token
 *    (persistido en REFRESH_TOKEN, de mayor duracion) segun las
 *    "Consideraciones de seguridad" del documento de arquitectura.
 */
export class IniciarSesionUseCaseImpl implements IniciarSesionUseCase {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService
  ) {}

  async ejecutar(comando: IniciarSesionComando): Promise<SesionResultado> {
    const emailNormalizado = comando.email.trim().toLowerCase();
    const usuario = await this.usuarioRepository.buscarPorEmail(emailNormalizado);

    if (!usuario) {
      // No revelamos si el email existe o no: mismo error para ambos casos.
      throw new CredencialesInvalidasError();
    }

    const passwordValido = await this.passwordHasher.comparar(comando.password, usuario.passwordHash);
    if (!passwordValido) {
      throw new CredencialesInvalidasError();
    }

    if (!usuario.puedeIniciarSesion()) {
      throw new UsuarioInactivoError();
    }

    if (this.passwordHasher.necesitaRehash(usuario.passwordHash)) {
      const passwordHashActualizado = await this.passwordHasher.hash(comando.password);
      await this.usuarioRepository.actualizarPasswordHash(usuario.id as number, passwordHashActualizado);
    }

    const accessToken = this.tokenService.generarAccessToken({
      usuarioId: usuario.id as number,
      email: usuario.email,
      rol: usuario.rol,
    });

    const refreshTokenString = this.tokenService.generarRefreshTokenString();
    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + REFRESH_TOKEN_DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.guardar({
      usuarioId: usuario.id as number,
      token: refreshTokenString,
      fechaCreacion: ahora,
      fechaExpiracion: expiracion,
      revocado: false,
    });

    return {
      accessToken,
      refreshToken: refreshTokenString,
      usuario: {
        id: usuario.id as number,
        nombre: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono,
        estado: usuario.estado,
        rol: usuario.rol,
        fechaRegistro: usuario.fechaRegistro,
      },
    };
  }
}
