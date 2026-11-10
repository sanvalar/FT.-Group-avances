import { Router } from 'express';
import { grupoGastoController } from '../../../../config/container';
import { autenticar } from '../middlewares/authMiddleware';
import { validarParams } from '../middlewares/validate';
import { notificacionParamsSchema } from '../validators/grupoValidators';

const router = Router();
router.use(autenticar);
router.get('/', grupoGastoController.listarNotificaciones);
router.patch('/:notificacionId/leida', validarParams(notificacionParamsSchema), grupoGastoController.marcarNotificacionLeida);

export default router;