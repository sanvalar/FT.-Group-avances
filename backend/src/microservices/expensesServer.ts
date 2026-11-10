import { crearExpensesApp } from './expensesApp';
import { env } from '../infrastructure/config/env';
import { verificarConexionBD } from '../infrastructure/adapters/out/persistence/postgres/db';

const PORT = process.env.PORT || 3002;

async function bootstrap() {
  try {
    await verificarConexionBD();
    console.log('[EXPENSES-SERVICE] Conexión a la base de datos establecida.');
  } catch (error) {
    console.error('[EXPENSES-SERVICE] Error conectando a la base de datos:', error);
    process.exit(1);
  }

  const app = crearExpensesApp();
  app.listen(PORT, () => {
    console.log(`[EXPENSES-SERVICE] Escuchando en http://localhost:${PORT}`);
  });
}

bootstrap();
