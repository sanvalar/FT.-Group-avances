import fs from 'fs';
import path from 'path';
import { pool } from '../adapters/out/persistence/postgres/db';

/**
 * Ejecuta, en orden alfabetico, todos los archivos .sql de la carpeta
 * db/migrations contra la base de datos configurada en .env.
 *
 * Uso:
 *   npm run migrate:dev   (con ts-node, en desarrollo)
 *   npm run build && npm run migrate   (compilado, en produccion)
 */
async function ejecutarMigraciones(): Promise<void> {
  const carpetaMigraciones = path.join(__dirname, '..', '..', '..', 'db', 'migrations');
  const archivos = fs
    .readdirSync(carpetaMigraciones)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();

  if (archivos.length === 0) {
    console.log('No se encontraron archivos de migracion.');
    return;
  }

  const client = await pool.connect();
  try {
    for (const archivo of archivos) {
      const rutaCompleta = path.join(carpetaMigraciones, archivo);
      const sql = fs.readFileSync(rutaCompleta, 'utf-8');
      console.log(`Ejecutando migracion: ${archivo} ...`);
      await client.query(sql);
      console.log(`OK: ${archivo}`);
    }
    console.log('Todas las migraciones se ejecutaron correctamente.');
  } finally {
    client.release();
    await pool.end();
  }
}

ejecutarMigraciones().catch((error: unknown) => {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'database_migration_failed',
    code,
  }));
  process.exit(1);
});
