import { UsuarioNoEncontradoError } from '../../domain/errors/DomainErrors';
import { ActivarCuentaUseCase, RegistrarUsuarioResultado } from '../../domain/ports/in/UsuarioUseCases';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

export class ActivarCuentaUseCaseImpl implements ActivarCuentaUseCase {
  constructor(private readonly usuarioRepository: UsuarioRepository) {}

  async ejecutar(usuarioId: number): Promise<RegistrarUsuarioResultado> {
    const usuario = await this.usuarioRepository.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoError(usuarioId);

    usuario.activar();
    const usuarioActualizado = await this.usuarioRepository.guardar(usuario);

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