# FT. GROUP

Sistema web de gestión y división de gastos compartidos — Universidad de San Buenaventura, sede Bello.

El repositorio es un **monorepo**: frontend y backend viven juntos, cada uno en su carpeta y con sus propias dependencias.

```
.
├── frontend/   React + Vite: interfaz, análisis, KPIs y predicciones   → frontend/README.md
├── backend/    Node + Express + TypeScript + PostgreSQL (hexagonal)    → backend/README.md
└── README.md   este archivo
```

Cada carpeta se instala y se ejecuta por separado (`npm install` dentro de cada una). No hay `package.json` en la raíz.

## Requisitos

- [Node.js](https://nodejs.org) 22 o superior para el backend y [Git](https://git-scm.com).
- PostgreSQL 16, de una de estas dos formas:
  - **Docker Desktop:** `docker compose up -d` dentro de `backend/` levanta la base de datos ya creada.
  - **PostgreSQL instalado** (por ejemplo, junto con pgAdmin): crea una base de datos llamada `ft_group` y pon tu contraseña en `DB_PASSWORD` del `backend/.env`.

## Cómo ejecutar

Abre **dos terminales**, una para cada parte.

**Terminal 1: backend** (http://localhost:3000)

```bash
cd .\backend
Copy-Item .env.example .env
npm install
docker compose up -d
npm run migrate:dev
npm run seed:roles             # crea los usuarios de prueba moderador y supervisor
npm run dev
```

**Terminal 2: frontend** (http://localhost:5173)

```bash
cd .\frontend
Copy-Item .env.example .env
npm install
npm run dev
```

En `frontend/.env`, `VITE_FINANCE_MODE=local` guarda grupos y gastos en el navegador con datos de demostración; el inicio de sesión siempre usa el backend. `VITE_FINANCE_MODE=api` usa el backend para todo.

La aplicación incluye un chatbot local de preguntas frecuentes sobre el uso del sistema. Funciona sin claves de API, servicios externos ni configuración adicional; no accede a datos personales o financieros.

La cuenta de exposición `usuario@ftgroup.test` tiene grupos y gastos de ejemplo en los módulos financieros; estos datos se guardan en el navegador y no afectan al backend. Desde **Mi perfil** se pueden restaurar.

Con ambos procesos activos, abre http://localhost:5173 e inicia sesión con una de estas cuentas de desarrollo:

| Rol | Correo | Contraseña |
|---|---|---|
| Moderador | `moderador@ftgroup.test` | `Moderador2026!` |
| Supervisor | `supervisor@ftgroup.test` | `Supervisor2026!` |
| Usuario común | `usuario@ftgroup.test` | `Usuario2026!` |

El supervisor tiene una interfaz separada de **Supervisión de usuarios**, desde la que puede consultar en modo de solo lectura los grupos y gastos relacionados con cada cuenta; también dispone de **Administración**, **Auditoría**, **Estado del sistema** y **Control educativo**. No tiene acceso a los módulos financieros de usuario común. El moderador conserva los módulos habituales y accede a Administración para consultar usuarios y gestionar el estado de cuentas estándar; el supervisor también puede asignar roles. Las cuentas de prueba solo deben usarse localmente.

La opción **Auditoría** aparece en el menú del supervisor. Registra solicitudes autenticadas del backend y acciones de escritura de la demostración local; la pantalla permite filtrar por fechas, rol, método y texto. **Estado del sistema** muestra la disponibilidad de API y base de datos. Los logs HTTP estructurados se consultan en stdout o en Vercel. No se almacenan contraseñas, tokens, query strings ni cuerpos de formularios. La demostración local etiqueta sus eventos como `LOCAL`.

La bitácora implementa la regla 5W (quién, qué, cuándo, dónde y por qué). Consulta el [manual de administración y técnico del sistema auditor](./backend/AUDITORIA.md) para operarlo y desplegarlo.

Las contraseñas nuevas se guardan con Argon2id. Los hashes bcrypt heredados se actualizan automáticamente al iniciar sesión con la contraseña correcta.

## Staging en Vercel

El despliegue se prepara como dos proyectos Vercel independientes: el backend con Root Directory `backend` y el frontend con Root Directory `frontend`. Antes del despliegue, crea PostgreSQL en un proveedor accesible desde Vercel y ejecuta las migraciones del backend con la URL de staging. Configura los secretos `DATABASE_URL`, `JWT_SECRET` (al menos 32 caracteres) y `CORS_ORIGIN` solo en la configuración de entorno de Vercel; el frontend requiere `VITE_API_URL` con el dominio del backend y el sufijo `/api`. Configura `VITE_FINANCE_MODE=local` para el demo financiero, que se guarda en el navegador. Las instrucciones completas están en [backend/README.md](./backend/README.md#despliegue-de-staging-en-vercel).

No puedo publicar directamente en una cuenta de Vercel ni provisionar una base externa sin acceso a esas cuentas. No compartas credenciales aquí.

## Pruebas

```bash
cd backend  && npm test       # Jest: dominio y casos de uso
cd frontend && npm test       # node --test: KPIs y modelos de análisis
```

## Convenciones

- Nunca se suben `node_modules/`, `dist/` ni archivos `.env` (ver `.gitignore`).
- Cada cambio va en una rama y entra a `main` mediante pull request.
