import { crearAuthApp } from './authApp';
import { env } from '../infrastructure/config/env';
import { verificarConexionBD } from '../infrastructure/adapters/out/persistence/postgres/db';

const PORT = Number(process.env.PORT ?? 3001);

async function bootstrap() {
  try {
    await verificarConexionBD();
    console.log('[AUTH-SERVICE] Conexión a la base de datos establecida.');
  } catch (error) {
    console.error('[AUTH-SERVICE] Error conectando a la base de datos:', error);
    process.exit(1);
  }

  const app = crearAuthApp();
  app.listen(PORT, env.serviceHost, () => {
    console.log(`[AUTH-SERVICE] Escuchando en http://${env.serviceHost}:${PORT}`);
  });
}

bootstrap();
