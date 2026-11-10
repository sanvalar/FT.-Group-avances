import { RegistrarUsuarioUseCaseImpl } from '../../src/application/usecases/RegistrarUsuarioUseCaseImpl';
import { UsuarioRepository } from '../../src/domain/ports/out/UsuarioRepository';
import { PasswordHasher } from '../../src/domain/ports/out/PasswordHasher';
import { Usuario } from '../../src/domain/entities/Usuario';
import { EmailYaRegistradoError, ValidacionError } from '../../src/domain/errors/DomainErrors';

/**
 * Estas pruebas demuestran una de las ventajas de la arquitectura
 * hexagonal (seccion "Testabilidad" del documento): la capa de
 * aplicacion se prueba con dobles de prueba (mocks) de los puertos de
 * salida, SIN necesidad de una base de datos real ni de un servidor
 * HTTP levantado.
 */
describe('RegistrarUsuarioUseCaseImpl', () => {
  function crearMocks() {
    const usuarioRepository: jest.Mocked<UsuarioRepository> = {
      guardar: jest.fn(),
      actualizarPasswordHash: jest.fn(),
      buscarPorEmail: jest.fn(),
      buscarPorId: jest.fn(),
      existeEmail: jest.fn(),
    };

    const passwordHasher: jest.Mocked<PasswordHasher> = {
      hash: jest.fn(),
      comparar: jest.fn(),
      necesitaRehash: jest.fn(),
    };

    return { usuarioRepository, passwordHasher };
  }

  it('registra un usuario nuevo correctamente', async () => {
    const { usuarioRepository, passwordHasher } = crearMocks();
    usuarioRepository.existeEmail.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue('hash-simulado');
    usuarioRepository.guardar.mockImplementation(async (usuario) =>
      Usuario.reconstruir({ ...usuario, id: 1 })
    );

    const useCase = new RegistrarUsuarioUseCaseImpl(usuarioRepository, passwordHasher);

    const resultado = await useCase.ejecutar({
      nombre: 'Ana Torres',
      email: 'Ana@Example.com',
      password: 'passwordSeguro123',
    });

    expect(resultado.id).toBe(1);
    expect(resultado.email).toBe('ana@example.com');
    expect(passwordHasher.hash).toHaveBeenCalledWith('passwordSeguro123');
    expect(usuarioRepository.guardar).toHaveBeenCalledTimes(1);
  });

  it('rechaza el registro si el correo ya existe', async () => {
    const { usuarioRepository, passwordHasher } = crearMocks();
    usuarioRepository.existeEmail.mockResolvedValue(true);

    const useCase = new RegistrarUsuarioUseCaseImpl(usuarioRepository, passwordHasher);

    await expect(
      useCase.ejecutar({ nombre: 'Ana', email: 'ana@example.com', password: 'passwordSeguro123' })
    ).rejects.toBeInstanceOf(EmailYaRegistradoError);

    expect(usuarioRepository.guardar).not.toHaveBeenCalled();
  });

  it('rechaza contrasenas demasiado cortas antes de tocar el repositorio', async () => {
    const { usuarioRepository, passwordHasher } = crearMocks();
    const useCase = new RegistrarUsuarioUseCaseImpl(usuarioRepository, passwordHasher);

    await expect(
      useCase.ejecutar({ nombre: 'Ana', email: 'ana@example.com', password: '123' })
    ).rejects.toBeInstanceOf(ValidacionError);

    expect(usuarioRepository.existeEmail).not.toHaveBeenCalled();
  });
});
