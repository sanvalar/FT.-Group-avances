import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validarBody } from '../middlewares/validate';
import { autenticar } from '../middlewares/authMiddleware';
import { limitarIntentosLogin } from '../middlewares/limiteIntentosLogin';
import {
  registrarUsuarioSchema,
  iniciarSesionSchema,
  refrescarTokenSchema,
  actualizarPerfilSchema,
} from '../validators/authValidators';

const router = Router();

/**
 * Adaptador de entrada: define los endpoints REST del modulo de
 * usuarios/autenticacion, correspondientes a los casos de uso
 * "Registrar usuario" e "Iniciar sesion" del documento de arquitectura.
 */

// POST /api/auth/registro -> caso de uso "Registrar usuario"
router.post(
  '/registro',
  validarBody(registrarUsuarioSchema),
  AuthController.registrar,
);

// POST /api/auth/login -> caso de uso "Iniciar sesion"
router.post(
  '/login',
  validarBody(iniciarSesionSchema),
  limitarIntentosLogin,
  AuthController.iniciarSesion,
);

// POST /api/auth/refresh -> renueva el access token usando el refresh token
router.post(
  '/refresh',
  validarBody(refrescarTokenSchema),
  AuthController.refrescarToken,
);

// POST /api/auth/logout -> revoca el refresh token
router.post(
  '/logout',
  validarBody(refrescarTokenSchema),
  AuthController.cerrarSesion,
);

// GET /api/auth/me -> perfil del usuario autenticado
router.get('/me', autenticar, AuthController.perfil);

// PUT /api/auth/me -> actualizar nombre y/o telefono del usuario autenticado
router.put(
  '/me',
  autenticar,
  validarBody(actualizarPerfilSchema),
  AuthController.actualizarPerfil,
);

// DELETE /api/auth/me -> soft delete: desactiva la propia cuenta
router.delete(
  '/me',
  autenticar,
  AuthController.desactivarCuenta,
);

// POST /api/auth/me/activar -> revierte la desactivacion de la propia cuenta
router.post(
  '/me/activar',
  autenticar,
  AuthController.activarCuenta,
);

export default router;