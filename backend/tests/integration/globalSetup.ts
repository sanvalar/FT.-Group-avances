import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import './env';

/**
 * Antes de toda la suite: crea la base de pruebas si no existe, la deja
 * vacia y ejecuta todas las migraciones de db/migrations en orden.
 * Se niega a ejecutarse sobre una base cuyo nombre no termine en "_test".
 */
export default async function globalSetup(): Promise<void> {
  const nombreBd = process.env.DB_NAME as string;
  if (!nombreBd.endsWith('_test')) {
    throw new Error(`Por seguridad, DB_NAME debe terminar en "_test" (recibido: ${nombreBd}).`);
  }
  const conexion = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  const admin = new Client({ ...conexion, database: 'postgres' });
  await admin.connect();
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombreBd]);
  if (existe.rowCount === 0) await admin.query(`CREATE DATABASE "${nombreBd}"`);
  await admin.end();

  const cliente = new Client({ ...conexion, database: nombreBd });
  await cliente.connect();
  try {
    await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const carpeta = path.join(__dirname, '..', '..', 'db', 'migrations');
    for (const archivo of fs.readdirSync(carpeta).filter((a) => a.endsWith('.sql')).sort()) {
      await cliente.query(fs.readFileSync(path.join(carpeta, archivo), 'utf-8'));
    }
  } finally {
    await cliente.end();
  }
}
