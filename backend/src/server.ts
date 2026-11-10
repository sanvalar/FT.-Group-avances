import { crearApp } from './app';
import { env } from './infrastructure/config/env';
import { verificarConexionBD } from './infrastructure/adapters/out/persistence/postgres/db';

/**
 * Arranque del servidor HTTP. Antes de aceptar peticiones, verifica
 * que la conexion a PostgreSQL este disponible (falla rapido y con un
 * mensaje claro si la base de datos no esta accesible).
 */
async function iniciar(): Promise<void> {
  try {
    await verificarConexionBD();
    // eslint-disable-next-line no-console
    console.log('Conexion a PostgreSQL establecida correctamente.');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      type: 'database_startup_check_failed',
      code,
    }));
    process.exit(1);
  }

  const app = crearApp();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`FT. GROUP backend escuchando en http://localhost:${env.port}`);
    // eslint-disable-next-line no-console
    console.log(`Entorno: ${env.nodeEnv}`);
  });
}

iniciar();
