import { Router } from 'express';
import { auditoriaController } from '../../../../config/container';
import { autenticar, autorizarRoles } from '../middlewares/authMiddleware';
import { validarBody, validarQuery } from '../middlewares/validate';
import { filtrosAuditoriaSchema, registrarEventoAuditoriaSchema } from '../validators/auditoriaValidators';

const router = Router();
router.use(autenticar);
router.get(
  '/',
  autorizarRoles('supervisor'),
  validarQuery(filtrosAuditoriaSchema),
  auditoriaController.listar,
);
router.post(
  '/eventos',
  validarBody(registrarEventoAuditoriaSchema),
  auditoriaController.registrarEvento,
);

export default router;
