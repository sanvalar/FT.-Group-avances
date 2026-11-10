import { Pool, PoolConfig, types } from 'pg';
import { env } from '../../../../config/env';

types.setTypeParser(20, (valor: string) => parseInt(valor, 10));

function crearConfiguracionPool(urlOpcional?: string): PoolConfig {
  if (urlOpcional) {
    return {
      connectionString: urlOpcional,
      ssl: env.databaseSsl ? { rejectUnauthorized: true } : undefined,
      max: env.databasePoolMax,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
    };
  }
  return {
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    ssl: env.databaseSsl ? { rejectUnauthorized: true } : undefined,
    max: env.databasePoolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  };
}

/**
 * 1. POOL DE BASE DE DATOS ACTIVA (Hot Storage / OLTP principal):
 * Atiende las operaciones diarias de alta concurrencia:
 * usuarios activos, sesiones activas, grupos vigentes y balances abiertos.
 */
export const pool = new Pool(crearConfiguracionPool(env.databaseUrl));

pool.on('error', (err: Error) => {
  const code = 'code' in err ? err.code : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'database_pool_activos_error',
    code,
  }));
});

/**
 * 2. POOL DE BASE DE DATOS INACTIVA / HISTÓRICA (Cold Storage / Archivo):
 * Dedicada a usuarios deshabilitados, grupos archivados y registros históricos
 * para evitar la degradación de índices y memoria en la base de datos de producción.
 * Si DATABASE_URL_HISTORICO no está configurada, utiliza la misma instancia
 * sobre el esquema dedicado `historico`.
 */
const urlHistorico = process.env.DATABASE_URL_HISTORICO || env.databaseUrl;
export const poolHistorico = new Pool(crearConfiguracionPool(urlHistorico));

poolHistorico.on('error', (err: Error) => {
  const code = 'code' in err ? err.code : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    type: 'database_pool_inactivos_error',
    code,
  }));
});

export async function verificarConexionBD(): Promise<number> {
  const inicio = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '3000'");
    await client.query('SELECT 1');
    await client.query('COMMIT');
    return Date.now() - inicio;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verificarConexionHistorica(): Promise<number> {
  const inicio = Date.now();
  const client = await poolHistorico.connect();
  try {
    await client.query('SELECT 1');
    return Date.now() - inicio;
  } finally {
    client.release();
  }
}
