import { Request, Response } from 'express';
import { verificarConexionBD } from '../../../out/persistence/postgres/db';

export class EstadoSistemaController {
  static async consultar(_req: Request, res: Response): Promise<void> {
    try {
      const latenciaMs = await verificarConexionBD();
      res.status(200).json({
        estado: 'operativo',
        uptimeSegundos: Math.floor(process.uptime()),
        servicios: {
          api: { estado: 'operativo' },
          baseDatos: { estado: 'operativa', latenciaMs },
        },
        actualizadoEn: new Date().toISOString(),
      });
    } catch {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        type: 'system_status_database_unavailable',
      }));
      res.status(503).json({
        estado: 'degradado',
        mensaje: 'Uno o más servicios no están disponibles.',
        uptimeSegundos: Math.floor(process.uptime()),
        servicios: {
          api: { estado: 'operativo' },
          baseDatos: { estado: 'no disponible' },
        },
        actualizadoEn: new Date().toISOString(),
      });
    }
  }
}
