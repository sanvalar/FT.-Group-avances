import { Router } from 'express';
import { EstadoSistemaController } from '../controllers/EstadoSistemaController';
import { autenticar, autorizarRoles } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', autenticar, autorizarRoles('supervisor'), EstadoSistemaController.consultar);

export default router;
