import { UsuarioNoEncontradoError } from '../../domain/errors/DomainErrors';
import {
  ActualizarPerfilComando,
  ActualizarPerfilUseCase,
  RegistrarUsuarioResultado,
} from '../../domain/ports/in/UsuarioUseCases';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

export class ActualizarPerfilUseCaseImpl implements ActualizarPerfilUseCase {
  constructor(private readonly usuarioRepository: UsuarioRepository) {}

  async ejecutar(comando: ActualizarPerfilComando): Promise<RegistrarUsuarioResultado> {
    const usuario = await this.usuarioRepository.buscarPorId(comando.usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoError(comando.usuarioId);

    usuario.actualizarPerfil({ nombre: comando.nombre, telefono: comando.telefono });
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