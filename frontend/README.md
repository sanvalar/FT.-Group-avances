# FT. GROUP — Frontend

Frontend web (React + Vite) de FT. GROUP, basado en los prototipos de las versiones portátil y tablet. Tiene tema oscuro con acentos naranja y se adapta a portátil, tablet y celular.

## Pantallas

| Ruta | Módulo | Datos |
|---|---|---|
| `/login`, `/registro` | Autenticación | **Backend real** (`/api/auth`) |
| `/panel` | Panel de control: balance neto, te deben / debes, liquidaciones sugeridas, mis grupos, mapa | **Backend real**, excepto la cuenta de exposición |
| `/grupos` | Grupos financieros: tarjetas con miembros, total y mi balance; crear grupo; agregar integrantes | **Backend real**, excepto la cuenta de exposición |
| `/gastos` | Registro de gastos: filtro por grupo, tabla (tarjetas en celular), agregar gasto con división igual o personalizada, detalle y registro de pagos | **Backend real**, excepto la cuenta de exposición |
| `/analisis` | Análisis y predicciones: KPIs básicos con semáforo, indicadores, estimadores, proyección y gastos atípicos | Se calcula en el navegador con los datos de gastos y grupos |
| `/historial` | Historial por mes con filtros de grupo y categoría, total filtrado y movimientos recientes | **Backend real**, excepto la cuenta de exposición |
| `/escanear` | Escaneo de recibos: carga/arrastre o cámara del celular, OCR con Tesseract.js y formulario prellenado | Usa los grupos de demostración de la cuenta de exposición |
| `/perfil` | Ver/editar nombre y teléfono, desactivar cuenta, cerrar sesión | **Backend real** |
| `/administracion` | Gestión de cuentas: consulta de usuarios y acciones permitidas por rol | **Backend real** |
| `/auditoria` | Bitácora paginada y filtrable de actividad | **Solo supervisor** |
| `/supervision` | Consulta de solo lectura de grupos y actividad financiera por cuenta | **Solo supervisor** |
| `/moderacion` | Resumen y accesos de moderación de cuentas, soporte y academia | **Solo moderador** |

La ruta de administración solo está disponible para `moderador` y `supervisor`. El moderador puede cambiar estado a cuentas con rol `usuario`; el supervisor puede cambiar estados y asignar roles. El backend vuelve a comprobar el rol y el estado actual de la cuenta en cada petición protegida.

El menú del supervisor es independiente del menú financiero común e incluye Supervisión de usuarios, Administración, Auditoría, Estado del sistema y Control educativo. Las rutas financieras de usuario están bloqueadas para ese rol. La vista de supervisión permite revisar grupos y gastos asociados a una cuenta, con paginación y sin acciones de escritura; el backend restringe esta consulta al supervisor.

El menú del moderador incluye Panel de moderación, Administración, Soporte y Moderación educativa. No muestra ni permite abrir los módulos financieros de usuario común. En educación solo consulta indicadores agregados; la publicación de lecciones sigue reservada al supervisor. En soporte, la bandeja de casos se abre por defecto. El backend también rechaza el acceso de moderadores y supervisores a los endpoints financieros comunes.

La auditoría está disponible únicamente para supervisores. Registra solicitudes autenticadas del backend y las acciones de escritura de la demostración local. No almacena contraseñas, tokens ni datos de formularios.

En las cuentas normales, los módulos financieros usan el backend y PostgreSQL. La cuenta común de exposición usa datos de ejemplo guardados en el navegador; las operaciones que realices con ella no modifican PostgreSQL. Para crear un grupo en el modo backend, los integrantes deben tener una cuenta registrada y se agregan por su correo.

La cuenta `usuario@ftgroup.test` usa automáticamente datos financieros de demostración guardados solo en el navegador, incluso si `VITE_FINANCE_MODE=api`. Así puede recorrer con ejemplos el panel, grupos, gastos, historial, análisis y escaneo, sin modificar datos del backend. En «Mi perfil» se pueden restaurar los datos de ejemplo. Las demás cuentas siguen usando el modo configurado. Si quieres poner toda la app en modo demostración, usa `VITE_FINANCE_MODE=local`.

## Diseño adaptable

- **Portátil (≥ 1024 px):** menú lateral fijo y expandido, como en el prototipo de portátil.
- **Tablet (721–1023 px):** menú lateral que se abre con el botón ☰, como en el prototipo de tablet.
- **Celular (≤ 720 px):** barra de navegación inferior, tabla de gastos en forma de tarjetas, filtros con desplazamiento horizontal y ventanas que suben desde abajo.

## Cómo ejecutar

Los pasos completos (base de datos, backend y frontend) están en el [README principal](../README.md). Solo el frontend, desde esta carpeta:

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:5173
npm test               # pruebas de KPIs y modelos de análisis
```

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000/api` | URL de la API |
| `VITE_FINANCE_MODE` | `api` | `api` guarda todo en PostgreSQL. `local` es una demostración sin backend |

## Endpoints que usa

La lista completa de endpoints y las tablas que modifica cada acción están en el [README del backend](../backend/README.md).

## Estructura

```
src/
├── App.jsx                 rutas y sesión
├── services/
│   ├── http.js             cliente fetch + renovación automática del token (401 -> /auth/refresh)
│   ├── authApi.js          módulo de usuarios (backend real)
│   ├── adminApi.js         consulta y gestión administrativa de usuarios
│   ├── auditoriaApi.js     consulta de la bitácora y sincronización de acciones locales
│   ├── financeApi.js       grupos, gastos, balances, historial (API o modo local)
│   └── ocr.js              preprocesamiento, OCR y extracción de campos del recibo
├── utils/balances.js       motor de cálculo: división igual, saldos netos, balance por pares
├── utils/kpis.js           KPIs básicos con metas y semáforo
├── utils/analitica.js      indicadores, estimadores y proyección
├── components/             Layout, ExpenseForm, MapView, Icon, ui (Modal, Avatar, Chips…)
└── pages/                  Auth, Dashboard, Groups, Expenses, History, Analisis, Scan, Profile
```

## Cambios respecto al frontend inicial

- Se corrigió la lectura del estado de la cuenta: el backend devuelve `estado` (`activo`/`inactivo`), no `activo`.
- `/auth/refresh` no devuelve el usuario. Ahora, después de renovar el token, se consulta `/auth/me`.
- Si una petición recibe 401, el token se renueva automáticamente una vez.
- Los tokens siguen en `sessionStorage` porque el backend espera el refresh token en el cuerpo de la petición. Para usar una cookie `HttpOnly`, hay que cambiar el backend.

## Nota sobre el escaneo

El OCR se ejecuta en el navegador con Tesseract.js (idioma español). La primera vez descarga el modelo, unos pocos MB, así que necesita internet. La lectura es aproximada, por eso el usuario siempre revisa y confirma los datos antes de guardar. Los PDF se adjuntan, pero sus datos se ingresan a mano.

## Análisis y predicciones (`/analisis`)

Todo se calcula en el navegador a partir de los gastos y grupos que ya entrega `financeApi`. No hace falta ningún servicio adicional y funciona tanto en modo `api` como en modo `local`. La antigua ruta `/indicadores` redirige aquí.

**KPIs básicos** (`src/utils/kpis.js`). Cada KPI tiene una meta y un semáforo: en meta, atención, fuera de meta o informativo. El mes en curso se compara con el mes anterior hasta el mismo día.

| KPI | Fórmula | Meta |
|---|---|---|
| Gasto del mes | Σ monto_total del mes hasta hoy | No superar el mes anterior al mismo día (atención hasta +15 %) |
| Gastos registrados | Cantidad de gastos del mes | Informativo |
| Ticket promedio | Gasto del mes ÷ gastos registrados | Informativo |
| Gasto por integrante | Gasto del mes ÷ integrantes únicos | Informativo |
| Tasa de recaudo | (adeudado − pendiente) ÷ adeudado | ≥ 80 % (atención desde 60 %) |
| Cartera pendiente | Σ partes pendientes, sin contar al pagador | ≤ 20 % de las partes sin pagar |
| Antigüedad de la cartera | Días promedio de las partes pendientes | ≤ 15 días (atención hasta 30) |
| Mi aporte del mes | Lo que pagaste ÷ gasto del mes | Informativo |

Los umbrales están en `METAS`, dentro de `kpis.js`.

**Indicadores y estimadores** (`src/utils/analitica.js`):
- **Indicadores:** gasto mensual promedio, ticket promedio y mediano, cumplimiento de pago, días para saldar, frecuencia, concentración de aportes (Herfindahl), % de gastos con OCR y distribución por categoría.
- **Estimadores:** run rate, media móvil basada en los últimos 7 días (extrapolada al mes), regresión lineal (R²) y suavizado exponencial, combinados en un consenso.
- **Predicciones:** proyección de 3 o 6 meses con índice estacional y detección de gastos atípicos (puntaje z).

**Datos históricos de prueba (modo local).** Inicia sesión, abre la consola del navegador, pega `scripts/seed-historico.js` y recarga la página. Así se cargan 12 meses de gastos.

**Pruebas:** `npm test` ejecuta las pruebas de KPIs y modelos con el runner nativo de Node (`tests/`).
