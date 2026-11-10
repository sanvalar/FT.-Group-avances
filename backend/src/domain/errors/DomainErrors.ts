/**
 * Errores de dominio / aplicacion.
 *
 * Se definen aqui (y no en la capa HTTP) porque son parte de las reglas
 * de negocio: es el dominio quien decide que una operacion no es valida.
 * El adaptador de entrada HTTP se encarga de traducir estos errores a
 * codigos de estado (ver errorHandler.ts).
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmailYaRegistradoError extends DomainError {
  constructor(email: string) {
    super(`El correo "${email}" ya se encuentra registrado.`);
  }
}

export class CredencialesInvalidasError extends DomainError {
  constructor() {
    super('El correo o la contrasena son incorrectos.');
  }
}

export class UsuarioNoEncontradoError extends DomainError {
  constructor(identificador: string | number) {
    super(`No se encontro el usuario "${identificador}".`);
  }
}

export class GrupoNoEncontradoError extends DomainError {
  constructor(identificador: number) {
    super(`No se encontro el grupo "${identificador}".`);
  }
}

export class GastoNoEncontradoError extends DomainError {
  constructor(identificador: number) {
    super(`No se encontro el gasto "${identificador}".`);
  }
}

export class NotificacionNoEncontradaError extends DomainError {
  constructor(identificador: number) {
    super(`No se encontro la notificacion "${identificador}".`);
  }
}

export class TicketNoEncontradoError extends DomainError {
  constructor(identificador: string | number) {
    super(`No se encontro el ticket de soporte "${identificador}".`);
  }
}

export class AsistenteNoDisponibleError extends DomainError {
  constructor(
    mensaje = 'El asistente con IA no esta configurado en este servidor.',
  ) {
    super(mensaje);
  }
}

export class AccesoDenegadoError extends DomainError {}

export class ConflictoEstadoError extends DomainError {}

export class UsuarioInactivoError extends DomainError {
  constructor() {
    super('El usuario se encuentra inactivo o bloqueado y no puede iniciar sesion.');
  }
}

export class TokenInvalidoError extends DomainError {
  constructor(mensaje = 'El token proporcionado es invalido o ha expirado.') {
    super(mensaje);
  }
}

export class ValidacionError extends DomainError {
  detalles?: unknown;
  constructor(message: string, detalles?: unknown) {
    super(message);
    this.detalles = detalles;
  }
}
