import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import notificacionRoutes from '../infrastructure/adapters/in/http/routes/notificacionRoutes';
import { errorHandler, rutaNoEncontrada } from '../infrastructure/adapters/in/http/middlewares/errorHandler';
import { env } from '../infrastructure/config/env';

export function crearNotificationsApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins }));
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ estado: 'ok', servicio: 'notifications-service', timestamp: new Date().toISOString() });
  });

  app.use('/api/notificaciones', notificacionRoutes);

  app.use(rutaNoEncontrada);
  app.use(errorHandler);

  return app;
}
