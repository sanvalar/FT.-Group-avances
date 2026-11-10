import { crearNotificationsApp } from './notificationsApp';
import { env } from '../infrastructure/config/env';
import { verificarConexionBD } from '../infrastructure/adapters/out/persistence/postgres/db';

const PORT = Number(process.env.PORT ?? 3004);

async function bootstrap() {
  try {
    await verificarConexionBD();
    console.log('[NOTIFICATIONS-SERVICE] Conexión a la base de datos establecida.');
  } catch (error) {
    console.error('[NOTIFICATIONS-SERVICE] Error conectando a la base de datos:', error);
    process.exit(1);
  }

  const app = crearNotificationsApp();
  app.listen(PORT, env.serviceHost, () => {
    console.log(`[NOTIFICATIONS-SERVICE] Escuchando en http://${env.serviceHost}:${PORT}`);
  });
}

bootstrap();
