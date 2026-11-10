# Pruebas de integración

Levantan la aplicación Express completa (con `supertest`, sin abrir puertos)
contra una base **PostgreSQL real**. No usan mocks de base de datos: cada
prueba pasa por rutas, middlewares, validadores, casos de uso y repositorios.

## Requisitos

PostgreSQL 16 en marcha. Con Docker basta `docker compose up -d` en esta
carpeta (expone el puerto **5439**).

Las pruebas toman la conexión (`DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`) de tu `backend/.env`, así que funcionan igual con Docker
(5439) o con PostgreSQL instalado (5432). Si no hay `.env`, usan
`localhost:5432` con `postgres`/`postgres`.

## Ejecutar

```bash
npm run test:integration   # solo integración
npm run test:all           # unitarias + integración
```

Antes de empezar, `globalSetup.ts` crea la base `ft_group_test` si no existe,
**la vacía** y ejecuta todas las migraciones de `db/migrations`. Nunca usa
`DB_NAME` ni `DATABASE_URL` del `.env`, y se niega a correr si la base no
termina en `_test`, así que tus datos de desarrollo (`ft_group`) no se tocan.

Para usar otra conexión, define las variables en la terminal (tienen
prioridad sobre el `.env`), por ejemplo en PowerShell:

```powershell
$env:DB_PORT="5432"; npm run test:integration
```

Para correr una sola prueba o un grupo, filtra por nombre con `-t`:

```bash
npx jest -c jest.integration.config.js -t "Fuerza bruta" --verbose
```

Las pruebas de seguridad, autenticación, IA y control de acceso (IDOR) se
pueden correr solas. El flujo principal de `grupos.integration.ts` (crear
grupo → integrantes → gasto → balance → pago → historial) es un escenario
secuencial: córrelo completo con

```bash
npx jest -c jest.integration.config.js grupos --verbose
```

La IA (OpenAI/Claude) nunca se llama: `ia.integration.ts` inyecta un extractor
falso con `configurarExtractorFacturas`.

## Suites

| Archivo | Qué cubre |
|---|---|
| `auth.integration.ts` | Registro, login, Argon2id, rotación y revocación de refresh tokens, perfil, desactivación, auditoría |
| `grupos.integration.ts` | Grupos, integrantes, gastos (equitativos/personalizados), balances, pagos, historial, control de acceso (IDOR) |
| `seguridad.integration.ts` | Cabeceras, CORS, tamaño de cuerpo, JSON inválido, inyección SQL, fuerza bruta, tokens alterados/expirados/`alg:none`, matriz de roles |
| `ia.integration.ts` | Escaneo con IA: autenticación, formatos, firma del archivo, tamaño, errores del proveedor, límite por usuario |
