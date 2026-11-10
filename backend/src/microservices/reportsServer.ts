import { crearReportsApp } from './reportsApp';
import { env } from '../infrastructure/config/env';
import { verificarConexionBD } from '../infrastructure/adapters/out/persistence/postgres/db';

const PORT = process.env.PORT || 3003;

async function bootstrap() {
  try {
    await verificarConexionBD();
    console.log('[REPORTS-SERVICE] Conexión a la base de datos establecida.');
  } catch (error) {
    console.error('[REPORTS-SERVICE] Error conectando a la base de datos:', error);
    process.exit(1);
  }

  const app = crearReportsApp();
  app.listen(PORT, () => {
    console.log(`[REPORTS-SERVICE] Escuchando en http://localhost:${PORT}`);
  });
}

bootstrap();
