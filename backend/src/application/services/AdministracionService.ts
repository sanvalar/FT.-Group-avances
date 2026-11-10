import { AccesoDenegadoError, ConflictoEstadoError, UsuarioNoEncontradoError } from '../../domain/errors/DomainErrors';
import { EstadoUsuario, RolUsuario } from '../../domain/entities/Usuario';
import { AdministracionRepository, SupervisionFinanciera, UsuarioAdministracion } from '../../domain/ports/out/AdministracionRepository';

export class AdministracionService {
  constructor(private readonly repository: AdministracionRepository) {}

  listarUsuarios(): Promise<UsuarioAdministracion[]> {
    return this.repository.listarUsuarios();
  }

  async consultarFinanzasUsuario(
    actorRol: RolUsuario,
    usuarioId: number,
    limite: number,
    offset: number,
  ): Promise<SupervisionFinanciera> {
    if (actorRol !== 'supervisor') {
      throw new AccesoDenegadoError('Solo un supervisor puede consultar las finanzas de otros usuarios.');
    }
    const finanzas = await this.repository.consultarFinanzasUsuario(usuarioId, limite, offset);
    if (!finanzas) throw new UsuarioNoEncontradoError(usuarioId);
    return finanzas;
  }

  async cambiarEstado(
    actorId: number,
    actorRol: RolUsuario,
    usuarioId: number,
    estado: EstadoUsuario,
  ): Promise<UsuarioAdministracion> {
    const objetivo = await this.buscarObjetivo(usuarioId);
    this.validarObjetivo(actorId, actorRol, objetivo);
    await this.validarUltimoSupervisor(objetivo, estado !== 'activo' || objetivo.rol !== 'supervisor');
    const actualizado = await this.repository.cambiarEstado(usuarioId, estado);
    if (!actualizado) throw new UsuarioNoEncontradoError(usuarioId);
    return actualizado;
  }

  async cambiarRol(
    actorId: number,
    actorRol: RolUsuario,
    usuarioId: number,
    rol: RolUsuario,
  ): Promise<UsuarioAdministracion> {
    if (actorRol !== 'supervisor') {
      throw new AccesoDenegadoError('Solo un supervisor puede cambiar roles.');
    }
    const objetivo = await this.buscarObjetivo(usuarioId);
    if (actorId === usuarioId) {
      throw new AccesoDenegadoError('No puedes cambiar tu propio rol.');
    }
    await this.validarUltimoSupervisor(objetivo, objetivo.rol === 'supervisor' && rol !== 'supervisor');
    const actualizado = await this.repository.cambiarRol(usuarioId, rol);
    if (!actualizado) throw new UsuarioNoEncontradoError(usuarioId);
    return actualizado;
  }

  private async buscarObjetivo(id: number): Promise<UsuarioAdministracion> {
    const usuario = await this.repository.buscarUsuario(id);
    if (!usuario) throw new UsuarioNoEncontradoError(id);
    return usuario;
  }

  private validarObjetivo(actorId: number, actorRol: RolUsuario, objetivo: UsuarioAdministracion): void {
    if (actorId === objetivo.id) {
      throw new AccesoDenegadoError('No puedes cambiar el estado de tu propia cuenta.');
    }
    if (actorRol === 'moderador' && objetivo.rol !== 'usuario') {
      throw new AccesoDenegadoError('El moderador solo puede gestionar cuentas de usuario.');
    }
  }

  private async validarUltimoSupervisor(objetivo: UsuarioAdministracion, cambiaAcceso: boolean): Promise<void> {
    if (!cambiaAcceso || objetivo.rol !== 'supervisor' || objetivo.estado !== 'activo') return;
    const usuarios = await this.repository.listarUsuarios();
    const supervisoresActivos = usuarios.filter((usuario) => usuario.rol === 'supervisor' && usuario.estado === 'activo');
    if (supervisoresActivos.length <= 1) {
      throw new ConflictoEstadoError('No se puede desactivar o degradar al último supervisor activo.');
    }
  }
}
