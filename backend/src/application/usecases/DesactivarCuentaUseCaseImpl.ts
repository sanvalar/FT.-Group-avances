import { UsuarioNoEncontradoError } from '../../domain/errors/DomainErrors';
import { DesactivarCuentaUseCase, RegistrarUsuarioResultado } from '../../domain/ports/in/UsuarioUseCases';
import { RefreshTokenRepository } from '../../domain/ports/out/RefreshTokenRepository';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

export class DesactivarCuentaUseCaseImpl implements DesactivarCuentaUseCase {
  constructor(
    private readonly usuarioRepository: UsuarioRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository
  ) {}

  async ejecutar(usuarioId: number): Promise<RegistrarUsuarioResultado> {
    const usuario = await this.usuarioRepository.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoError(usuarioId);

    usuario.desactivar();
    const usuarioActualizado = await this.usuarioRepository.guardar(usuario);
    await this.refreshTokenRepository.revocarTodosDeUsuario(usuarioId);

    return {
      id: usuarioActualizado.id as number,
      nombre: usuarioActualizado.nombre,
      email: usuarioActualizado.email,
      telefono: usuarioActualizado.telefono,
      estado: usuarioActualizado.estado,
      rol: usuarioActualizado.rol,
      fechaRegistro: usuarioActualizado.fechaRegistro,
    };
  }
}