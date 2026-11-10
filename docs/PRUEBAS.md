# Informe de pruebas — Fase 7

**Proyecto:** FT. GROUP — Sistema web de gestión y división de gastos compartidos
**Fase:** 7 · Ejecución de pruebas unitarias y de integración, ajustes y refinamientos, optimización de seguridad y rendimiento
**Versión candidata:** `v1.0.0-rc.2` (rama `feat/escaneo-ia-camara`: incluye `main` con el chatbot y la rama `feat/soporte-agente-ia` con el agente de soporte)
**Fecha de ejecución:** 27 y 28 de octubre de 2026

---

## 1. Resumen

| Nivel de prueba | Casos | Aprobados | Fallidos |
|---|---:|---:|---:|
| Unitarias backend (Jest) | 109 | 109 | 0 |
| Integración backend contra PostgreSQL real (Jest + Supertest) | 52 | 52 | 0 |
| Unitarias frontend (`node --test`) | 28 | 28 | 0 |
| Sistema de punta a punta en navegador (2 perfiles × 11 pasos) | 22 | 22 | 0 |
| **Total** | **211** | **211** | **0** |

- **Cobertura del backend** (unitarias + integración): 85,4 % de líneas, 80,9 % de funciones y 69,1 % de ramas. Antes de integrar el módulo de soporte era 90,8 %; la baja se explica en la sección 10.
- **Rendimiento de la API:** las consultas autenticadas atendieron entre 521 y 1.259 solicitudes por segundo, con p99 por debajo de 60 ms. No hubo errores en 110.956 solicitudes.
- **Lighthouse (producción):** rendimiento 92 en móvil y 100 en escritorio; accesibilidad 95; buenas prácticas 96.
- **Vulnerabilidades del backend:** bajaron de 4 (1 crítica, 2 altas, 1 moderada) a 1 alta.
- **Hallazgos:** se registraron 19; 5 quedaron corregidos en esta fase y 14 quedan documentados con su recomendación (sección 8).

**Dictamen:** la versión `v1.0.0-rc.2` es apta como candidata a entrega final **en la configuración de despliegue documentada** (`VITE_FINANCE_MODE=local`, con autenticación, administración, auditoría, agente de soporte y escaneo con IA sobre el backend). El hallazgo **H-06** impide usar el modo `VITE_FINANCE_MODE=api` como modo productivo hasta corregirlo.

---

## 2. Alcance y entorno

**Dentro del alcance:** autenticación y sesiones, perfil, grupos, gastos, balances, pagos, historial, reportes, notificaciones, administración por roles, auditoría (regla 5W), estado del sistema, escaneo de facturas con IA y cámara, chatbot, análisis y KPIs.

**Fuera del alcance:**
- La llamada real a OpenAI. Se probó con un extractor simulado y con pruebas unitarias del adaptador.
- Los microservicios desplegados por separado. Se verificó que compilan, pero no se probaron en ejecución.
- El despliegue en Vercel.

| Componente | Versión |
|---|---|
| Node.js | 22.22.0 |
| PostgreSQL | 16.15 |
| Navegador de pruebas | Chromium 141 (Playwright) |
| Jest / ts-jest | 29 |
| Supertest | 7 |
| Herramienta de carga | autocannon 7 |
| Lighthouse | 12 |

---

## 3. Estrategia

1. **Unitarias:** dominio, casos de uso, servicios, validadores, adaptadores de IA y utilidades del frontend (balances, OCR, KPIs, análisis y chatbot). No usan red ni base de datos.
2. **Integración:** la aplicación Express completa, sin abrir puertos, contra una base PostgreSQL **real y vacía**, recreada con las migraciones en cada ejecución. No se simula la base de datos, así que cada caso recorre ruta, middleware, validador, caso de uso, repositorio y SQL.
3. **Sistema (E2E):** navegador real contra el build de producción del frontend y el backend real, en dos perfiles: móvil (482×1044, táctil, cámara virtual) y escritorio (1366×900).
4. **Rendimiento:** pruebas de carga de 10 segundos por endpoint sobre el build compilado (`node dist/server.js`) en modo producción, con un escenario de 6 usuarios, 1 grupo y 60 gastos. Se complementan con una auditoría Lighthouse del frontend.
5. **Seguridad:** casos de seguridad automatizados dentro de la suite de integración, `npm audit` y una prueba de concurrencia sobre los refresh tokens.

---

## 4. Resultados de pruebas unitarias

### Backend — 109 casos en 16 suites

| Suite | Qué verifica |
|---|---|
| `RegistrarUsuarioUseCase` | Registro, correo duplicado, normalización |
| `IniciarSesionUseCase` | Credenciales, cuenta inactiva, rehash de bcrypt a Argon2id |
| `Argon2PasswordHasher` | Hash y verificación de contraseñas |
| `AdministracionService` | Reglas de moderador y supervisor |
| `GrupoGastoService` | División equitativa y personalizada |
| `distribucionGasto` | Reparto exacto al centavo |
| `grupoValidators` / `auditoriaValidators` | Validación de entradas |
| `motivoAuditoria` | Motivo (el "por qué" de la regla 5W) |
| `ClaudeFacturaExtractor` / `OpenAIFacturaExtractor` | Formato de la solicitud, esquema estricto, normalización de montos colombianos, manejo de errores del proveedor |
| `AsistenteService`, `OpenAIAsistente`, `SoporteService`, `herramientasSoporte`, `soporteValidators` *(módulo de soporte, 72 casos)* | Conversación con el agente, llamada a herramientas para abrir tickets, bandeja de casos, validaciones |

### Frontend — 28 casos

| Archivo | Casos | Qué verifica |
|---|---:|---|
| `balances.test.js` *(nuevo)* | 5 | El reparto no pierde ni inventa pesos; deudas pendientes; los saldos netos suman cero; compensación entre pares; liquidación con el mínimo de pagos |
| `ocr.test.js` *(nuevo)* | 4 | Toma el TOTAL (no el subtotal ni el efectivo); fechas dd/mm/aaaa e ISO; comercio y categoría; valores seguros cuando el texto es ilegible |
| `kpis.test.js` | 11 | KPIs, periodos, metas, modelos de análisis (indicadores, estimadores, proyección) y media móvil |
| `apiResponse.test.js` | 5 | Normalización de respuestas del API |
| `chatbot.test.js` | 3 | Respuestas del chatbot |

---

## 5. Resultados de pruebas de integración — 52 casos en 4 suites

Se ejecutan con `npm run test:integration`; las instrucciones están en `backend/tests/integration/README.md`.

**Autenticación (11 casos)**
- El registro guarda la contraseña con Argon2id, nunca en texto plano.
- Correo duplicado → 409. Validación de entrada → 400 con detalle por campo.
- El login entrega un JWT y un refresh token opaco de 128 caracteres hexadecimales.
- Una contraseña incorrecta y un correo inexistente reciben **la misma respuesta**, así que no se revela qué cuentas existen.
- `/me` responde 401 sin token, con un token alterado y con un esquema de autorización distinto.
- El refresh token rota: el token usado queda revocado. El logout también lo revoca.
- Al desactivar la cuenta se invalidan el access token y todos los refresh tokens.
- La auditoría registra las solicitudes autenticadas **sin** guardar contraseñas ni tokens.

**Grupos, gastos y balances (16 casos)**
- Quien crea el grupo queda como administrador. Agregar un integrante genera una notificación. Agregar al mismo dos veces → 409. Un miembro que no es administrador → 403.
- División equitativa de 100.000 entre 3: suma exacta. El balance muestra que el deudor debe 33.333,33 al pagador.
- Una división personalizada que no suma el total → 400. Participantes ajenos al grupo → 400.
- Al confirmar un pago, el balance se recalcula; un pago repetido → 409.
- El historial y el resumen reflejan los movimientos.
- **Control de acceso (IDOR):** un usuario ajeno recibe 403 en integrantes, gastos, balances, historial, registro de gastos y pagos, y el grupo no aparece en su lista.
- Al retirar a un integrante, este pierde el acceso. El grupo conserva siempre al menos un administrador (409).

**Seguridad (18 casos)**
- Cabeceras de helmet (nosniff, SAMEORIGIN, HSTS, CSP, sin `X-Powered-By`) y `X-Request-Id`.
- CORS solo para el origen configurado.
- Cuerpo mayor a 100 KB → 413. JSON mal formado → 400. *Ambos casos respondían 500 antes de esta fase.*
- La inyección SQL en el login y en el perfil se trata como dato: la tabla de usuarios queda intacta.
- Identificadores de ruta no numéricos → 400. Las respuestas 404 no muestran detalles internos.
- **Fuerza bruta:** después de N fallos, el correo queda bloqueado (429 con `Retry-After`) aunque la contraseña sea correcta; otras cuentas no se ven afectadas, y un login exitoso reinicia el contador.
- Los tokens `alg: none`, los expirados y el token del modo demostración del frontend se rechazan.
- **El rol se lee de la base de datos y no del token:** al degradar a un usuario, pierde el acceso en la siguiente solicitud.
- Matriz de roles verificada en `/api/administracion`, `/api/auditoria` y `/api/estado`. Solo el supervisor cambia roles y nadie puede cambiar el suyo. El moderador solo gestiona cuentas comunes.
- El estado del sistema confirma la conexión con PostgreSQL.

**Escaneo con IA (7 casos)**
- Sin clave de IA configurada → 503, y el frontend usa el OCR local.
- Sin sesión → 401.
- Se procesan tanto imágenes como PDF.
- Un formato no permitido o un archivo cuyo contenido no coincide con su tipo (por ejemplo, un ejecutable enviado como PNG) → 415.
- Archivo demasiado grande → 413.
- Falla del proveedor → 502, sin filtrar detalles.
- Límite por usuario y por hora → 429, sin afectar a los demás usuarios.

### Cobertura de código

| Módulo backend | Líneas |
|---|---:|
| Validadores HTTP | 100 % |
| Repositorios PostgreSQL | 81–100 % (grupos 97,8 %, usuarios 96,2 %) |
| Adaptadores de IA | 96,3 % |
| Seguridad (JWT, Argon2) | 96,6 % |
| Servicios de aplicación | 93,3 % |
| Rutas | 94,4 % |
| Casos de uso | 90,5 % |
| Middlewares | 89,6 % |
| Controladores | 81,4 % |
| **Total backend** | **90,8 %** (ramas 68,8 %) |

*Medición hecha antes de integrar el módulo de soporte; con él incluido, el total es 85,4 % (sección 10).*

En el frontend, los módulos de lógica cubiertos por pruebas unitarias alcanzan **91,2 %** de líneas. Los componentes visuales se cubren con las pruebas de sistema (sección 6).

---

## 6. Resultados de pruebas de sistema (E2E)

Se usó el build de producción del frontend contra el backend real y PostgreSQL, en dos perfiles.

| # | Paso | Móvil | Escritorio |
|---:|---|:---:|:---:|
| 1 | Registro de una cuenta nueva | ✅ | ✅ |
| 2 | Login con contraseña incorrecta: muestra el error y no entra | ✅ | ✅ |
| 3 | Login correcto lleva al panel | ✅ | ✅ |
| 4 | Crear un grupo con un integrante | ✅ | ✅ |
| 5 | Registrar un gasto con división equitativa | ✅ | ✅ |
| 6 | El gasto aparece en el historial | ✅ | ✅ |
| 7 | Las pantallas de análisis y KPIs cargan | ✅ | ✅ |
| 8 | Escaneo con la cámara: sin IA configurada usa el respaldo | ✅ | ✅ |
| 9 | El chatbot responde preguntas frecuentes | ✅ | ✅ |
| 10 | Un usuario común no accede a Auditoría (lo redirige) | ✅ | ✅ |
| 11 | Cerrar sesión y no poder volver al panel | ✅ | ✅ |

**Observación:** la validación del formulario de grupo, que exige al menos un integrante, funcionó como estaba diseñada.

**Escaneo con IA usando GPT-4o mini:** con un backend simulado, la foto tomada con la cámara viaja como JPEG autenticado y el formulario se llena solo: descripción, monto 87.450, fecha y categoría Alimentación, además de NIT, factura, subtotal, impuestos y productos.

---

## 7. Resultados de rendimiento y seguridad

### Carga sobre la API

Build compilado en modo producción, pool de 10 conexiones a PostgreSQL y 10 s por endpoint.

| Endpoint | Conexiones | Solicitudes/s | p50 | p97,5 | p99 | Máx. | Errores |
|---|---:|---:|---:|---:|---:|---:|---:|
| `GET /health` | 20 | 6.869 | 2 ms | 5 ms | 6 ms | 15 ms | 0 |
| `GET /api/grupos` | 20 | 1.259 | 15 ms | 25 ms | 29 ms | 55 ms | 0 |
| `GET /api/grupos/:id/gastos` (60 gastos) | 20 | 521 | 37 ms | 53 ms | 57 ms | 93 ms | 0 |
| `GET /api/grupos/:id/balances` | 20 | 1.230 | 15 ms | 25 ms | 28 ms | 64 ms | 0 |
| `GET /api/reportes/resumen` | 20 | 1.127 | 17 ms | 25 ms | 29 ms | 59 ms | 0 |
| `POST /api/auth/login` (Argon2id) | 5 | 90 | 55 ms | 85 ms | 96 ms | 119 ms | 0 |

**Lectura de los resultados:**
- El login es intencionalmente costoso por Argon2id, y eso es lo que encarece los ataques de fuerza bruta. 90 logins por segundo superan con holgura la demanda esperada del proyecto.
- El listado de gastos es el endpoint más pesado, porque agrega las participaciones con `json_agg`. Aun así, se mantiene por debajo de 60 ms en p99.
- Cada solicitud autenticada escribe una fila de auditoría de unos 470 bytes: 42.510 filas ocuparon 19 MB (ver H-12).

### Lighthouse (frontend en producción, página de inicio de sesión)

| Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO | FCP | LCP | TBT | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Móvil | 92 | 95 | 96 | 91 | 2,2 s | 3,0 s | 30 ms | 0 |
| Escritorio | 100 | 95 | 96 | 91 | 0,5 s | 0,5 s | 0 ms | 0 |

El peso total transferido es de 172 KiB. El bundle principal ocupa 489 KB sin comprimir y 152 KB con gzip. Tesseract ya se carga solo cuando se usa.

### Dependencias (`npm audit`)

| Proyecto | Antes | Después | Acción |
|---|---|---|---|
| Backend | 4 (1 crítica `handlebars`, 2 altas `body-parser` y `zod`, 1 moderada `qs`) | 1 alta (`zod`) | `npm audit fix`, que solo cambió el `package-lock.json` |
| Frontend | 4 (1 alta `vite`, 3 moderadas `esbuild` y `react-router`) | Sin cambios | Requieren versiones mayores (ver H-09) |

**Análisis del riesgo pendiente:**
- `zod`: la vulnerabilidad consume memoria al validar colecciones enormes. Está **mitigada** porque Express limita el cuerpo a 100 KB y los arreglos validados tienen un máximo de 100 elementos.
- `vite` / `esbuild`: solo afectan al **servidor de desarrollo**, no al build que se publica.
- `react-router` (redirección abierta con `\`): la app solo navega a rutas internas fijas, y el único destino dinámico, `location.state.from`, lo genera la propia app.

### Prueba de concurrencia sobre refresh tokens

Se enviaron 5 renovaciones simultáneas con el mismo refresh token, en 20 ocasiones. En **19 de las 20, más de una renovación tuvo éxito**, lo que crea varias sesiones a partir de un mismo token (ver H-11).

---

## 8. Hallazgos

Severidad: **Crítica · Alta · Media · Baja**. Estado: **Corregido** en esta fase · **Pendiente** con recomendación · **Aceptado** (riesgo asumido y justificado).

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| H-01 | Alta | Los microservicios `expenses`, `notifications` y `reports` no compilaban (rutas de importación erróneas y `env.corsOrigin` inexistente): `npm run build` fallaba con 9 errores de TypeScript | **Corregido** |
| H-02 | Media | Un JSON mal formado y un cuerpo mayor a 100 KB respondían **500** y se registraban como errores del servidor | **Corregido** (400 / 413) |
| H-03 | Alta | Sin límite de intentos en `/api/auth/login`: fuerza bruta ilimitada | **Corregido** (bloqueo por correo con 429) |
| H-04 | Media | El login abortaba a los 2,5 s; un arranque en frío del servidor llevaba a un usuario real al modo demostración sin conexión | **Corregido** (15 s para el login) |
| H-05 | Crítica | Dependencias vulnerables en el backend (`handlebars`, `body-parser`, `qs`) | **Corregido** (3 de 4) |
| H-06 | Alta | **Contrato frontend↔backend incompleto** en `VITE_FINANCE_MODE=api`: 9 de 11 operaciones financieras llaman rutas inexistentes (404) y el frontend guarda esos datos en el navegador **sin avisar** | Pendiente |
| H-07 | Media | En pantallas de 390 px la cabecera desborda (la página mide 482 px de ancho); el navegador móvil reduce el zoom y los modales quedan parcialmente fuera de pantalla | Pendiente |
| H-08 | Baja | El OCR (Tesseract) descarga su código desde un CDN externo (jsdelivr) al usarse; sin internet o con el CDN bloqueado, el respaldo OCR falla y se pasa a captura manual | Pendiente |
| H-09 | Media | Vulnerabilidades del frontend que exigen versiones mayores (Vite 8, React Router 7) | Pendiente |
| H-10 | Media | Los refresh tokens se guardan en texto plano en la base de datos; una filtración de la base permitiría secuestrar sesiones | Pendiente |
| H-11 | Media | La rotación del refresh token no es atómica: renovaciones simultáneas con el mismo token generan varias sesiones (19 de 20 en la prueba) | Pendiente |
| H-12 | Baja | La tabla de auditoría crece una fila por solicitud autenticada (~470 B) y no tiene política de retención | Pendiente |
| H-13 | Baja | Los límites de intentos y de escaneos con IA viven en memoria: en Vercel cada instancia lleva su propio conteo | Aceptado |
| H-14 | Baja | El bundle principal no está dividido por rutas (489 KB) | Pendiente |
| H-15 | Baja | Accesibilidad: contraste insuficiente en algunos textos y etiquetas visibles que no coinciden con el nombre accesible | Pendiente |
| H-16 | Baja | Índices duplicados (`idx_refresh_token_token` e `idx_usuario_email` repiten índices `UNIQUE`) | Pendiente |
| H-17 | Baja | Los Dockerfiles usan Node 20 cuando `engines` exige ≥22, y ejecutan `ts-node-dev` (modo desarrollo) | Pendiente |
| H-18 | Media | El modo demostración sin conexión concede el rol supervisor en la interfaz con cualquier correo. El backend no acepta su token (verificado en una prueba), así que no expone datos reales | Aceptado (función de demo intencional) |
| H-19 | Media | El módulo de soporte no tiene pruebas de integración: `PostgresSoporteRepository` queda con 6,9 % de cobertura y `SoporteController` con 26,5 % | Pendiente |

### Recomendaciones para los pendientes

- **H-06:** alinear `financeApi.js` (modo remoto) con las rutas reales del backend (`/grupos/:id/gastos`, `/grupos/:id/integrantes` con `usuarioId`, `/grupos/gastos/:id/pagos`, `/reportes/resumen`, `/grupos/:id/historial`) y mapear los nombres de los campos. Hasta entonces, desplegar con `VITE_FINANCE_MODE=local`.
- **H-07:** limitar el ancho de la cabecera en móvil (`min-width: 0` y truncar el indicador de estado).
- **H-08:** servir el *worker* y los datos de idioma de Tesseract desde el propio sitio (`workerPath`, `langPath`).
- **H-09:** planificar la actualización a React Router 7 y Vite 6 o superior, con pruebas de regresión.
- **H-10 / H-11:** guardar el SHA-256 del refresh token y revocar con `UPDATE … WHERE revocado = false RETURNING`; ante un token ya revocado, revocar todas las sesiones del usuario.
- **H-12:** definir una retención (por ejemplo, 180 días) y un trabajo periódico de depuración.
- **H-13:** si se necesitan límites globales, usar un almacén compartido (Redis o una tabla en PostgreSQL).
- **H-19:** agregar una suite `soporte.integration.ts` (abrir ticket, bandeja del moderador, permisos por rol) siguiendo el patrón de las demás.
- **H-14:** cargar las rutas pesadas (análisis, mapa con Leaflet) con `React.lazy`.

---

## 9. Ajustes realizados en esta fase

| Archivo | Cambio |
|---|---|
| `backend/src/microservices/{expenses,notifications,reports}App.ts` | Rutas de importación y `env.corsOrigins` (H-01) |
| `backend/src/infrastructure/adapters/in/http/middlewares/errorHandler.ts` | Respuestas 400 y 413 para errores del parser (H-02) |
| `backend/src/infrastructure/adapters/in/http/middlewares/limiteIntentosLogin.ts` *(nuevo)* | Límite de intentos fallidos por correo (H-03) |
| `backend/src/infrastructure/adapters/in/http/routes/authRoutes.ts` | Aplica el límite al login |
| `frontend/src/services/http.js`, `frontend/src/services/authApi.js` | Tiempo de espera configurable; 15 s para el login (H-04) |
| `backend/package-lock.json` | `npm audit fix` (H-05) |
| `backend/package.json` | Scripts `test:integration` y `test:all` |
| `backend/jest.integration.config.js`, `backend/tests/integration/*` *(nuevos)* | Suite de integración |
| `frontend/tests/balances.test.js`, `frontend/tests/ocr.test.js`, `frontend/tests/helpers/*` *(nuevos)* | Pruebas unitarias del frontend |

**Variables de entorno nuevas** (opcionales, con valores por defecto): `LOGIN_MAX_INTENTOS` (10) y `LOGIN_VENTANA_MINUTOS` (15).

---

## 10. Integración del módulo de soporte con IA

El 28 de octubre se unió la rama `feat/soporte-agente-ia` (agente de atención con tickets y bandeja para moderadores) a la versión candidata. Los conflictos (`app.ts`, `errorHandler.ts`, `http.js`, `.env.example`) se resolvieron conservando los cambios de ambas ramas.

**Una sola clave de IA para todo el sistema.** El escaneo de facturas con la cámara usa ahora la misma `IA_API_KEY` y la misma `IA_BASE_URL` que el agente de soporte. Tiene su propio modelo (`IA_MODELO_FACTURAS`, por defecto `gpt-4o-mini`) porque necesita visión, mientras que `IA_MODELO` sigue siendo el del agente de soporte. Se verificó con un proveedor simulado que la solicitud lleva esa clave, va a esa URL y usa `gpt-4o-mini`.

| Verificación tras la integración | Resultado |
|---|---|
| Unitarias backend | 109 de 109 (37 previas + 72 del módulo de soporte) |
| Integración backend (con la migración 007 del módulo de soporte) | 52 de 52 |
| Unitarias frontend | 28 de 28 |
| Compilación de backend y frontend | Correcta |
| Cobertura del backend | 85,4 % de líneas (antes 90,8 %) |

La cobertura baja porque el módulo de soporte solo tiene pruebas unitarias: su repositorio PostgreSQL y su controlador no se ejecutan en ninguna prueba de integración (ver H-19).

## 11. Cómo reproducir

```bash
# Backend
cd backend
npm ci
npm test                    # 109 unitarias
docker compose up -d        # PostgreSQL 16
npm run test:integration    # 52 de integración (crea y vacía ft_group_test)
npm run build               # compila, incluidos los microservicios

# Frontend
cd frontend
npm ci
npm test                    # 28 unitarias
npm run build
```
