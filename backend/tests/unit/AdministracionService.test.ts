import { AdministracionService } from '../../src/application/services/AdministracionService';
import { AdministracionRepository, UsuarioAdministracion } from '../../src/domain/ports/out/AdministracionRepository';
import { AccesoDenegadoError } from '../../src/domain/errors/DomainErrors';

describe('AdministracionService', () => {
  const crearUsuario = (
    id: number,
    rol: UsuarioAdministracion['rol'],
    estado: UsuarioAdministracion['estado'] = 'activo',
  ): UsuarioAdministracion => ({
    id,
    nombre: `Usuario ${id}`,
    email: `usuario${id}@example.com`,
    estado,
    rol,
    fechaRegistro: new Date('2026-01-01T00:00:00Z'),
  });

  function crearServicio(usuarios: UsuarioAdministracion[]) {
    const repository: jest.Mocked<AdministracionRepository> = {
      listarUsuarios: jest.fn().mockResolvedValue(usuarios),
      buscarUsuario: jest.fn(async (id) => usuarios.find((usuario) => usuario.id === id) ?? null),
      cambiarEstado: jest.fn(async (id, estado) => {
        const usuario = usuarios.find((actual) => actual.id === id);
        return usuario ? { ...usuario, estado } : null;
      }),
      cambiarRol: jest.fn(async (id, rol) => {
        const usuario = usuarios.find((actual) => actual.id === id);
        return usuario ? { ...usuario, rol } : null;
      }),
    };
    return { service: new AdministracionService(repository), repository };
  }

  it('permite al moderador cambiar estado de una cuenta estándar', async () => {
    const { service, repository } = crearServicio([
      crearUsuario(1, 'moderador'),
      crearUsuario(2, 'usuario'),
    ]);

    const usuario = await service.cambiarEstado(1, 'moderador', 2, 'bloqueado');

    expect(usuario.estado).toBe('bloqueado');
    expect(repository.cambiarEstado).toHaveBeenCalledWith(2, 'bloqueado');
  });

  it('impide al moderador gestionar cuentas con rol privilegiado', async () => {
    const { service, repository } = crearServicio([
      crearUsuario(1, 'moderador'),
      crearUsuario(2, 'supervisor'),
    ]);

    await expect(service.cambiarEstado(1, 'moderador', 2, 'bloqueado')).rejects.toBeInstanceOf(AccesoDenegadoError);
    expect(repository.cambiarEstado).not.toHaveBeenCalled();
  });

  it('impide cambiar el propio rol', async () => {
    const { service, repository } = crearServicio([crearUsuario(1, 'supervisor')]);

    await expect(service.cambiarRol(1, 'supervisor', 1, 'usuario')).rejects.toBeInstanceOf(AccesoDenegadoError);
    await expect(service.cambiarEstado(1, 'supervisor', 1, 'inactivo')).rejects.toBeInstanceOf(AccesoDenegadoError);
    expect(repository.cambiarRol).not.toHaveBeenCalled();
  });

  it('permite al supervisor gestionar otra cuenta supervisora sin afectar su propio acceso', async () => {
    const { service, repository } = crearServicio([
      crearUsuario(1, 'supervisor'),
      crearUsuario(2, 'supervisor'),
      crearUsuario(3, 'usuario'),
    ]);

    const usuario = await service.cambiarEstado(2, 'supervisor', 1, 'inactivo');

    expect(usuario.estado).toBe('inactivo');
    expect(repository.cambiarEstado).toHaveBeenCalledWith(1, 'inactivo');
  });

  it('reserva el cambio de roles al supervisor', async () => {
    const { service, repository } = crearServicio([
      crearUsuario(1, 'moderador'),
      crearUsuario(2, 'usuario'),
    ]);

    await expect(service.cambiarRol(1, 'moderador', 2, 'supervisor')).rejects.toBeInstanceOf(AccesoDenegadoError);
    expect(repository.cambiarRol).not.toHaveBeenCalled();
  });
});
