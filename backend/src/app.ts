import express, { Application } from 'express';
import { randomUUID } from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createHandler } from 'graphql-http/lib/use/express';
import { graphqlSchema } from './infrastructure/config/graphqlSchema';
import authRoutes from './infrastructure/adapters/in/http/routes/authRoutes';
import grupoRoutes from './infrastructure/adapters/in/http/routes/grupoRoutes';
import reporteRoutes from './infrastructure/adapters/in/http/routes/reporteRoutes';
import notificacionRoutes from './infrastructure/adapters/in/http/routes/notificacionRoutes';
import administracionRoutes from './infrastructure/adapters/in/http/routes/administracionRoutes';
import auditoriaRoutes from './infrastructure/adapters/in/http/routes/auditoriaRoutes';
import estadoRoutes from './infrastructure/adapters/in/http/routes/estadoRoutes';
import iaRoutes from './infrastructure/adapters/in/http/routes/iaRoutes';
import soporteRoutes from './infrastructure/adapters/in/http/routes/soporteRoutes';
import asistenteRoutes from './infrastructure/adapters/in/http/routes/asistenteRoutes';
import contratosRoutes from './infrastructure/adapters/in/http/routes/contratosRoutes';
import educacionRoutes from './infrastructure/adapters/in/http/routes/educacionRoutes';
import { auditarActividad, autenticarOpcional } from './infrastructure/adapters/in/http/middlewares/authMiddleware';
import { errorHandler, rutaNoEncontrada } from './infrastructure/adapters/in/http/middlewares/errorHandler';
import { env } from './infrastructure/config/env';

/**
 * Composicion de la aplicacion Express (adaptador de entrada HTTP).
 * Separado de server.ts para poder importarlo en tests (supertest)
 * sin necesidad de levantar un puerto real.
 */
export function crearApp(): Application {
  const app = express();

  // --- Seguridad basica de cabeceras HTTP ---
  app.use(helmet({
    contentSecurityPolicy: false, // Permite consultas y visualizadores GraphQL
  }));

  // --- CORS ---
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || env.corsOrigins.includes(origin)),
  }));

  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // No se registran query strings, headers, cuerpos ni direcciones IP.
  app.use(morgan((tokens, req, res) => JSON.stringify({
    timestamp: new Date().toISOString(),
    level: Number(res.statusCode) >= 500 ? 'error' : Number(res.statusCode) >= 400 ? 'warn' : 'info',
    type: 'http_access',
    requestId: res.getHeader('X-Request-Id'),
    method: tokens.method(req, res),
    path: req.path,
    status: Number(res.statusCode),
    responseTimeMs: Number(tokens['response-time'](req, res)),
  })));

  // --- Parseo de JSON (con limite para mitigar payloads abusivos) ---
  app.use(express.json({ limit: '100kb' }));
  app.use(auditarActividad);

  // --- Chequeo de salud ---
  app.get('/health', (_req, res) => {
    res.status(200).json({ estado: 'ok', servicio: 'ft-group-backend', modulo: 'usuarios', graphql: true, coldStorage: true });
  });

  // --- Endpoints GraphQL y Dual REST ---
  app.use(
    '/graphql',
    autenticarOpcional,
    createHandler({
      schema: graphqlSchema,
      context: (req: any) => ({
        usuario: req.raw.usuario,
        headers: req.raw.headers,
      }),
    }),
  );

  // --- Rutas del modulo de usuarios / autenticacion (REST) ---
  app.use('/api/auth', authRoutes);
  app.use('/api/grupos', grupoRoutes);
  app.use('/api/reportes', reporteRoutes);
  app.use('/api/notificaciones', notificacionRoutes);
  app.use('/api/administracion', administracionRoutes);
  app.use('/api/auditoria', auditoriaRoutes);
  app.use('/api/estado', estadoRoutes);
  app.use('/api/ia', iaRoutes);
  app.use('/api/soporte', soporteRoutes);
  app.use('/api/asistente', asistenteRoutes);
  app.use('/api/contratos', contratosRoutes);
  app.use('/api/educacion', educacionRoutes);

  // --- 404 y manejo centralizado de errores ---
  app.use(rutaNoEncontrada);
  app.use(errorHandler);

  return app;
}
