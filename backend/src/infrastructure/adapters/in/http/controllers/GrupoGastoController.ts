import { NextFunction, Response } from 'express';
import { GrupoGastoService, RegistrarGastoComando } from '../../../../../application/services/GrupoGastoService';
import { RequestAutenticado } from '../middlewares/authMiddleware';
import { CrearGastoInput, CrearGrupoInput } from '../validators/grupoValidators';

export class GrupoGastoController {
  constructor(private readonly service: GrupoGastoService) {}

  crearGrupo = async (req: RequestAutenticado & { body: CrearGrupoInput }, res: Response, next: NextFunction) => {
    try {
      const grupo = await this.service.crearGrupo(
        req.usuario!.id,
        req.body.nombre,
        req.body.descripcion,
        req.body.integrantes,
        req.body.moneda,
        req.body.tasaCop,
        req.body.instruccionesPago,
      );
      res.status(201).json({ grupo });
    } catch (error) {
      next(error);
    }
  };

  listarGrupos = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ grupos: await this.service.listarGrupos(req.usuario!.id) });
    } catch (error) {
      next(error);
    }
  };

  listarIntegrantes = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ integrantes: await this.service.listarIntegrantes(req.usuario!.id, Number(req.params.grupoId)) });
    } catch (error) {
      next(error);
    }
  };

  agregarMiembro = async (req: RequestAutenticado & { body: { usuarioId?: number; email?: string } }, res: Response, next: NextFunction) => {
    try {
      const integrante = req.body.usuarioId ?? req.body.email!;
      await this.service.agregarMiembro(req.usuario!.id, Number(req.params.grupoId), integrante);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  quitarMiembro = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      await this.service.quitarMiembro(req.usuario!.id, Number(req.params.grupoId), Number(req.params.usuarioId));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  crearGasto = async (req: RequestAutenticado & { body: CrearGastoInput }, res: Response, next: NextFunction) => {
    try {
      const gasto = await this.service.crearGasto(
        req.usuario!.id,
        Number(req.params.grupoId),
        req.body as RegistrarGastoComando,
      );
      res.status(201).json({ gasto });
    } catch (error) {
      next(error);
    }
  };

  listarGastos = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ gastos: await this.service.listarGastos(req.usuario!.id, Number(req.params.grupoId)) });
    } catch (error) {
      next(error);
    }
  };

  listarRecurrencias = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({
        recurrencias: await this.service.listarRecurrencias(req.usuario!.id, Number(req.params.grupoId)),
      });
    } catch (error) {
      next(error);
    }
  };

  cambiarRecurrencia = async (
    req: RequestAutenticado & { body: { activa: boolean } },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      await this.service.cambiarRecurrencia(
        req.usuario!.id,
        Number(req.params.grupoId),
        Number(req.params.recurrenciaId),
        req.body.activa,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  listarPlantillas = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({
        plantillas: await this.service.listarPlantillas(req.usuario!.id, Number(req.params.grupoId)),
      });
    } catch (error) {
      next(error);
    }
  };

  guardarPlantilla = async (
    req: RequestAutenticado & { body: { nombre: string; tipoDivision: 'equitativa' | 'personalizada' | 'porcentaje' | 'participaciones'; asignaciones: Array<{ usuarioId: number; valor: number }> } },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const plantilla = await this.service.guardarPlantilla(
        req.usuario!.id,
        Number(req.params.grupoId),
        req.body.nombre,
        req.body.tipoDivision,
        req.body.asignaciones,
      );
      res.status(201).json({ plantilla });
    } catch (error) {
      next(error);
    }
  };

  eliminarPlantilla = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      await this.service.eliminarPlantilla(
        req.usuario!.id,
        Number(req.params.grupoId),
        Number(req.params.plantillaId),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  eliminarGasto = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      await this.service.eliminarGasto(req.usuario!.id, Number(req.params.gastoId));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  registrarPago = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      const liquidacion = await this.service.registrarPago(req.usuario!.id, Number(req.params.gastoId));
      res.status(201).json({ liquidacion });
    } catch (error) {
      next(error);
    }
  };

  listarLiquidacionesPendientes = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({
        liquidaciones: await this.service.listarLiquidacionesPendientes(
          req.usuario!.id,
          Number(req.params.grupoId),
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  reportarLiquidacion = async (
    req: RequestAutenticado & { body: { acreedorId: number; monto: number } },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const liquidacion = await this.service.reportarLiquidacion(
        req.usuario!.id,
        Number(req.params.grupoId),
        req.body.acreedorId,
        req.body.monto,
      );
      res.status(201).json({ liquidacion });
    } catch (error) {
      next(error);
    }
  };

  confirmarLiquidacion = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      await this.service.confirmarLiquidacion(
        req.usuario!.id,
        Number(req.params.grupoId),
        Number(req.params.liquidacionId),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  listarBalances = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ balances: await this.service.listarBalances(req.usuario!.id, Number(req.params.grupoId)) });
    } catch (error) {
      next(error);
    }
  };

  listarHistorial = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ movimientos: await this.service.listarHistorial(req.usuario!.id, Number(req.params.grupoId)) });
    } catch (error) {
      next(error);
    }
  };

  obtenerResumen = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ resumen: await this.service.obtenerResumen(req.usuario!.id) });
    } catch (error) {
      next(error);
    }
  };

  listarNotificaciones = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ notificaciones: await this.service.listarNotificaciones(req.usuario!.id) });
    } catch (error) {
      next(error);
    }
  };

  marcarNotificacionLeida = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      await this.service.marcarNotificacionLeida(req.usuario!.id, Number(req.params.notificacionId));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}