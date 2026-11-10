import { Usuario } from '../../domain/entities/Usuario';
import { EmailYaRegistradoError, ValidacionError } from '../../domain/errors/DomainErrors';
import {
  RegistrarUsuarioComando,
  RegistrarUsuarioResultado,
  RegistrarUsuarioUseCase,
} from '../../domain/ports/in/UsuarioUseCases';
import { PasswordHasher } from '../../domain/ports/out/PasswordHasher';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

/**
 * Caso de uso "Registrar usuario" (capa de aplicacion).
 *
 * Coordina al dominio (entidad Usuario) con los puertos de salida
 * (repositorio de usuarios y hasher de contrasenas), sin conocer
 * detalles de infraestructura (Express, Postgres, etc).
 */
export class RegistrarUsuarioUseCaseImpl implements RegistrarUsuarioUseCase {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly passwordHasher: PasswordHasher
  ) {}

  async ejecutar(comando: RegistrarUsuarioComando): Promise<RegistrarUsuarioResultado> {
    this.validarPassword(comando.password);

    const emailNormalizado = comando.email.trim().toLowerCase();
    const yaExiste = await this.usuarioRepository.existeEmail(emailNormalizado);
    if (yaExiste) {
      throw new EmailYaRegistradoError(emailNormalizado);
    }

    const passwordHash = await this.passwordHasher.hash(comando.password);

    const usuario = Usuario.crear({
      nombre: comando.nombre,
      email: emailNormalizado,
      passwordHash,
      telefono: comando.telefono ?? null,
    });

    const usuarioGuardado = await this.usuarioRepository.guardar(usuario);

    return this.aResultado(usuarioGuardado);
  }

  private validarPassword(password: string): void {
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      throw new ValidacionError(
        `La contrasena debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
      );
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new ValidacionError(
        `La contrasena no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`
      );
    }
  }

  private aResultado(usuario: Usuario): RegistrarUsuarioResultado {
    return {
      id: usuario.id as number,
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono,
      estado: usuario.estado,
      rol: usuario.rol,
      fechaRegistro: usuario.fechaRegistro,
    };
  }
}
