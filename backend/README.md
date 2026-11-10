# FT. GROUP — Backend y servicios financieros

Backend del **Sistema Web de Gestión y División de Gastos Compartidos**
(FT. GROUP, Grupo 2, Universidad de San Buenaventura), con autenticación,
gestión de grupos, gastos compartidos, balances, historial, notificaciones y
reportes sobre la **Arquitectura Hexagonal (Ports & Adapters)** definida en el
documento oficial de arquitectura. Los servicios comparten la API Express y la
base de datos PostgreSQL, de acuerdo con esa arquitectura; no son despliegues
independientes.

**Stack:** Node.js 22+ + Express + TypeScript + PostgreSQL + JWT + Argon2id.

---

## 1. ¿Por qué esta estructura de carpetas?

```
src/
├── domain/                 # NÚCLEO: no depende de Express, ni de pg, ni de JWT
│   ├── entities/            → Usuario (reglas de negocio puras)
│   ├── services/            → Reglas de dominio para división de gastos
│   ├── errors/               → Errores de negocio (EmailYaRegistradoError, etc.)
│   └── ports/
│       ├── in/               → Contratos de los casos de uso (lo que el exterior puede pedir)
│       └── out/               → Contratos que el núcleo exige a la infraestructura
│                                (UsuarioRepository, PasswordHasher, TokenService...)
│
├── application/            # Casos de uso y servicios de aplicación
│   ├── services/            → Grupos, gastos, pagos e indicadores
│   └── usecases/            → Casos de uso de usuario y autenticación
│   ├── RegistrarUsuarioUseCaseImpl.ts
│   ├── IniciarSesionUseCaseImpl.ts
│   ├── RefrescarTokenUseCaseImpl.ts
│   ├── CerrarSesionUseCaseImpl.ts
│   └── ObtenerPerfilUseCaseImpl.ts
│
├── infrastructure/          # ADAPTADORES: aquí sí se conocen Express, pg, jsonwebtoken, Argon2id
│   ├── adapters/in/http/     → Adaptador de entrada (API REST)
│   │   ├── controllers/       → Traducen HTTP ↔ casos de uso
│   │   ├── routes/            → Definición de endpoints
│   │   ├── middlewares/       → Validación (Zod), autenticación (JWT), manejo de errores
│   │   └── validators/        → Esquemas de validación de entrada
│   ├── adapters/out/
│   │   ├── persistence/postgres/ → Repositorios PostgreSQL de usuarios y finanzas
│   │   └── security/              → Argon2PasswordHasher, JwtTokenService
│   └── config/
│       ├── env.ts             → Único lugar que lee variables de entorno
│       ├── container.ts       → "Composition root": conecta puertos con adaptadores
│       └── runMigrations.ts   → Ejecuta los .sql de db/migrations
│
├── app.ts                   # Configuración de Express (middlewares, rutas)
└── server.ts                # Punto de entrada: conecta a la BD y levanta el servidor

db/migrations/               # SQL de usuarios, grupos, gastos y actividad
tests/unit/                  # Pruebas de dominio y aplicación
```

**Regla de oro de esta arquitectura:** el código dentro de `domain/` y
`application/` nunca debería tener un `import` de `express`, `pg`,
`argon2` ni `jsonwebtoken`. Todo lo que el núcleo necesita del exterior
pasa por una interfaz (`ports/out`), y quien la implementa vive en
`infrastructure/`.

---

## 2. Requisitos previos

- Node.js 22 o superior
- PostgreSQL 14+ (local, o vía Docker)

## 3. Puesta en marcha

```bash
# 1) Instalar dependencias
npm install

# 2) Configurar variables de entorno
cp .env.example .env
# Editar .env: como mínimo, cambia JWT_SECRET por un valor propio.
#   Puedes generar uno con: openssl rand -base64 48

# 3) Levantar PostgreSQL
#    Opción A: con Docker (recomendado)
docker compose up -d

#    Opción B: usar un PostgreSQL que ya tengas instalado localmente,
#    ajustando DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME en .env

# 4) Ejecutar las migraciones (usuarios y módulos financieros)
npm run migrate:dev

# 5) Levantar el servidor en modo desarrollo (recarga automática)
npm run seed:roles
npm run dev
```

El servidor queda escuchando en `http://localhost:3000` (o el `PORT` que
hayas definido). Puedes verificar que está vivo con:

```bash
curl http://localhost:3000/health
```

### Para producción

```bash
npm run build      # compila TypeScript a dist/
npm run migrate     # ejecuta migraciones usando el build compilado
npm start           # node dist/server.js
```

---

## 4. Endpoints del módulo de usuarios

Todos los cuerpos de petición/respuesta son JSON.

| Método | Ruta                  | Descripción                                    | Requiere token |
|--------|-----------------------|------------------------------------------------|:--------------:|
| POST   | `/api/auth/registro`  | Registra un nuevo usuario                       | No             |
| POST   | `/api/auth/login`     | Inicia sesión y devuelve access + refresh token | No             |
| POST   | `/api/auth/refresh`   | Renueva el access token (rota el refresh token) | No             |
| POST   | `/api/auth/logout`    | Revoca un refresh token                         | No             |
| GET    | `/api/auth/me`        | Devuelve el perfil del usuario autenticado      | Sí (Bearer)    |
| GET    | `/api/estado`          | Estado de API y base de datos                   | Supervisor     |
| GET    | `/health`             | Chequeo de salud del servicio                   | No             |

### Roles de aplicación

La migración `004_roles_usuario.sql` asigna el rol `usuario` por defecto a las cuentas existentes y nuevas. El registro público no permite elegir un rol.

| Método | Ruta | Permiso | Función |
|---|---|---|---|
| GET | `/api/administracion/usuarios` | Moderador o supervisor | Lista cuentas sin exponer contraseñas ni hashes. |
| GET | `/api/administracion/usuarios/:id/finanzas` | Supervisor | Consulta grupos y gastos relacionados con una cuenta, en modo de solo lectura y con paginación (`limite` hasta 100, `offset`). |
| PATCH | `/api/administracion/usuarios/:id/estado` | Moderador o supervisor | Activa, desactiva o bloquea una cuenta. Un moderador solo gestiona cuentas `usuario`. |
| PATCH | `/api/administracion/usuarios/:id/rol` | Supervisor | Asigna `usuario`, `moderador` o `supervisor`. |

Los cambios no permiten gestionar la propia cuenta desde administración. La autorización usa el rol actual consultado en PostgreSQL, por lo que cambiar un rol o bloquear una cuenta invalida el permiso de la sesión inmediatamente.

Los módulos financieros (`/api/grupos`, reportes, notificaciones, escaneo IA, contratos y educación personal) y las consultas de grupos en GraphQL son exclusivos del rol `usuario`. Los supervisores acceden a la consulta financiera de solo lectura y moderadores a soporte y estadísticas educativas agregadas; ambos accesos se validan en el backend.

### GraphQL

El endpoint es `POST /graphql` y utiliza el mismo token Bearer que la API REST. Las consultas `misGrupos` y `miPanel` entregan al usuario autenticado sus grupos, miembros, gastos agregados y balances; no aceptan un ID de usuario proporcionado por el cliente. `usuarios` permite listar y filtrar cuentas a moderadores y supervisores. `finanzasUsuario(usuarioId, limite, offset)` está reservado al supervisor y reutiliza el servicio de supervisión de solo lectura. `yo` devuelve el perfil autenticado y `gruposArchivados` solo los grupos archivados por la cuenta actual. Las mutaciones `cambiarEstadoUsuario` y `cambiarRolUsuario` reutilizan las reglas del servicio de administración; los alias `desactivarUsuario` y `archivarGrupo` también aplican esas reglas y controles de pertenencia. El frontend consume GraphQL en paneles, grupos, administración y supervisión. Las demás operaciones de escritura financiera, soporte y educación siguen en REST sin duplicar endpoints ni reglas de negocio.

Ejemplo de consulta autenticada:

```graphql
query MiPanel {
  miPanel {
    balance
    grupos { id nombre totalGastos miBalance }
    liquidaciones { grupo de para monto }
  }
}
```

Ejemplo de mutación administrativa (moderador o supervisor, sujeto a las reglas de rol):

```graphql
mutation BloquearCuenta($id: ID!) {
  cambiarEstadoUsuario(usuarioId: $id, estado: bloqueado) {
    id nombre estado
  }
}
```

Los errores de negocio GraphQL conservan mensajes seguros y exponen códigos estables en `errors[].extensions.code` (`FORBIDDEN`, `UNAUTHENTICATED`, `BAD_USER_INPUT`, `NOT_FOUND` o `CONFLICT`). Los fallos inesperados se registran en el servidor y se responden con un mensaje genérico, sin revelar consultas, credenciales ni detalles internos. El cliente convierte estos errores en errores de API para que las pantallas los muestren; no reemplaza fallos del backend por cambios simulados.

Para crear o restablecer las cuentas de demostración ejecuta `npm run seed:roles` después de las migraciones. Este comando está bloqueado cuando `NODE_ENV=production`:

| Rol | Correo | Contraseña |
|---|---|---|
| Moderador | `moderador@ftgroup.test` | `Moderador2026!` |
| Supervisor | `supervisor@ftgroup.test` | `Supervisor2026!` |
| Usuario común | `usuario@ftgroup.test` | `Usuario2026!` |

El comando actualiza únicamente las tres direcciones de correo de prueba.

### Auditoría

La migración `005_auditoria.sql` crea una bitácora cronológica de actividad. Las solicitudes autenticadas a la API quedan registradas con actor, rol vigente, método, ruta, código HTTP y fecha. También se registran los registros de cuenta, inicios y cierres de sesión, renovaciones de token y las acciones financieras principales del modo local de demostración.

| Método | Ruta | Permiso | Función |
|---|---|---|---|
| GET | `/api/auditoria` | Supervisor | Consulta la bitácora con filtros por fechas, rol, método y texto; paginación de hasta 100 filas. |
| POST | `/api/auditoria/eventos` | Cualquier usuario autenticado | Registra una acción permitida de la demostración local bajo la identidad derivada del token. |

No se guardan contraseñas, tokens ni cuerpos de solicitud. La interfaz no ofrece acciones para editar o eliminar eventos. Las acciones enviadas desde la demostración local se distinguen con método `LOCAL`; son eventos declarados por el cliente, mientras que las solicitudes de API se registran en el backend.

Cada evento incluye el motivo para completar la regla 5W (quién, qué, cuándo, dónde y por qué). La migración `006_auditoria_regla_5w.sql` conserva los eventos anteriores e indica cuando el motivo histórico no estaba disponible. El [manual de administración y técnico del auditor](./AUDITORIA.md) explica filtros, despliegue, persistencia, logs y diagnóstico.

### Estado del sistema y logs

El supervisor puede abrir **Estado del sistema** para comprobar API, disponibilidad de PostgreSQL, latencia de la consulta, tiempo activo y fecha de actualización. El endpoint protegido responde con HTTP 503 si PostgreSQL no está disponible y no incluye detalles de conexión.

El backend emite logs JSON por solicitud (`http_access`) con identificador generado, método, ruta sin query string, estado y duración. No registra IP, headers, cuerpo, contraseña, tokens ni parámetros de consulta. En Vercel estos logs operativos se consultan en **Logs** del proyecto; la bitácora funcional de auditoría permanece guardada en PostgreSQL.

### Contraseñas

Las nuevas contraseñas se almacenan con Argon2id (19 MiB, 2 iteraciones, paralelismo 1); no se cifran reversiblemente. Los hashes bcrypt existentes se verifican con `bcryptjs` solo durante la transición y, tras un inicio de sesión válido, se reemplazan por Argon2id. Como no es posible convertir un hash sin conocer la contraseña, conserva temporalmente ese verificador hasta que las cuentas antiguas hayan iniciado sesión o se haya restablecido su contraseña; después se podrá retirar.

### Despliegue de staging en Vercel

Se crean dos proyectos desde el mismo repositorio:

1. **Backend:** Root Directory `backend`, Node.js 22 o superior. El punto de entrada serverless `src/index.ts` exporta la aplicación Express; no se inicia un puerto.
2. **Frontend:** Root Directory `frontend`, framework Vite. `vercel.json` configura la compilación y el fallback de las rutas React.
3. Crea una base PostgreSQL de staging (por ejemplo, Neon) accesible desde Vercel. Ejecuta `npm run build` y `npm run migrate` dentro de `backend` con las variables de staging antes de probar el sitio.
4. Configura variables **separadas para Preview y Production** en Vercel:
   - Backend: `NODE_ENV=production`, `DATABASE_URL` (secreto TLS del proveedor), `JWT_SECRET` (genera uno nuevo con `openssl rand -base64 48`), `CORS_ORIGIN` (origen HTTPS exacto del frontend, sin `*`) y `DB_POOL_MAX=2`.
   - Frontend: `VITE_API_URL=https://<dominio-backend>/api` y `VITE_FINANCE_MODE=local` para mantener los datos financieros de demostración en el navegador. Usa el dominio real que Vercel asigne a Preview/Production.
5. Vuelve a desplegar después de guardar variables y comprueba `/health`, el inicio de sesión, `/api/estado` como supervisor y la vista Auditoría.

No guardes secretos en Git ni los envíes por chat. `VITE_API_URL` no es secreto. El modo financiero `local` mantiene los datos de demostración en el navegador; activa el modo `api` solo cuando las rutas financieras del frontend apunten al API desplegado correspondiente.

### Servicios financieros y analíticos

Todas estas rutas requieren `Authorization: Bearer <accessToken>`.

| Método | Ruta | Función |
|--------|------|---------|
| GET / POST | `/api/grupos` | Listar los grupos propios / crear un grupo (el creador queda como administrador). |
| GET | `/api/grupos/:grupoId/integrantes` | Consultar integrantes activos del grupo. |
| POST | `/api/grupos/:grupoId/integrantes` | Agregar un integrante (JSON `{ "usuarioId": 2 }`). Solo administradores gestionan integrantes. |
| DELETE | `/api/grupos/:grupoId/integrantes/:usuarioId` | Retirar un integrante; el grupo conserva un administrador activo. |
| GET / POST | `/api/grupos/:grupoId/gastos` | Consultar o registrar gastos con división equitativa o personalizada. |
| POST | `/api/grupos/gastos/:gastoId/pagos` | Confirmar el pago pendiente del usuario autenticado. |
| GET | `/api/grupos/:grupoId/balances` | Consultar balances netos del integrante autenticado. |
| GET | `/api/grupos/:grupoId/historial` | Consultar movimientos recientes del grupo. |
| GET | `/api/reportes/resumen` | KPIs personales y proyección mensual mediante promedio móvil de los tres meses completos previos. |
| GET | `/api/notificaciones` | Listar las notificaciones del usuario autenticado. |
| PATCH | `/api/notificaciones/:notificacionId/leida` | Marcar una notificación propia como leída. |

Ejemplo de gasto equitativo:

```json
{
  "descripcion": "Compra compartida",
  "montoTotal": 30,
  "fechaGasto": "2026-10-06",
  "categoria": "Comida",
  "tipoDivision": "equitativa",
  "usuarioIds": [1, 2, 3]
}
```

El servicio reparte los importes en centavos para conservar exactamente el
monto total. El alta del gasto, sus participaciones, movimientos, notificaciones
y el recálculo de balances se ejecutan dentro de una transacción. Las migraciones
`003_modulos_financieros.sql` crean las tablas e índices de estos módulos.

### Ejemplos con `curl`

**Registrar usuario**
```bash
curl -X POST http://localhost:3000/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana Torres","email":"ana@example.com","password":"claveSegura123"}'
```

**Iniciar sesión**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","password":"claveSegura123"}'
```
Respuesta:
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "d67548781...",
  "usuario": { "id": 1, "nombre": "Ana Torres", "email": "ana@example.com", "...": "..." }
}
```

**Consultar perfil (ruta protegida)**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

**Renovar el access token**
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

**Cerrar sesión**
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

---

## 5. Seguridad implementada

Conforme a la sección "Consideraciones de seguridad" del documento de
arquitectura:

- Contraseñas nuevas con hash **Argon2id**, nunca en texto plano; los hashes bcrypt heredados se verifican temporalmente con `bcryptjs` y se migran tras un login válido.
- **JWT** de corta duración (15 min por defecto) para el access token.
- **Refresh token** opaco (no JWT), persistido en BD, con expiración (7
  días) y **revocación**; se **rota** en cada uso (`/refresh` invalida
  el token usado y entrega uno nuevo).
- Validación y saneamiento de entradas con **Zod** antes de llegar a la
  lógica de negocio.
- Cabeceras HTTP endurecidas con **Helmet**.
- Secreto JWT obligatorio y de al menos 32 caracteres; CORS exige orígenes HTTPS explícitos en producción.
- PostgreSQL usa TLS validado y un pool limitado para funciones serverless.
- Logs de acceso estructurados que omiten datos personales, query strings, cabeceras y cuerpos.
- Consultas SQL **parametrizadas** (sin concatenación de strings) para
  evitar inyección SQL.
- Mensajes de error de login genéricos ("correo o contraseña
  incorrectos") para no revelar si un correo está registrado.
- Límite de tamaño de payload JSON (100kb) para mitigar abusos.

## 6. Pruebas

```bash
npm test
```

Las pruebas unitarias (`tests/unit/`) ejercitan los casos de uso
(`RegistrarUsuarioUseCaseImpl`, `IniciarSesionUseCaseImpl`) usando
**dobles de prueba (mocks)** de los puertos de salida — no requieren
una base de datos real. Esto demuestra en la práctica el atributo de
"Testabilidad" señalado en el documento de arquitectura como una de
las ventajas del enfoque hexagonal.

## 7. Cómo extender este backend (próximos módulos)

Para agregar el siguiente módulo (p. ej. **Grupos**), el patrón a
seguir es siempre el mismo:

1. **Dominio:** crear la entidad (`Grupo`) y sus errores en `domain/`.
2. **Puertos:** definir `GrupoRepository` (`ports/out`) y los casos de
   uso como interfaces (`ports/in`).
3. **Aplicación:** implementar los casos de uso (`CrearGrupoUseCaseImpl`, etc.)
   usando solo los puertos, nunca `pg` o `express` directamente.
4. **Infraestructura:** implementar `PostgresGrupoRepository`, agregar
   la migración SQL, el controlador HTTP y las rutas.
5. **Conectar:** registrar las nuevas instancias en `container.ts`.

Esto mantiene la promesa central de la arquitectura elegida: el
dominio y los casos de uso nunca cambian por cambios de infraestructura.
