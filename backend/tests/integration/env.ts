import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Variables de entorno para las pruebas de integracion. Se cargan antes de
 * importar la app (env.ts lee process.env al importarse).
 *
 * Prioridad de la conexion a PostgreSQL:
 *   1. Variables ya definidas en la terminal (por ejemplo en CI).
 *   2. DB_HOST, DB_PORT, DB_USER y DB_PASSWORD del backend/.env local
 *      (asi funciona igual con Docker, que usa el puerto 5439, o con un
 *      PostgreSQL instalado en el 5432).
 *   3. Los valores por defecto de abajo.
 *
 * La base SIEMPRE es una base de pruebas (DB_NAME debe terminar en _test):
 * nunca se toma DB_NAME ni DATABASE_URL del .env, para no tocar los datos
 * de desarrollo.
 */
const archivoEnv = path.join(__dirname, '..', '..', '.env');
const local = fs.existsSync(archivoEnv) ? dotenv.parse(fs.readFileSync(archivoEnv)) : {};

const valores: Record<string, string> = {
  NODE_ENV: 'test',
  DB_HOST: local.DB_HOST || 'localhost',
  DB_PORT: local.DB_PORT || '5432',
  DB_USER: local.DB_USER || 'postgres',
  DB_PASSWORD: local.DB_PASSWORD || 'postgres',
  DB_NAME: 'ft_group_test',
  DB_POOL_MAX: '5',
  JWT_SECRET: 'secreto-solo-para-pruebas-de-integracion-0123456789',
  JWT_EXPIRATION: '15m',
  CORS_ORIGIN: 'http://localhost:5173',
  IA_LIMITE_POR_HORA: '3',
  IA_MAX_MB: '1',
  LOGIN_MAX_INTENTOS: '5',
  LOGIN_VENTANA_MINUTOS: '15',
};

for (const [clave, valor] of Object.entries(valores)) {
  process.env[clave] ??= valor;
}

// Se deja vacia (no se borra) para que dotenv no la tome del .env: si
// existiera, la app se conectaria a la base de desarrollo en vez de la de pruebas.
process.env.DATABASE_URL = '';
process.env.DATABASE_SSL = 'false';

// La IA nunca se llama de verdad: ia.integration.ts inyecta un extractor
// falso con configurarExtractorFacturas() en cada prueba. IA_API_KEY no se
// puede dejar vacia (env.ts lo rechaza), asi que solo se fuerza el proveedor.
process.env.IA_PROVEEDOR = 'openai';
process.env.OPENAI_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
