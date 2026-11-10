/**
 * Puertos de entrada (input ports): operaciones que los adaptadores de
 * entrada (p. ej. la API REST) pueden solicitar al nucleo de la
 * aplicacion. Corresponden a los casos de uso "Registrar usuario" e
 * "Iniciar sesion" descritos en la seccion 7 del documento de
 * arquitectura.
 */

export interface RegistrarUsuarioComando {
  nombre: string;
  email: string;
  password: string;
  telefono?: string;
}

export interface RegistrarUsuarioResultado {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  estado: string;
  rol: RolUsuario;
  fechaRegistro: Date;
}

export interface IniciarSesionComando {
  email: string;
  password: string;
}

export interface SesionResultado {
  accessToken: string;
  refreshToken: string;
  usuario: RegistrarUsuarioResultado;
}

export interface RegistrarUsuarioUseCase {
  ejecutar(comando: RegistrarUsuarioComando): Promise<RegistrarUsuarioResultado>;
}

export interface IniciarSesionUseCase {
  ejecutar(comando: IniciarSesionComando): Promise<SesionResultado>;
}

export interface RefrescarTokenUseCase {
  ejecutar(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
}

export interface CerrarSesionUseCase {
  ejecutar(refreshToken: string): Promise<void>;
}

export interface ObtenerPerfilUseCase {
  ejecutar(usuarioId: number): Promise<RegistrarUsuarioResultado>;
}

export interface ActualizarPerfilComando {
  usuarioId: number;
  nombre?: string;
  telefono?: string | null;
}

export interface ActualizarPerfilUseCase {
  ejecutar(comando: ActualizarPerfilComando): Promise<RegistrarUsuarioResultado>;
}

export interface DesactivarCuentaUseCase {
  ejecutar(usuarioId: number): Promise<RegistrarUsuarioResultado>;
}

export interface ActivarCuentaUseCase {
  ejecutar(usuarioId: number): Promise<RegistrarUsuarioResultado>;
}
import { RolUsuario } from '../../entities/Usuario';
