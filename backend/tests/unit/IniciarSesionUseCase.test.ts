import { IniciarSesionUseCaseImpl } from '../../src/application/usecases/IniciarSesionUseCaseImpl';
import { UsuarioRepository } from '../../src/domain/ports/out/UsuarioRepository';
import { PasswordHasher } from '../../src/domain/ports/out/PasswordHasher';
import { RefreshTokenRepository } from '../../src/domain/ports/out/RefreshTokenRepository';
import { TokenService } from '../../src/domain/ports/out/TokenService';
import { Usuario } from '../../src/domain/entities/Usuario';
import { CredencialesInvalidasError, UsuarioInactivoError } from '../../src/domain/errors/DomainErrors';

describe('IniciarSesionUseCaseImpl', () => {
  function crearMocks() {
    const usuarioRepository: jest.Mocked<UsuarioRepository> = {
      guardar: jest.fn(),
      actualizarPasswordHash: jest.fn(),
      buscarPorEmail: jest.fn(),
      buscarPorId: jest.fn(),
      existeEmail: jest.fn(),
    };
    const refreshTokenRepository: jest.Mocked<RefreshTokenRepository> = {
      guardar: jest.fn(),
      buscarPorToken: jest.fn(),
      revocar: jest.fn(),
      revocarTodosDeUsuario: jest.fn(),
    };
    const passwordHasher: jest.Mocked<PasswordHasher> = {
      hash: jest.fn(),
      comparar: jest.fn(),
      necesitaRehash: jest.fn().mockReturnValue(false),
    };
    const tokenService: jest.Mocked<TokenService> = {
      generarAccessToken: jest.fn(),
      verificarAccessToken: jest.fn(),
      generarRefreshTokenString: jest.fn(),
    };
    return { usuarioRepository, refreshTokenRepository, passwordHasher, tokenService };
  }

  const usuarioActivo = Usuario.reconstruir({
    id: 1,
    nombre: 'Ana',
    email: 'ana@example.com',
    passwordHash: 'hash',
    estado: 'activo',
  });

  it('inicia sesion correctamente con credenciales validas', async () => {
    const { usuarioRepository, refreshTokenRepository, passwordHasher, tokenService } = crearMocks();
    usuarioRepository.buscarPorEmail.mockResolvedValue(usuarioActivo);
    passwordHasher.comparar.mockResolvedValue(true);
    tokenService.generarAccessToken.mockReturnValue('access-token-simulado');
    tokenService.generarRefreshTokenString.mockReturnValue('refresh-token-simulado');
    refreshTokenRepository.guardar.mockResolvedValue({
      usuarioId: 1,
      token: 'refresh-token-simulado',
      fechaCreacion: new Date(),
      fechaExpiracion: new Date(),
      revocado: false,
    });

    const useCase = new IniciarSesionUseCaseImpl(
      usuarioRepository,
      refreshTokenRepository,
      passwordHasher,
      tokenService
    );

    const resultado = await useCase.ejecutar({ email: 'ana@example.com', password: 'clave123' });

    expect(resultado.accessToken).toBe('access-token-simulado');
    expect(resultado.refreshToken).toBe('refresh-token-simulado');
    expect(resultado.usuario.email).toBe('ana@example.com');
    expect(resultado.usuario.rol).toBe('usuario');
    expect(tokenService.generarAccessToken).toHaveBeenCalledWith({
      usuarioId: 1,
      email: 'ana@example.com',
      rol: 'usuario',
    });
  });

  it('actualiza un hash legado despues de autenticar correctamente', async () => {
    const { usuarioRepository, refreshTokenRepository, passwordHasher, tokenService } = crearMocks();
    usuarioRepository.buscarPorEmail.mockResolvedValue(usuarioActivo);
    passwordHasher.comparar.mockResolvedValue(true);
    passwordHasher.necesitaRehash.mockReturnValue(true);
    passwordHasher.hash.mockResolvedValue('$argon2id$hash-nuevo');
    tokenService.generarAccessToken.mockReturnValue('access-token-simulado');
    tokenService.generarRefreshTokenString.mockReturnValue('refresh-token-simulado');
    refreshTokenRepository.guardar.mockResolvedValue({
      usuarioId: 1,
      token: 'refresh-token-simulado',
      fechaCreacion: new Date(),
      fechaExpiracion: new Date(),
      revocado: false,
    });

    const useCase = new IniciarSesionUseCaseImpl(
      usuarioRepository,
      refreshTokenRepository,
      passwordHasher,
      tokenService
    );

    await useCase.ejecutar({ email: 'ana@example.com', password: 'clave123' });

    expect(passwordHasher.hash).toHaveBeenCalledWith('clave123');
    expect(usuarioRepository.actualizarPasswordHash).toHaveBeenCalledWith(1, '$argon2id$hash-nuevo');
  });

  it('rechaza con CredencialesInvalidasError si el usuario no existe', async () => {
    const { usuarioRepository, refreshTokenRepository, passwordHasher, tokenService } = crearMocks();
    usuarioRepository.buscarPorEmail.mockResolvedValue(null);

    const useCase = new IniciarSesionUseCaseImpl(
      usuarioRepository,
      refreshTokenRepository,
      passwordHasher,
      tokenService
    );

    await expect(useCase.ejecutar({ email: 'no-existe@example.com', password: 'x' })).rejects.toBeInstanceOf(
      CredencialesInvalidasError
    );
  });

  it('rechaza con CredencialesInvalidasError si la contrasena no coincide', async () => {
    const { usuarioRepository, refreshTokenRepository, passwordHasher, tokenService } = crearMocks();
    usuarioRepository.buscarPorEmail.mockResolvedValue(usuarioActivo);
    passwordHasher.comparar.mockResolvedValue(false);

    const useCase = new IniciarSesionUseCaseImpl(
      usuarioRepository,
      refreshTokenRepository,
      passwordHasher,
      tokenService
    );

    await expect(useCase.ejecutar({ email: 'ana@example.com', password: 'incorrecta' })).rejects.toBeInstanceOf(
      CredencialesInvalidasError
    );
  });

  it('rechaza con UsuarioInactivoError si el usuario esta bloqueado', async () => {
    const { usuarioRepository, refreshTokenRepository, passwordHasher, tokenService } = crearMocks();
    const usuarioBloqueado = Usuario.reconstruir({
      id: usuarioActivo.id as number,
      nombre: usuarioActivo.nombre,
      email: usuarioActivo.email,
      passwordHash: usuarioActivo.passwordHash,
      estado: 'bloqueado',
    });
    usuarioRepository.buscarPorEmail.mockResolvedValue(usuarioBloqueado);
    passwordHasher.comparar.mockResolvedValue(true);

    const useCase = new IniciarSesionUseCaseImpl(
      usuarioRepository,
      refreshTokenRepository,
      passwordHasher,
      tokenService
    );

    await expect(useCase.ejecutar({ email: 'ana@example.com', password: 'clave123' })).rejects.toBeInstanceOf(
      UsuarioInactivoError
    );
  });
});
