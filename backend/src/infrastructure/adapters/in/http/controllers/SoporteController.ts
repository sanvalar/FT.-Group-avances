import { NextFunction, Response } from 'express';
import { SoporteService } from '../../../../../application/services/SoporteService';
import { RequestAutenticado } from '../middlewares/authMiddleware';
import {
  ComentarioTicketInput,
  CrearTicketInput,
  EstadoTicketInput,
  filtrosTicketsSchema,
} from '../validators/soporteValidators';

type ConBody<T> = Omit<RequestAutenticado, 'body'> & { body: T };

/**
 * Adaptador de entrada de los tickets de soporte, para quienes los
 * consultan o atienden sin pasar por el chat. El actor siempre sale de
 * req.usuario; el servicio decide si tiene permiso.
 */
export class SoporteController {
  constructor(private readonly service: SoporteService) {}

  listarMios = async (req: RequestAutenticado, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tickets = await this.service.listarMisTickets(req.usuario!);
      res.status(200).json({ tickets });
    } catch (error) {
      next(error);
    }
  };

  listarTodos = async (req: RequestAutenticado, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filtros = filtrosTicketsSchema.parse(req.query);
      const resultado = await this.service.listarTodos(req.usuario!, filtros);
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  };

  detalle = async (req: RequestAutenticado, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ticket = await this.service.obtenerTicket(req.usuario!, req.params.numero!);
      res.status(200).json({ ticket });
    } catch (error) {
      next(error);
    }
  };

  crear = async (
    req: ConBody<CrearTicketInput>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await this.service.crearTicket(req.usuario!, req.body);
      res.status(201).json({ ticket });
    } catch (error) {
      next(error);
    }
  };

  comentar = async (
    req: ConBody<ComentarioTicketInput>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const mensaje = await this.service.comentar(
        req.usuario!,
        req.params.numero!,
        req.body.comentario,
      );
      res.status(201).json({ mensaje });
    } catch (error) {
      next(error);
    }
  };

  cambiarEstado = async (
    req: ConBody<EstadoTicketInput>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await this.service.cambiarEstado(
        req.usuario!,
        req.params.numero!,
        req.body.estado,
      );
      res.status(200).json({ ticket });
    } catch (error) {
      next(error);
    }
  };
}
