import { Router } from 'express';
import { grupoGastoController } from '../../../../config/container';
import { autenticar, autorizarRoles } from '../middlewares/authMiddleware';

const router = Router();
router.get('/resumen', autenticar, autorizarRoles('usuario'), grupoGastoController.obtenerResumen);

export default router;