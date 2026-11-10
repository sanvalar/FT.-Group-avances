import { Request, Response, NextFunction } from 'express';
import {
  registrarUsuarioUseCase,
  iniciarSesionUseCase,
  refrescarTokenUseCase,
  cerrarSesionUseCase,
  obtenerPerfilUseCase,
  actualizarPerfilUseCase,
  desactivarCuentaUseCase,
  activarCuentaUseCase,
  auditoriaService,
} from '../../../../config/container';
import { RequestAutenticado } from '../middlewares/authMiddleware';
import { RolUsuario } from '../../../../../domain/entities/Usuario';
import { CredencialesInvalidasError, UsuarioInactivoError } from '../../../../../domain/errors/DomainErrors';
import {
  RegistrarUsuarioInput,
  IniciarSesionInput,
  RefrescarTokenInput,
  ActualizarPerfilInput,
} from '../validators/authValidators';

function registrarEventoAcceso(
  usuario: { id: number; email: string; rol: RolUsuario },
  accion: string,
  ruta: string,
  solicitudId?: string,
): Promise<void> {
  return auditoriaService.registrar({
    actorId: usuario.id,
    actorEmail: usuario.email,
    actorRol: usuario.rol,
    accion,
    motivo: accion === 'REGISTRO'
      ? 'Crear una cuenta para habilitar el acceso al sistema.'
      : 'Verificar la identidad y crear una sesión.',
    metodo: 'POST',
    ruta,
    estadoHttp: accion === 'REGISTRO' ? 201 : 200,
    solicitudId: solicitudId ?? null,
  }).catch(() => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      type: 'authentication_audit_write_failed',
    }));
  });
}

/**
 * Adaptador de entrada (controlador HTTP / API REST).
 *
 * Su unica responsabilidad es: leer la solicitud HTTP, invocar el caso
 * de uso correspondiente (puerto de entrada) y traducir el resultado a
 * una respuesta HTTP. No contiene reglas de negocio.
 */
export class AuthController {
  static async registrar(
    req: Request<{}, {}, RegistrarUsuarioInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await registrarUsuarioUseCase.ejecutar(req.body);
      await registrarEventoAcceso(resultado, 'REGISTRO', '/api/auth/registro', res.locals.requestId);
      res.status(201).json({
        mensaje: 'Usuario registrado exitosamente.',
        usuario: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  static async iniciarSesion(
    req: Request<{}, {}, IniciarSesionInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await iniciarSesionUseCase.ejecutar(req.body);
      await registrarEventoAcceso(resultado.usuario, 'INICIO_SESION', '/api/auth/login', res.locals.requestId);
      res.status(200).json(resultado);
    } catch (error) {
      if (error instanceof CredencialesInvalidasError || error instanceof UsuarioInactivoError) {
        await auditoriaService.registrar({
          actorId: null,
          actorEmail: req.body.email,
          actorRol: 'usuario',
          accion: 'INICIO_SESION_FALLIDO',
          motivo: 'Rechazar credenciales o cuenta no habilitada y detectar accesos no autorizados.',
          metodo: 'POST',
          ruta: '/api/auth/login',
          estadoHttp: error instanceof UsuarioInactivoError ? 403 : 401,
          solicitudId: res.locals.requestId ?? null,
        }).catch(() => {
          console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            type: 'authentication_audit_write_failed',
          }));
        });
      }
      next(error);
    }
  }

  static async refrescarToken(
    req: Request<{}, {}, RefrescarTokenInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await refrescarTokenUseCase.ejecutar(req.body.refreshToken);
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  }

  static async cerrarSesion(
    req: Request<{}, {}, RefrescarTokenInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      await cerrarSesionUseCase.ejecutar(req.body.refreshToken);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  static async perfil(
    req: RequestAutenticado,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await obtenerPerfilUseCase.ejecutar(req.usuario!.id);
      res.status(200).json({ usuario: resultado });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/auth/me — actualiza nombre y/o telefono del usuario autenticado.
   */
  static async actualizarPerfil(
    req: RequestAutenticado & { body: ActualizarPerfilInput },
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await actualizarPerfilUseCase.ejecutar({
        usuarioId: req.usuario!.id,
        nombre: req.body.nombre,
        telefono: req.body.telefono,
      });
      res.status(200).json({
        mensaje: 'Perfil actualizado exitosamente.',
        usuario: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/auth/me — "elimina" la cuenta del usuario autenticado.
   * En este dominio, eliminar = soft-delete (estado pasa a "inactivo"
   * y se revocan sus sesiones activas). El registro nunca se borra
   * fisicamente de la base de datos.
   */
  static async desactivarCuenta(
    req: RequestAutenticado,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await desactivarCuentaUseCase.ejecutar(req.usuario!.id);
      res.status(200).json({
        mensaje: 'Cuenta desactivada exitosamente.',
        usuario: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/me/activar — revierte una desactivacion previa.
   */
  static async activarCuenta(
    req: RequestAutenticado,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const resultado = await activarCuentaUseCase.ejecutar(req.usuario!.id);
      res.status(200).json({
        mensaje: 'Cuenta activada exitosamente.',
        usuario: resultado,
      });
    } catch (error) {
      next(error);
    }
  }
}