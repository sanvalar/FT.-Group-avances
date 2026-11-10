const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const proxy = require('express-http-proxy');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('dev'));

// URLs de los Microservicios (vía variables de entorno para Docker o fallback local)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const EXPENSES_SERVICE_URL = process.env.EXPENSES_SERVICE_URL || 'http://localhost:3002';
const REPORTS_SERVICE_URL = process.env.REPORTS_SERVICE_URL || 'http://localhost:3003';
const NOTIFICATIONS_SERVICE_URL = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3004';

// Endpoint de salud del API Gateway y chequeo de microservicios
app.get('/health', async (_req, res) => {
  res.status(200).json({
    estado: 'ok',
    gateway: 'ft-group-api-gateway',
    timestamp: new Date().toISOString(),
    servicios: {
      auth: AUTH_SERVICE_URL,
      grupos_gastos: EXPENSES_SERVICE_URL,
      reportes: REPORTS_SERVICE_URL,
      notificaciones: NOTIFICATIONS_SERVICE_URL,
    },
  });
});

// Enrutamiento / Proxy inverso hacia microservicios específicos

// 1. Auth & Users Service
app.use('/api/auth', proxy(AUTH_SERVICE_URL, {
  proxyReqPathResolver: (req) => `/api/auth${req.url}`,
}));

// Panel de administradores y roles en Auth Service
app.use('/api/administracion', proxy(AUTH_SERVICE_URL, {
  proxyReqPathResolver: (req) => `/api/administracion${req.url}`,
}));

// 2. Groups & Expenses Service
app.use('/api/grupos', proxy(EXPENSES_SERVICE_URL, {
  proxyReqPathResolver: (req) => `/api/grupos${req.url}`,
}));

// 3. Reports & Analytics Service
app.use('/api/reportes', proxy(REPORTS_SERVICE_URL, {
  proxyReqPathResolver: (req) => `/api/reportes${req.url}`,
}));

// 4. Notifications Service
app.use('/api/notificaciones', proxy(NOTIFICATIONS_SERVICE_URL, {
  proxyReqPathResolver: (req) => `/api/notificaciones${req.url}`,
}));

// Manejo de rutas inexistentes
app.use((_req, res) => {
  res.status(404).json({ error: 'RutaNoEncontrada', mensaje: 'El recurso solicitado no existe en la arquitectura de microservicios.' });
});

app.listen(PORT, () => {
  console.log(`[API-GATEWAY] Escuchando en http://localhost:${PORT}`);
});
