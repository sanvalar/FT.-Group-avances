# Módulo de soporte al cliente con agente de IA

**FT. GROUP** — Backend (arquitectura hexagonal)
Autor: Jheinson Jhamid Gutiérrez Marín · Versión 1.0 · Octubre de 2026

---

## 1. Qué es

Un agente conversacional que atiende a los usuarios desde el chat de ayuda de
la aplicación. Hace dos cosas:

1. **Resuelve dudas** sobre el uso del sistema, leyendo el manual de usuario.
2. **Abre un ticket de soporte** cuando no puede resolverlas, y permite
   consultar el estado de los casos ya abiertos.

Sustituye el comportamiento del chatbot de preguntas frecuentes sin
eliminarlo: si el agente no está configurado o falla, el chat sigue
respondiendo con las respuestas locales de siempre.

### Diferencia con el chatbot anterior

| | Chatbot de preguntas frecuentes | Agente de soporte |
|---|---|---|
| Dónde corre | Navegador (`utils/chatbot.js`) | Backend (`/api/asistente`) |
| Cómo responde | Coincidencia de palabras clave, 12 temas | Modelo de lenguaje con el manual completo |
| Qué puede hacer | Explicar | Explicar **y** registrar casos en PostgreSQL |
| Si no sabe | «Todavía no tengo una respuesta» | Abre un ticket y da su número |
| Coste | Ninguno | Por token consumido |

---

## 2. Arquitectura

```
Navegador                     Backend                        PostgreSQL
─────────                     ───────                        ──────────
HelpAssistant.jsx
      │ POST /api/asistente/mensajes  (Bearer <access token>)
      ▼
               autenticar (authMiddleware)
                      │  req.usuario = { id, email, rol }
                      ▼
               AsistenteController
                      ▼
               AsistenteService ──── bucle de razonamiento
                      │  ├─► AsistenteIA (puerto) ──► OpenAIAsistente ──► modelo
                      │  └─► herramientasSoporte ──► SoporteService ──► ticket_soporte
                      ▼                                                 ticket_mensaje
               SoporteRepository (puerto) ──► PostgresSoporteRepository  conversacion_asistente
                                                                         mensaje_asistente
```

El modelo nunca toca la base de datos. Pide ejecutar una herramienta, y es el
backend quien decide si esa operación es legítima y con qué datos.

### Archivos

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Dominio | `domain/ports/out/SoporteRepository.ts` | Qué necesita persistirse |
| Dominio | `domain/ports/out/AsistenteIA.ts` | Contrato del modelo, sin proveedor |
| Dominio | `domain/errors/DomainErrors.ts` | `TicketNoEncontradoError`, `AsistenteNoDisponibleError` |
| Aplicación | `application/services/SoporteService.ts` | Reglas de los tickets y permisos |
| Aplicación | `application/services/herramientasSoporte.ts` | Las 4 herramientas y su ejecutor |
| Aplicación | `application/services/AsistenteService.ts` | Bucle del agente y memoria |
| Infraestructura | `adapters/out/ia/OpenAIAsistente.ts` | Llamada HTTP al modelo |
| Infraestructura | `adapters/out/ia/promptSoporte.ts` | Prompt de sistema |
| Infraestructura | `adapters/out/ia/baseConocimiento.ts` | Carga del manual |
| Infraestructura | `adapters/out/persistence/postgres/PostgresSoporteRepository.ts` | SQL |
| Infraestructura | `adapters/in/http/controllers/AsistenteController.ts` | Entrada del chat |
| Infraestructura | `adapters/in/http/controllers/SoporteController.ts` | Entrada de los tickets |
| Infraestructura | `adapters/in/http/routes/asistenteRoutes.ts` | `/api/asistente` |
| Infraestructura | `adapters/in/http/routes/soporteRoutes.ts` | `/api/soporte` |
| Base de datos | `db/migrations/007_soporte_asistente.sql` | 5 tablas nuevas |
| Conocimiento | `knowledge/MANUAL_USUARIO.md` | Base de conocimiento |

Cambios en archivos existentes, todos aditivos: dos rutas en `app.ts`, el
cableado en `container.ts`, las variables de IA en `env.ts`, dos errores en
`DomainErrors.ts` con su traducción HTTP en `errorHandler.ts`, y dos entradas
en el diccionario de `motivoAuditoria.ts`.

---

## 3. Base de conocimiento: por qué no hay RAG

El manual de usuario son unas 2.800 palabras (≈ 5.000 tokens). La ventana de
contexto de `gpt-4o-mini` es de 128.000 tokens, así que el documento **entra
completo en el prompt de sistema** en cada llamada.

Esto se decidió a propósito, en lugar de usar embeddings con pgvector:

- **Más fiable.** El modelo ve siempre todo el manual. Con búsqueda
  semántica, una consulta mal formulada puede no recuperar la sección
  pertinente y el modelo responde a ciegas.
- **Más simple.** No hay que trocear el documento, generar vectores,
  mantener una segunda base de datos ni reindexar cuando el manual cambia.
- **Más barato en conjunto.** Se ahorra una llamada de embedding por
  mensaje, y el prompt cacheable compensa buena parte del coste extra.

RAG se justificaría con un corpus grande (cientos de páginas, documentos que
cambian a diario). Con un manual de 17 KB, inyectarlo entero es la decisión
correcta.

### Mantener el manual sincronizado

El agente es tan correcto como el manual. Si el manual queda desactualizado,
el agente desinforma con total seguridad.

- La copia que usa el agente está en `backend/knowledge/MANUAL_USUARIO.md`.
  El original vive en `Documentation_repo`; al actualizarlo hay que copiarlo
  aquí y reiniciar el servidor (el contenido se cachea en memoria).
- Mientras el manual tenga secciones vencidas, se corrigen en la constante
  `ACLARACIONES_VIGENCIA` de `promptSoporte.ts`, que **prevalece** sobre el
  manual. Al actualizar el documento, hay que borrar de ahí lo que ya quede
  reflejado.

> **Pendiente conocido:** la sección 1.1 del manual advierte que los grupos y
> gastos se guardan «solo en este navegador». Eso dejó de ser cierto cuando
> los módulos financieros pasaron a PostgreSQL. Está corregido en
> `ACLARACIONES_VIGENCIA`, pero lo correcto es actualizar el manual y quitar
> la aclaración.

---

## 4. Las herramientas

Cuatro, todas acotadas al usuario de la sesión.

| Herramienta | Argumentos | Qué hace |
|---|---|---|
| `consultar_mis_tickets` | ninguno | Lista los tickets del usuario |
| `consultar_ticket` | `numero` | Detalle y hilo de un ticket |
| `crear_ticket` | `categoria`, `asunto`, `descripcion`, `prioridad` | Abre un caso |
| `agregar_comentario` | `numero`, `comentario` | Añade información a un caso |

### Categorías y prioridades

`cuenta`, `grupos`, `gastos`, `divisiones`, `pagos`, `balances`, `analisis`,
`escaneo`, `otro`.

`baja` (duda sin afectación) · `normal` (algo no funciona pero puede seguir) ·
`alta` (no puede entrar, dinero mal calculado, o pérdida de datos).

---

## 5. Seguridad

Esta es la parte que más se equivoca al construir agentes, así que conviene
dejarla explícita.

### 5.1 El modelo no decide de quién son los datos

Ninguna herramienta acepta un identificador de usuario como argumento. El
actor se fija al construir el ejecutor, desde `req.usuario` que rellena
`authMiddleware` tras verificar el access token:

```ts
const ejecutar = crearEjecutorHerramientas(this.soporte, actor);
```

Si un usuario escribe «muéstrame el ticket del usuario 7» y el modelo lo
intenta, no tiene forma de expresarlo: el argumento no existe. Esto evita el
patrón de abuso conocido como *confused deputy*, en el que se usa al agente
—que tiene más permisos que quien le habla— como intermediario para acceder a
lo que no le corresponde.

Hay una prueba automática que lo verifica sobre las definiciones de las
herramientas, de modo que añadir un argumento así rompe la suite.

### 5.2 Doble barrera de propiedad

- **En el servicio:** `obtenerTicket` compara el dueño del ticket con el
  actor y lanza `TicketNoEncontradoError` —no «acceso denegado»— cuando no
  coinciden, para no revelar que el ticket existe.
- **En el SQL:** `buscarConversacion` filtra por `usuario_id` dentro de la
  consulta, no en una comprobación posterior. Un identificador de
  conversación ajeno abre una conversación nueva en lugar de dar acceso a la
  memoria de otra persona.

### 5.3 Alcance deliberadamente estrecho

El agente **no** consulta saldos, gastos ni balances. Un agente de soporte no
necesita leer el dinero del usuario, y no dárselo elimina de raíz toda una
clase de fugas de información. Si pregunta por sus cifras, el agente le dice
dónde verlas en la aplicación.

### 5.4 Contención del gasto

- `MAX_VUELTAS = 4` en `AsistenteService`: el bucle nunca llama al modelo más
  de cuatro veces por mensaje.
- `IA_MAX_TOKENS` limita la longitud de la respuesta.
- `IA_TIMEOUT_MS` aborta la llamada si el proveedor no responde.
- El historial que se envía como contexto está limitado a los últimos 12
  mensajes.

### 5.5 Lo que no sale al usuario

El adaptador del modelo registra el estado HTTP y el tipo de error del
proveedor en el log, pero nunca propaga su mensaje: podría contener detalles
de la cuenta o de la clave. El prompt prohíbe además mencionar tablas,
endpoints, nombres de herramientas o errores internos.

### 5.6 Auditoría

`auditarActividad` ya audita todo `/api/*`, así que cada mensaje al asistente
y cada operación sobre un ticket queda en `auditoria_evento` con actor, acción
y motivo, sin código adicional.

---

## 6. Base de datos

```
ticket_consecutivo      (anio, ultimo)                     numeración anual
ticket_soporte          FT-AAAA-NNNN, dueño, categoría, prioridad, estado
ticket_mensaje          hilo usuario ↔ moderador
conversacion_asistente  memoria del chat, con ticket_id opcional
mensaje_asistente       turnos de la conversación
```

**Numeración sin colisiones.** El consecutivo se obtiene con un
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` dentro de la misma
transacción que crea el ticket. Ese UPSERT bloquea la fila del año, de modo
que dos peticiones simultáneas no pueden recibir el mismo número.

**Vínculo conversación ↔ ticket.** Cuando el agente abre un caso, guarda el
`ticket_id` en la conversación. Quien lo atienda puede leer el diálogo
completo que lo originó, en lugar de solo la descripción resumida.

---

## 7. API

Todos los endpoints exigen `Authorization: Bearer <access token>`.

### Asistente

```
GET  /api/asistente/estado     → { disponible: boolean }
POST /api/asistente/mensajes   → { mensaje, conversacionId? }
                                 { conversacionId, respuesta, ticket | null }
```

`503 AsistenteNoDisponibleError` cuando no hay `IA_API_KEY` configurada; el
frontend lo trata como señal para usar su respaldo local.

### Tickets

```
GET    /api/soporte/tickets                   mis tickets
POST   /api/soporte/tickets                   crear (sin pasar por el chat)
GET    /api/soporte/tickets/:numero           detalle + hilo
POST   /api/soporte/tickets/:numero/mensajes  comentar
GET    /api/soporte/bandeja                   todos      [moderador, supervisor]
PATCH  /api/soporte/tickets/:numero/estado    cambiar estado [moderador, supervisor]
```

---

## 8. Puesta en marcha

```bash
# 1. Migración
cd backend
npm run migrate:dev

# 2. Clave del modelo en backend/.env  (NO subir al repositorio)
#    IA_API_KEY=sk-...

# 3. Arrancar
npm run dev          # backend  → http://localhost:3000
cd ../frontend && npm run dev   # frontend → http://localhost:5173
```

Sin el paso 2 todo funciona igual, con el chatbot de preguntas frecuentes.

### Cambiar de proveedor

La API de Chat Completions está replicada por varios servicios, así que basta
cambiar dos variables. Con Groq, que tiene capa gratuita:

```
IA_API_KEY=gsk_...
IA_BASE_URL=https://api.groq.com/openai/v1
IA_MODELO=llama-3.3-70b-versatile
```

---

## 9. Pruebas

```bash
cd backend && npm test
```

53 pruebas nuevas, sin llamar a ningún modelo: el puerto `AsistenteIA` se
sustituye por un doble que devuelve respuestas programadas, así que la suite
corre en menos de dos segundos y no consume tokens.

| Archivo | Qué cubre |
|---|---|
| `tests/unit/SoporteService.test.ts` | Permisos, propiedad, normalización, estados |
| `tests/unit/herramientasSoporte.test.ts` | Las 4 herramientas, argumentos inválidos, el actor inyectado |
| `tests/unit/AsistenteService.test.ts` | Bucle completo, memoria, límite de vueltas, vínculo del ticket |
| `tests/unit/soporteValidators.test.ts` | Esquemas Zod de entrada |

Casos que valen la pena destacar, porque son los que fallan en la práctica:

- El modelo manda `usuarioId: 999` en los argumentos → se descarta y se usa
  el de la sesión.
- El modelo manda una categoría inventada → la herramienta devuelve
  «Argumentos inválidos» y el agente corrige, en lugar de romperse.
- El modelo se queda pidiendo herramientas → el bucle corta a las 4 vueltas y
  responde algo útil.
- El modelo intenta crear dos tickets en un turno → solo se vincula el
  primero.
- Un `conversacionId` ajeno → se abre una conversación nueva.

---

## 10. Limitaciones conocidas

1. **El manual se cachea en memoria.** Hay que reiniciar el servidor para
   recargarlo.
2. **No hay vista de bandeja en el frontend.** Los endpoints de moderador
   existen y están probados, pero la interfaz para atender tickets aún no se
   construyó; por ahora se usan con un cliente HTTP.
3. **No se notifica al usuario** cuando un moderador responde su ticket. El
   módulo de notificaciones ya existe en el backend y sería el siguiente
   enganche natural.
4. **Sin límite de uso por usuario.** Nada impide que alguien envíe cientos
   de mensajes. Para un despliegue real haría falta un contador por usuario y
   día.
5. **Depende de un servicio externo.** Sin red o sin saldo, el agente no
   responde. El respaldo local cubre el caso, pero con respuestas más pobres.
