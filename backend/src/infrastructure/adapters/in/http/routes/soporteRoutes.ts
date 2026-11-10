import { Router } from 'express';
import { soporteController } from '../../../../config/container';
import { autenticar, autorizarRoles } from '../middlewares/authMiddleware';
import { validarBody, validarParams, validarQuery } from '../middlewares/validate';
import {
  comentarioTicketSchema,
  crearTicketSchema,
  estadoTicketSchema,
  filtrosTicketsSchema,
  numeroTicketParamsSchema,
} from '../validators/soporteValidators';

const router = Router();

router.use(autenticar);

// --- Usuario: sus propios tickets ---
router.get('/tickets', soporteController.listarMios);
router.post('/tickets', validarBody(crearTicketSchema), soporteController.crear);
router.get('/tickets/:numero', validarParams(numeroTicketParamsSchema), soporteController.detalle);
router.post(
  '/tickets/:numero/mensajes',
  validarParams(numeroTicketParamsSchema),
  validarBody(comentarioTicketSchema),
  soporteController.comentar,
);

// --- Personal de soporte: bandeja y gestion de estados ---
router.get(
  '/bandeja',
  autorizarRoles('moderador', 'supervisor'),
  validarQuery(filtrosTicketsSchema),
  soporteController.listarTodos,
);
router.patch(
  '/tickets/:numero/estado',
  autorizarRoles('moderador', 'supervisor'),
  validarParams(numeroTicketParamsSchema),
  validarBody(estadoTicketSchema),
  soporteController.cambiarEstado,
);

export default router;
