# Microservicios FT. GROUP

Arquitectura distribuida y desacoplada del sistema FT. GROUP basada en **API Gateway**, **Microservicios independientes en Node.js/TypeScript** y **PostgreSQL**.

---

## 🏗️ Mapa de Microservicios y Puertos

| Servicio | Puerto Interno | Puerto Host | Responsabilidades |
| :--- | :--- | :--- | :--- |
| **API Gateway** | `8080` | `8080` / `3000` | Punto de entrada único para el Frontend. Enrutamiento dinámico, proxy inverso, validación central de cabeceras y agregación de salud (`/health`). |
| **Auth & Users Service** | `3001` | `3001` | Registro de usuarios, login, JWT refresh/logout, perfil de usuario, roles (`usuario`, `moderador`, `supervisor`) y panel de administración (`/api/administracion`). |
| **Groups & Expenses Service** | `3002` | `3002` | Creación y administración de grupos, integrantes, registro y distribución de gastos compartidos, pagos y balances. |
| **Reports & Analytics Service** | `3003` | `3003` | Resúmenes financieros consolidados (`/api/reportes/resumen`), KPIs y cálculos analíticos de gastos. |
| **Notifications Service** | `3004` | `3004` | Gestión de alertas, listado de notificaciones del usuario y marcado de lectura (`/api/notificaciones`). |
| **PostgreSQL Database** | `5432` | `5432` | Base de datos relacional con esquemas y tablas normalizadas (`usuario`, `grupo`, `gasto`, etc.). |

---

## 🚀 Despliegue con Docker Compose

Para levantar todo el ecosistema de microservicios con un solo comando:

```bash
docker compose -f docker-compose.microservices.yml up --build -d
```

### Comprobación de salud:
```bash
curl http://localhost:8080/health
```

Respuesta esperada:
```json
{
  "estado": "ok",
  "gateway": "ft-group-api-gateway",
  "servicios": {
    "auth": "ok",
    "grupos_gastos": "ok",
    "reportes": "ok",
    "notificaciones": "ok"
  }
}
```

---

## 💻 Desarrollo Local sin Docker

Cada microservicio puede ejecutarse de forma independiente desde su respectivo directorio:

```bash
# Gateway
cd microservices/api-gateway && npm run dev

# Servicio de Autenticación
cd microservices/auth-service && npm run dev

# Servicio de Grupos y Gastos
cd microservices/expenses-service && npm run dev

# Servicio de Reportes
cd microservices/reports-service && npm run dev

# Servicio de Notificaciones
cd microservices/notifications-service && npm run dev
```
