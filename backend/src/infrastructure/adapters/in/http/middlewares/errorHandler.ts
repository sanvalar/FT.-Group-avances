import { NextFunction, Request, Response } from 'express';
import {
  AccesoDenegadoError,
  AsistenteNoDisponibleError,
  CredencialesInvalidasError,
  ConflictoEstadoError,
  EmailYaRegistradoError,
  GastoNoEncontradoError,
  GrupoNoEncontradoError,
  NotificacionNoEncontradaError,
  TicketNoEncontradoError,
  TokenInvalidoError,
  UsuarioInactivoError,
  UsuarioNoEncontradoError,
  ValidacionError,
} from '../../../../../domain/errors/DomainErrors';

/**
 * Adaptador de entrada: traduce errores de dominio/aplicacion a
 * respuestas HTTP con codigos de estado adecuados. Este es el UNICO
 * lugar donde se decide "que codigo HTTP le corresponde a cada error
 * de negocio" -- el dominio nunca sabe que existe HTTP.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidacionError) {
    res.status(400).json({ error: err.name, mensaje: err.message, detalles: err.detalles });
    return;
  }

  if (err instanceof EmailYaRegistradoError) {
    res.status(409).json({ error: err.name, mensaje: err.message });
    return;
  }

  if (err instanceof ConflictoEstadoError) {
    res.status(409).json({ error: err.name, mensaje: err.message });
    return;
  }

  if (err instanceof CredencialesInvalidasError || err instanceof TokenInvalidoError) {
    res.status(401).json({ error: err.name, mensaje: err.message });
    return;
  }

  if (err instanceof UsuarioInactivoError || err instanceof AccesoDenegadoError) {
    res.status(403).json({ error: err.name, mensaje: err.message });
    return;
  }

  if (err instanceof UsuarioNoEncontradoError || err instanceof GrupoNoEncontradoError || err instanceof GastoNoEncontradoError || err instanceof NotificacionNoEncontradaError || err instanceof TicketNoEncontradoError) {
    res.status(404).json({ error: err.name, mensaje: err.message });
    return;
  }

  // Errores del cliente generados por el parser de Express (body-parser):
  // JSON mal formado (400) o cuerpo mayor al limite (413). No son fallos
  // del servidor, asi que no se registran como error ni se responde 500.
  const errorCliente = err as Error & { status?: number; type?: string };
  if (errorCliente.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JsonInvalido', mensaje: 'El cuerpo de la solicitud no es un JSON válido.' });
    return;
  }
  if (errorCliente.type === 'entity.too.large') {
    res.status(413).json({ error: 'CuerpoMuyGrande', mensaje: 'La solicitud supera el tamaño permitido.' });
    return;
  }

  // El asistente con IA es una funcion opcional: si no hay credenciales
  // configuradas se responde 503 para que el cliente use su respaldo local.
  if (err instanceof AsistenteNoDisponibleError) {
    res.status(503).json({ error: err.name, mensaje: err.message });
    return;
  }

  // Error no esperado: no se expone informacion interna al cliente.
  const code = 'code' in err ? err.code : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'unhandled_request_error',
    errorName: err.name,
    code,
  }));
  res.status(500).json({ error: 'ErrorInterno', mensaje: 'Ha ocurrido un error inesperado.' });
}

export function rutaNoEncontrada(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NoEncontrado', mensaje: 'El recurso solicitado no existe.' });
}
