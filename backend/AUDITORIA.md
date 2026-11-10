# Manual de administración y técnico del sistema auditor

## Alcance y estado de implementación

El sistema auditor está integrado en el backend Express y la interfaz React. La captura HTTP, el almacenamiento y la consulta se implementan como capas separadas:

1. **Captura:** `auditarActividad` registra solicitudes autenticadas al terminar la respuesta. Los controladores de autenticación registran registros e inicios de sesión aceptados o rechazados. La demostración financiera local envía eventos declarados desde el frontend.
2. **Persistencia:** PostgreSQL guarda los eventos en `auditoria_evento`. La migración `006_auditoria_regla_5w.sql` agrega el motivo de cada evento y completa los registros anteriores.
3. **Visualización:** la página **Auditoría**, disponible solo para el rol `supervisor`, consulta eventos paginados mediante la API protegida.

La regla 5W se presenta en cada evento como:

| Pregunta | Campo |
|---|---|
| Quién | Correo del actor y rol registrado |
| Qué | Acción ejecutada y método HTTP |
| Cuándo | Fecha y hora del evento |
| Dónde | Ruta de la API o ruta de la demostración local |
| Por qué | Motivo generado en el servidor según la operación y el recurso |

En intentos de inicio de sesión rechazados se registra el correo intentado, `actor_id` nulo y el rol `usuario` como categoría no verificada. No se registra la contraseña ni se revela si la cuenta existe en la respuesta de autenticación.

## Manual de administrador

### Consultar la bitácora

1. Inicia sesión con una cuenta con rol **supervisor**.
2. Abre **Auditoría** en el menú lateral.
3. Usa búsqueda, rol, método y fechas para acotar resultados; los eventos se muestran del más reciente al más antiguo.
4. Usa **Actualizar** para recargar la página actual o la paginación para revisar otros resultados.
5. Revisa los cinco datos de trazabilidad, el código HTTP y la ruta. Los registros de `LOCAL` corresponden a acciones declaradas por el navegador de demostración.

La bitácora es de solo lectura desde la aplicación. Los moderadores y usuarios comunes no pueden abrir la consola ni consultar el endpoint. No se debe compartir ni exportar información de auditoría fuera de los canales autorizados.

### Comprobar disponibilidad

La opción **Estado del sistema** también es exclusiva del supervisor. Muestra disponibilidad de API y PostgreSQL, latencia de la consulta, tiempo activo y hora de comprobación. Un estado degradado de base de datos requiere revisión del servicio y de la conexión PostgreSQL; la página no muestra credenciales ni detalles internos.

### Logs operativos

Los logs HTTP estructurados se escriben en `stdout` como JSON. En desarrollo se consultan en la terminal del backend; en Vercel, en **Logs** del proyecto backend. Para buscar una solicitud, usa su `requestId` (`X-Request-Id`) junto con fecha, ruta, método y código HTTP.

## Manual técnico

### Despliegue local

Desde PowerShell, en `backend`:

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d
npm run migrate:dev
npm run dev
```

La migración `006_auditoria_regla_5w.sql` se ejecuta junto a las demás. Para despliegue compilado:

```powershell
npm run build
npm run migrate
npm start
```

En despliegues serverless, configura las variables del backend y la conexión a PostgreSQL en el proveedor; ejecuta las migraciones antes de publicar la versión que requiere el campo `motivo`.

### API

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/auditoria` | Token de supervisor | Consulta filtros y paginación; máximo 100 eventos por página |
| `POST /api/auditoria/eventos` | Token válido | Registra una acción permitida de la demostración local |
| `GET /api/estado` | Token de supervisor | Informa disponibilidad de API y base de datos |
| `GET /health` | Público | Verifica que el proceso HTTP está activo |

La consulta de auditoría acepta `desde`, `hasta`, `rol`, `metodo`, `buscar`, `limite` y `offset`. Las fechas y los límites se validan en servidor. Las acciones locales se validan con una lista permitida; el actor siempre se obtiene del token y no del cuerpo enviado por el navegador.

### Persistencia y privacidad

- La tabla de auditoría conserva actor, acción, motivo, método, ruta, código HTTP, identificador de solicitud y fecha.
- Los eventos no guardan cuerpos, query strings, headers de autorización, contraseñas ni tokens.
- Las rutas operativas se registran sin parámetros sensibles ni query strings.
- La aplicación no ofrece operaciones de modificación o eliminación de eventos.
- Los eventos previos a la migración 006 se conservan con el motivo explícito “no disponible” en lugar de inventar una causa.
- La base de datos debe respaldarse y protegerse con controles de acceso y credenciales independientes; no se deben usar credenciales de producción en desarrollo.

### Controles de seguridad existentes

- `helmet` para cabeceras HTTP y CORS con lista de orígenes configurada.
- Límite de 100 KB para JSON entrante y validación de datos con Zod.
- Autorización por rol en backend, además de ocultar la navegación en frontend.
- Contraseñas con Argon2id, sesiones JWT y tokens de renovación revocables.
- Captura de actividad sin datos de formularios; errores internos no exponen detalles al cliente.
- Logs de fallo de persistencia de auditoría emitidos como eventos JSON de error.

Para producción, usa `NODE_ENV=production`, un `JWT_SECRET` aleatorio y largo, un origen CORS HTTPS explícito, TLS a PostgreSQL y un usuario de base de datos de privilegio mínimo. Mantén las variables secretas solo en el gestor de secretos del entorno.

### Diagnóstico

| Síntoma | Comprobación |
|---|---|
| La auditoría devuelve 401/403 | Inicia sesión de nuevo y confirma que el rol actual de la cuenta es supervisor |
| No aparecen eventos | Comprueba que la migración 006 se aplicó, revisa la conexión PostgreSQL y los logs `activity_audit_write_failed` o `authentication_audit_write_failed` |
| Estado del sistema indica base de datos no disponible | Verifica la salud de PostgreSQL y las variables `DB_*` o `DATABASE_URL` en el backend |
| El navegador no conecta con la API | Comprueba `VITE_API_URL`, `CORS_ORIGIN` y el log JSON usando el `requestId` de la respuesta |

