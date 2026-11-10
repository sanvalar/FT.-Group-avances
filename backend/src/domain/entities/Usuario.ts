/**
 * Entidad de dominio: Usuario
 *
 * Representa a una persona que utiliza el sistema y participa en uno
 * o varios grupos (ver "FT. GROUP - Definicion de Arquitectura del Sistema", seccion 6).
 *
 * Esta clase NO conoce nada de HTTP, Express, SQL o Postgres.
 * Es pura logica/reglas de negocio, tal como exige la arquitectura hexagonal.
 */

export type EstadoUsuario = 'activo' | 'inactivo' | 'bloqueado';
export type RolUsuario = 'usuario' | 'moderador' | 'supervisor';

export interface UsuarioProps {
  id?: number;
  nombre: string;
  email: string;
  passwordHash: string;
  telefono?: string | null;
  fechaRegistro?: Date;
  estado?: EstadoUsuario;
  rol?: RolUsuario;
}

export class Usuario {
  readonly id?: number;
  nombre: string;
  email: string;
  passwordHash: string;
  telefono: string | null;
  readonly fechaRegistro: Date;
  estado: EstadoUsuario;
  rol: RolUsuario;

  private constructor(props: UsuarioProps) {
    this.id = props.id;
    this.nombre = props.nombre;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.telefono = props.telefono ?? null;
    this.fechaRegistro = props.fechaRegistro ?? new Date();
    this.estado = props.estado ?? 'activo';
    this.rol = props.rol ?? 'usuario';
  }

  /**
   * Fabrica para crear un Usuario nuevo (aun no persistido), validando
   * las reglas de negocio basicas del dominio.
   */
  static crear(props: Omit<UsuarioProps, 'id' | 'fechaRegistro' | 'estado'>): Usuario {
    Usuario.validarNombre(props.nombre);
    Usuario.validarEmail(props.email);

    return new Usuario({
      ...props,
      email: props.email.trim().toLowerCase(),
      nombre: props.nombre.trim(),
    });
  }

  /**
   * Reconstruye un Usuario ya existente a partir de datos de persistencia.
   * Usado por los adaptadores de salida (repositorios) para "rehidratar"
   * entidades de dominio desde filas de base de datos.
   */
  static reconstruir(props: Required<Pick<UsuarioProps, 'id' | 'nombre' | 'email' | 'passwordHash'>> & UsuarioProps): Usuario {
    return new Usuario(props);
  }

  private static validarNombre(nombre: string): void {
    if (!nombre || nombre.trim().length < 2) {
      throw new Error('El nombre debe tener al menos 2 caracteres.');
    }
    if (nombre.trim().length > 120) {
      throw new Error('El nombre no puede superar los 120 caracteres.');
    }
  }

  private static validarEmail(email: string): void {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !regex.test(email)) {
      throw new Error('El correo electronico no tiene un formato valido.');
    }
  }

  puedeIniciarSesion(): boolean {
    return this.estado === 'activo';
  }

  bloquear(): void {
    this.estado = 'bloqueado';
  }

  activar(): void {
    this.estado = 'activo';
  }

  /**
 * "Eliminar" un usuario es un soft-delete: nunca se borra de la BD,
 * solo pasa a estado "inactivo" y no puede volver a iniciar sesión
 * hasta ser reactivado.
 */
desactivar(): void {
  this.estado = 'inactivo';
}

/**
 * Actualiza los datos editables del perfil (nombre, teléfono).
 */
actualizarPerfil(datos: { nombre?: string; telefono?: string | null }): void {
  if (datos.nombre !== undefined) {
    Usuario.validarNombre(datos.nombre);
    this.nombre = datos.nombre.trim();
  }
  if (datos.telefono !== undefined) {
    this.telefono = datos.telefono;
  }
}

  /**
   * Representacion publica del usuario, sin datos sensibles (password_hash).
   * Es lo unico que debe salir del nucleo hacia los adaptadores de entrada.
   */
  toPublico() {
    return {
      id: this.id,
      nombre: this.nombre,
      email: this.email,
      telefono: this.telefono,
      estado: this.estado,
      rol: this.rol,
      fechaRegistro: this.fechaRegistro,
    };
  }
}
