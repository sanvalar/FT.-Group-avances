import { UsuarioNoEncontradoError } from '../../domain/errors/DomainErrors';
import { ObtenerPerfilUseCase, RegistrarUsuarioResultado } from '../../domain/ports/in/UsuarioUseCases';
import { UsuarioRepository } from '../../domain/ports/out/UsuarioRepository';

/**
 * Caso de uso "Obtener perfil": usado por el endpoint GET /api/usuarios/me,
 * protegido por el middleware de autenticacion (adaptador de entrada).
 */
export class ObtenerPerfilUseCaseImpl implements ObtenerPerfilUseCase {
  constructor(private readonly usuarioRepository: UsuarioRepository) {}

  async ejecutar(usuarioId: number): Promise<RegistrarUsuarioResultado> {
    const usuario = await this.usuarioRepository.buscarPorId(usuarioId);
    if (!usuario) {
      throw new UsuarioNoEncontradoError(usuarioId);
    }

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
