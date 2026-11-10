import { Router } from 'express';
import { grupoGastoController } from '../../../../config/container';
import { autenticar, autorizarRoles } from '../middlewares/authMiddleware';
import { validarBody, validarParams } from '../middlewares/validate';
import {
  crearGastoSchema,
  crearGrupoSchema,
  gastoParamsSchema,
  grupoIdParamsSchema,
  liquidacionParamsSchema,
  liquidacionSchema,
  miembroParamsSchema,
  miembroSchema,
} from '../validators/grupoValidators';

const router = Router();

router.use(autenticar, autorizarRoles('usuario'));
router.get('/', grupoGastoController.listarGrupos);
router.post('/', validarBody(crearGrupoSchema), grupoGastoController.crearGrupo);
router.get('/:grupoId/integrantes', validarParams(grupoIdParamsSchema), grupoGastoController.listarIntegrantes);
router.post('/:grupoId/integrantes', validarParams(grupoIdParamsSchema), validarBody(miembroSchema), grupoGastoController.agregarMiembro);
router.delete('/:grupoId/integrantes/:usuarioId', validarParams(miembroParamsSchema), grupoGastoController.quitarMiembro);
router.get('/:grupoId/liquidaciones', validarParams(grupoIdParamsSchema), grupoGastoController.listarLiquidacionesPendientes);
router.post('/:grupoId/liquidaciones', validarParams(grupoIdParamsSchema), validarBody(liquidacionSchema), grupoGastoController.reportarLiquidacion);
router.post('/:grupoId/liquidaciones/:liquidacionId/confirmar', validarParams(liquidacionParamsSchema), grupoGastoController.confirmarLiquidacion);
router.delete('/gastos/:gastoId', validarParams(gastoParamsSchema), grupoGastoController.eliminarGasto);
router.post('/gastos/:gastoId/pagos', validarParams(gastoParamsSchema), grupoGastoController.registrarPago);
router.get('/:grupoId/gastos', validarParams(grupoIdParamsSchema), grupoGastoController.listarGastos);
router.post('/:grupoId/gastos', validarParams(grupoIdParamsSchema), validarBody(crearGastoSchema), grupoGastoController.crearGasto);
router.get('/:grupoId/balances', validarParams(grupoIdParamsSchema), grupoGastoController.listarBalances);
router.get('/:grupoId/historial', validarParams(grupoIdParamsSchema), grupoGastoController.listarHistorial);

export default router;