import { Router } from 'express';
import { asistenteController } from '../../../../config/container';
import { autenticar } from '../middlewares/authMiddleware';
import { validarBody } from '../middlewares/validate';
import { mensajeAsistenteSchema } from '../validators/soporteValidators';

const router = Router();

// Todo el modulo exige sesion valida: el agente solo opera en nombre del
// usuario autenticado.
router.use(autenticar);

router.get('/estado', asistenteController.estado);
router.post('/mensajes', validarBody(mensajeAsistenteSchema), asistenteController.responder);

export default router;
