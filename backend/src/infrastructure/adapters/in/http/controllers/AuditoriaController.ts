import { NextFunction, Request, Response } from 'express';
import { AuditoriaService } from '../../../../../application/services/AuditoriaService';
import { RequestAutenticado } from '../middlewares/authMiddleware';
import { filtrosAuditoriaSchema, RegistrarEventoAuditoriaInput } from '../validators/auditoriaValidators';

type RequestEventoAuditoria = Omit<RequestAutenticado, 'body'> & {
  body: RegistrarEventoAuditoriaInput;
};

export class AuditoriaController {
  constructor(private readonly service: AuditoriaService) {}

  private static readonly motivosAccion: Record<RegistrarEventoAuditoriaInput['accion'], string> = {
    panel_consultar: 'Consultar el panel y los balances de demostración.',
    grupos_consultar: 'Consultar grupos financieros de demostración.',
    historial_consultar: 'Consultar el historial financiero de demostración.',
    gastos_consultar: 'Consultar gastos financieros de demostración.',
    grupo_crear: 'Crear un grupo financiero de demostración.',
    miembro_agregar: 'Agregar un integrante a un grupo de demostración.',
    grupo_archivar: 'Archivar un grupo financiero de demostración.',
    gasto_crear: 'Registrar un gasto financiero de demostración.',
    gasto_eliminar: 'Eliminar un gasto financiero de demostración.',
    pago_registrar: 'Registrar un pago o una liquidación de demostración.',
    liquidacion_registrar: 'Registrar un pago o una liquidación de demostración.',
    datos_demo_restaurar: 'Restaurar los datos financieros de demostración.',
    datos_demo_borrar: 'Borrar los datos financieros de demostración.',
  };

  listar = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const filtros = filtrosAuditoriaSchema.parse(req.query);
      const resultado = await this.service.listar(filtros);
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  };

  registrarEvento = async (
    req: RequestEventoAuditoria,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      await this.service.registrar({
        actorId: req.usuario!.id,
        actorEmail: req.usuario!.email,
        actorRol: req.usuario!.rol,
        accion: req.body.accion,
        motivo: AuditoriaController.motivosAccion[req.body.accion],
        metodo: 'LOCAL',
        ruta: '/frontend/demostracion',
        estadoHttp: 200,
        solicitudId: req.get('x-request-id') ?? null,
      });
      res.status(201).json({ mensaje: 'Actividad registrada.' });
    } catch (error) {
      next(error);
    }
  };
}
