import { Router } from 'express';
import { grupoGastoController } from '../../../../config/container';
import { autenticar } from '../middlewares/authMiddleware';

const router = Router();
router.get('/resumen', autenticar, grupoGastoController.obtenerResumen);

export default router;