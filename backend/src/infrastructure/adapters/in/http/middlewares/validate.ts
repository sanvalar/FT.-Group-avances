import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

const formatearErrores = (error: ZodError) =>
  error.errors.map((e) => ({
    campo: e.path.join('.'),
    mensaje: e.message,
  }));

export const validarBody = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          mensaje: 'Datos de entrada invalidos.',
          errores: formatearErrores(error),
        });
      }
      next(error);
    }
  };

export const validarParams = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          mensaje: 'Parametros de ruta invalidos.',
          errores: formatearErrores(error),
        });
      }
      next(error);
    }
  };

export const validarQuery = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          mensaje: 'Parametros de consulta invalidos.',
          errores: formatearErrores(error),
        });
      }
      next(error);
    }
  };