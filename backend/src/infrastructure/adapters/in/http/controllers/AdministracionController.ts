import { NextFunction, Response } from 'express';
import { AdministracionService } from '../../../../../application/services/AdministracionService';
import { RequestAutenticado } from '../middlewares/authMiddleware';
import { CambiarEstadoAdminInput, CambiarRolAdminInput } from '../validators/administracionValidators';

export class AdministracionController {
  constructor(private readonly service: AdministracionService) {}

  listarUsuarios = async (_req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ usuarios: await this.service.listarUsuarios() });
    } catch (error) {
      next(error);
    }
  };

  consultarFinanzasUsuario = async (req: RequestAutenticado, res: Response, next: NextFunction) => {
    try {
      const finanzas = await this.service.consultarFinanzasUsuario(
        req.usuario!.rol,
        Number(req.params.id),
        Number(req.query.limite ?? 50),
        Number(req.query.offset ?? 0),
      );
      res.status(200).json({ supervision: finanzas });
    } catch (error) {
      next(error);
    }
  };

  cambiarEstado = async (
    req: RequestAutenticado & { body: CambiarEstadoAdminInput },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const usuario = await this.service.cambiarEstado(
        req.usuario!.id,
        req.usuario!.rol,
        Number(req.params.id),
        req.body.estado,
      );
      res.status(200).json({ usuario });
    } catch (error) {
      next(error);
    }
  };

  cambiarRol = async (
    req: RequestAutenticado & { body: CambiarRolAdminInput },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const usuario = await this.service.cambiarRol(
        req.usuario!.id,
        req.usuario!.rol,
        Number(req.params.id),
        req.body.rol,
      );
      res.status(200).json({ usuario });
    } catch (error) {
      next(error);
    }
  };
}
