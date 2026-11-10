import { NextFunction, Response } from 'express';
import { AsistenteService } from '../../../../../application/services/AsistenteService';
import { UsuarioRepository } from '../../../../../domain/ports/out/UsuarioRepository';
import { RequestAutenticado } from '../middlewares/authMiddleware';
import { MensajeAsistenteInput } from '../validators/soporteValidators';

type RequestMensaje = Omit<RequestAutenticado, 'body'> & { body: MensajeAsistenteInput };

/**
 * Adaptador de entrada del asistente.
 *
 * El contexto del usuario se arma EXCLUSIVAMENTE desde req.usuario, que
 * authMiddleware rellena tras verificar el access token. Nada de lo que
 * venga en el cuerpo de la peticion puede cambiar de quien son los datos
 * que consultara el agente.
 */
export class AsistenteController {
  constructor(
    private readonly service: AsistenteService,
    private readonly usuarios: UsuarioRepository,
  ) {}

  estado = (_req: RequestAutenticado, res: Response): void => {
    res.status(200).json({ disponible: this.service.disponible() });
  };

  responder = async (req: RequestMensaje, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sesion = req.usuario!;
      // El nombre se lee de la base de datos solo para que el asistente
      // pueda dirigirse al usuario; la identidad efectiva sigue siendo la
      // del token.
      const cuenta = await this.usuarios.buscarPorId(sesion.id);
      const resultado = await this.service.atender({
        usuario: {
          id: sesion.id,
          nombre: cuenta?.nombre ?? 'usuario',
          email: sesion.email,
          rol: sesion.rol,
        },
        mensaje: req.body.mensaje,
        conversacionId: req.body.conversacionId,
      });
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  };
}
