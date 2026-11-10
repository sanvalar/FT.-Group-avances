# Manual de Usuario — FT. GROUP

**Sistema Web de Gestión y División de Gastos Compartidos**
Universidad de San Buenaventura, Sede Bello — Ingeniería de Software — Grupo 2
Cliente: Ing. Jairo Coy

| Campo | Valor |
|---|---|
| Versión del manual | 1.0 |
| Versión del sistema | Frontend con módulos financieros · Backend con módulo de usuarios |
| Fecha | Septiembre de 2026 |
| Autor | Jheinson Jhamid Gutiérrez Marín |
| Historia de usuario | HU-14 (Épica 5 — Documentación técnica) |

---

## 1. Introducción

FT. GROUP permite registrar gastos compartidos entre varias personas, calcular automáticamente cuánto le debe cada quien a quién, y saldar cuentas con el menor número de pagos posible.

Este manual cubre las **seis pantallas disponibles** en la versión actual: Panel de control, Grupos financieros, Registro de gastos, Historial financiero, Escaneo de recibos y Mi perfil.

### 1.1 Aviso importante sobre el almacenamiento

> **Sus grupos y gastos se guardan únicamente en este navegador y en este computador.**
>
> El servidor de FT. GROUP administra por ahora solo las cuentas de usuario. Los módulos de grupos y gastos funcionan en **modo local** mientras se construye esa parte del servidor. Esto significa que:
>
> - Los demás integrantes de un grupo **no ven** lo que usted registra.
> - Si abre la aplicación desde otro dispositivo o navegador, **no verá** sus datos.
> - Si borra los datos de navegación, **se pierde** la información de grupos y gastos.
> - Los integrantes que agrega a un grupo son **nombres de referencia**, no cuentas reales del sistema.
>
> Su cuenta de usuario (nombre, correo, contraseña) sí se guarda en el servidor y funciona desde cualquier dispositivo.

### 1.2 A quién va dirigido

A cualquier persona que vaya a usar la aplicación, sin conocimientos técnicos. Para arquitectura, endpoints e instalación, consulte el Documento Técnico Integrado en `Documentation_repo`.

---

## 2. Antes de empezar

1. Computador o celular con conexión a internet.
2. Navegador actualizado: Chrome, Edge, Firefox o Safari.
3. Un correo electrónico válido.

En instalaciones locales de desarrollo, la aplicación se abre en `http://localhost:5173`.

La interfaz se adapta a celular: el menú lateral se convierte en un botón de menú y aparece una barra de accesos rápidos en la parte inferior.

---

## 3. Crear una cuenta

**Paso 1.** En la pantalla de inicio, haga clic en **Crear cuenta**.

**Paso 2.** Complete los campos:

| Campo | ¿Obligatorio? | Reglas |
|---|---|---|
| Nombre completo | Sí | Entre 2 y 120 caracteres |
| Correo electrónico | Sí | Formato válido, máximo 150 caracteres |
| Teléfono | No | Máximo 20 caracteres |
| Contraseña | Sí | Mínimo 8 caracteres |
| Confirmar | Sí | Debe coincidir con la contraseña |

El botón **Ver** dentro de los campos de contraseña permite revisar lo que escribió antes de enviar.

**Paso 3.** Haga clic en **Crear cuenta**. Si todo está correcto, el sistema lo lleva al inicio de sesión con el mensaje *"Cuenta creada. Ya puedes iniciar sesión."*

### 3.1 Errores frecuentes

| Mensaje | Causa |
|---|---|
| Las contraseñas no coinciden. | Los dos campos de contraseña son distintos |
| El correo ... ya se encuentra registrado. | Ese correo ya tiene una cuenta |
| No fue posible conectar con el servidor... | El servidor no está disponible |

> **Seguridad.** Su contraseña se guarda cifrada con Bcrypt: nadie del equipo puede verla. Use una que no utilice en otros servicios.

<!-- TODO capturas: ![Registro](img/registro.png) -->

---

## 4. Iniciar sesión

Escriba su correo y contraseña, y haga clic en **Iniciar sesión**. El sistema lo lleva al Panel de control.

Si los datos no coinciden aparece *"El correo o la contraseña son incorrectos."* El mensaje es el mismo cuando el correo no existe y cuando la contraseña está mal: así no se revela qué correos están registrados.

Si su cuenta fue desactivada, el mensaje indicará que está inactiva o bloqueada.

<!-- TODO capturas: ![Inicio de sesión](img/login.png) -->

---

## 5. Cómo está organizada la aplicación

Una vez dentro verá tres zonas:

1. **Barra lateral izquierda:** logo, las cinco secciones principales, su perfil y el botón de cerrar sesión.
2. **Barra superior:** nombre del sistema y un indicador de **En línea / Sin conexión** según el estado de su conexión a internet.
3. **Área central:** el contenido de la sección seleccionada.

Las cinco secciones son:

| Sección | Para qué sirve |
|---|---|
| Panel de control | Resumen de balances y liquidaciones sugeridas |
| Grupos financieros | Crear y consultar sus grupos |
| Registro de gastos | Agregar gastos y ver el detalle de cada uno |
| Historial financiero | Consultar gastos por mes, grupo y categoría |
| Escanear | Registrar un gasto a partir de la foto de un recibo |

En celular estas cinco secciones aparecen como barra inferior, y el perfil se abre desde el botón de menú.

---

## 6. Panel de control

Es la pantalla de inicio. Muestra su situación financiera consolidada de todos los grupos.

### 6.1 Los tres indicadores

| Indicador | Significado |
|---|---|
| **Balance neto** | Su posición global. En verde le deben más de lo que debe; en rojo debe más |
| **Te deben** | Total pendiente de cobro a favor suyo |
| **Debes** | Total pendiente de pago |

### 6.2 Liquidaciones sugeridas

El sistema compensa automáticamente las deudas entre cada par de personas. Si usted le debe $50.000 a alguien y esa persona le debe $30.000 a usted, se muestra una sola deuda de $20.000.

Cada fila indica quién le paga a quién, en qué grupo y cuánto. En las filas donde usted participa aparece un botón:

- **Pagué** — cuando usted es quien debe. Registra que ya pagó.
- **Recibí** — cuando le deben a usted. Registra que ya le pagaron.

Al confirmar, los balances se recalculan de inmediato.

> Las filas entre otras dos personas se muestran como información, pero sin botón: usted no puede registrar pagos ajenos.

### 6.3 Mis grupos y mapa

A la derecha se listan sus grupos con su balance individual. **Ver todos** lleva a la sección de grupos.

Abajo, el **Mapa de mis grupos** ubica cada grupo en la ciudad que le asignó. Al hacer clic en un marcador se muestra el nombre del grupo, la ciudad, el número de miembros y el total gastado.

<!-- TODO capturas: ![Panel de control](img/panel.png) -->

---

## 7. Grupos financieros

Un grupo reúne a las personas entre las que se reparten unos gastos: un apartamento, un viaje, un equipo de trabajo.

### 7.1 Crear un grupo

**Paso 1.** Haga clic en **Nuevo grupo**.

**Paso 2.** Complete el formulario:

| Campo | ¿Obligatorio? | Detalle |
|---|---|---|
| Nombre del grupo | Sí | Máximo 120 caracteres. Ej. "Apartamento 402" |
| Descripción | No | Ej. "Gastos del hogar" |
| Tipo | Sí | Hogar, Viaje, Trabajo, Amigos, Pareja o Compras. Define el ícono |
| Ciudad | Sí | Ubica el grupo en el mapa |
| Integrantes | Sí, al menos uno | Nombre obligatorio, correo opcional |

Las ciudades disponibles son Medellín, Bogotá, Cali, Barranquilla, Cartagena, Bucaramanga, Pereira, Santa Marta, Manizales, Envigado y Bello.

**Paso 3.** Use **Agregar integrante** para sumar más personas, o la X para quitar una.

**Paso 4.** Haga clic en **Crear grupo**. Usted queda como **administrador** y se cuenta como integrante automáticamente.

> Recuerde el aviso de la sección 1.1: los integrantes son nombres de referencia dentro de su navegador. No reciben invitación ni pueden ingresar al grupo.

### 7.2 Consultar sus grupos

Cada tarjeta muestra el ícono, el nombre, el número de miembros, la ciudad, la etiqueta **Admin** si usted lo administra, los avatares de los integrantes, el **total gastado** y **su balance** en ese grupo. El enlace inferior lleva a los gastos de ese grupo.

<!-- TODO capturas: ![Grupos](img/grupos.png) -->

---

## 8. Registro de gastos

### 8.1 Agregar un gasto

**Paso 1.** Haga clic en **Agregar gasto**. Debe existir al menos un grupo.

**Paso 2.** Complete el formulario:

| Campo | Detalle |
|---|---|
| Grupo | A qué grupo pertenece el gasto |
| Descripción | Máximo 255 caracteres. Ej. "Mercado semanal" |
| Monto (COP) | Solo números enteros, sin puntos ni centavos |
| Fecha | No puede ser posterior a hoy |
| Categoría | Vivienda, Servicios, Alimentación, Transporte, Alojamiento, Oficina, Entretenimiento u Otro |
| Pagado por | Quién puso el dinero. Puede ser usted u otro integrante |

**Paso 3.** Elija cómo dividir:

- **Partes iguales:** marque quiénes participan. El sistema reparte el monto entre los marcados y muestra cuánto le toca a cada uno. Si el monto no es divisible exacto, los pesos sobrantes se asignan de a uno para que la suma cuadre exactamente.
- **Personalizada:** escriba el monto de cada persona. Debajo aparece un aviso que indica cuánto falta por asignar o en cuánto se pasó. Solo se puede guardar cuando las partes suman exactamente el total.

**Paso 4.** Haga clic en **Guardar gasto**.

Mensajes de validación posibles:

| Mensaje | Qué hacer |
|---|---|
| Ingresa un monto mayor que cero. | Escriba el monto |
| Selecciona al menos un participante. | Marque a alguien en la división |
| La suma de las partes debe ser $X (faltan $Y). | Ajuste los montos personalizados |

### 8.2 Consultar los gastos

La tabla lista descripción, fecha, categoría, grupo, monto, quién pagó y **su parte**:

| Indicador | Significado |
|---|---|
| Monto en rojo | Usted debe esa cantidad |
| Monto en verde con visto | Su parte ya está saldada |
| **+$X** en verde | Usted pagó y le deben esa cantidad |
| **Saldado** | Usted pagó y ya le devolvieron todo |
| **—** | Usted no participa en ese gasto |

Los **chips** de la parte superior filtran por grupo. En celular, la tabla se muestra como tarjetas.

### 8.3 Ver el detalle de un gasto

Haga clic en cualquier fila. Se abre una ventana con el monto, el grupo, la categoría, la fecha, si fue escaneado, quién pagó, el tipo de división y la lista de participantes con su estado.

Desde ahí puede:

- **Pagué** — marcar su propia parte como pagada.
- **Recibido** — si usted pagó el gasto, confirmar que un participante ya le devolvió.
- **Eliminar** — solo quien pagó el gasto puede borrarlo. Los balances del grupo se recalculan.

<!-- TODO capturas: ![Gastos](img/gastos.png) -->

---

## 9. Historial financiero

Muestra todos los gastos agrupados por mes, del más reciente al más antiguo.

1. **Total filtrado** en la parte superior: suma de lo que se está mostrando.
2. **Filtro por grupo:** lista desplegable.
3. **Filtro por categoría:** chips de las ocho categorías.
4. Cada mes muestra su subtotal, y cada gasto indica el grupo, la fecha, cuántas personas participaron y si está **Saldado**, cuánto **Debe** o cuánto **Le deben**.

<!-- TODO capturas: ![Historial](img/historial.png) -->

---

## 10. Escaneo de recibos

Permite registrar un gasto a partir de la foto de un recibo. El reconocimiento se ejecuta **dentro de su navegador**: la imagen no se envía a ningún servidor.

### 10.1 Cómo usarlo

**Paso 1.** Necesita al menos un grupo creado.

**Paso 2.** Haga clic en **Seleccionar archivo** o arrastre la imagen al recuadro. En celular puede tomar la foto directamente.

Formatos admitidos: JPG, PNG, WEBP y PDF. Tamaño máximo: 10 MB.

**Paso 3.** El sistema ejecuta cuatro etapas:

| Etapa | Qué hace |
|---|---|
| Captura y preprocesamiento | Convierte a escala de grises y mejora el contraste |
| OCR · Detección de texto | Reconoce los caracteres, en español |
| Extracción de campos clave | Identifica monto, fecha, comercio y categoría |
| Validación y confirmación | Le muestra los datos para que los revise |

> **La primera vez tarda más**, porque el navegador descarga el modelo de reconocimiento. Después es más rápido.

**Paso 4.** Revise el resultado. El sistema muestra un porcentaje de **confianza**: entre más alto, más seguro está de lo que leyó. Aparece el comercio detectado, el monto y la categoría sugerida.

**Paso 5.** Corrija lo que haga falta en el formulario, elija el grupo y la división, y haga clic en **Confirmar y guardar**. El gasto queda marcado como **Escaneado** en su detalle.

### 10.2 Qué esperar del reconocimiento

1. **Siempre revise los datos antes de guardar.** El reconocimiento es automático y puede equivocarse, sobre todo con fotos borrosas, arrugadas o con poca luz.
2. **Para el monto**, el sistema busca primero las líneas que digan "total", "a pagar" o "valor"; si no encuentra ninguna, toma el valor más alto del recibo.
3. **Para el comercio**, toma la primera línea con texto que no parezca NIT, dirección ni teléfono.
4. **La categoría** se sugiere por palabras clave del recibo. Si no reconoce ninguna, queda como "Otro".
5. **Los PDF no se analizan automáticamente.** Se adjuntan como comprobante y los datos se ingresan a mano.
6. Para mejores resultados: buena luz, recibo plano y que se vea completo.

<!-- TODO capturas: ![Escaneo](img/escaneo.png) -->

---

## 11. Mi perfil

Se abre desde su nombre en la barra lateral.

### 11.1 Actualizar sus datos

Puede modificar **nombre** y **teléfono**, y guardar con **Guardar cambios**. El correo aparece deshabilitado: identifica su cuenta y no se puede cambiar.

### 11.2 Cuenta

Muestra el **estado** de su cuenta y desde cuándo es miembro. Incluye dos botones:

- **Cerrar sesión**
- **Desactivar cuenta** — pide confirmación. Al desactivarla se cierran todas sus sesiones y no podrá volver a ingresar.

> **Advertencia.** La reactivación de cuenta **no está disponible** en la interfaz. Si desactiva su cuenta, no podrá volver a entrar por sus propios medios y tendrá que contactar al equipo del proyecto.

### 11.3 Datos de grupos y gastos

Este panel aparece mientras la aplicación esté en modo local e incluye dos opciones:

- **Restaurar demostración** — vuelve a cargar los grupos y gastos de ejemplo.
- **Empezar vacío** — borra todos los grupos y gastos de este navegador. **No se puede deshacer.**

> Al ingresar por primera vez, la aplicación carga automáticamente grupos y gastos de demostración para que pueda explorar. Use **Empezar vacío** cuando quiera trabajar con datos propios.

<!-- TODO capturas: ![Perfil](img/perfil.png) -->

---

## 12. Su sesión

1. **La sesión dura mientras la pestaña esté abierta.** Al cerrar el navegador debe iniciar sesión otra vez.
2. **Se renueva sola.** El acceso se refresca cada 15 minutos sin que usted note nada.
3. **Cierre sesión en equipos compartidos**, con el botón de la barra lateral o del perfil.
4. **Si el servidor se cae**, aparece *"No fue posible conectar con el servidor."* Sus grupos y gastos siguen guardados en el navegador; solo se ve afectado el inicio de sesión y el perfil.

---

## 13. Funcionalidades pendientes

No disponibles en esta versión:

1. Compartir grupos y gastos entre usuarios reales (los módulos del servidor están en construcción).
2. Invitar integrantes por correo.
3. Recuperar la contraseña olvidada.
4. Reactivar una cuenta desactivada desde la interfaz.
5. Notificaciones.
6. Editar un gasto ya creado (solo se puede eliminar y volver a crear).
7. Archivar o eliminar grupos desde la interfaz.
8. Reportes exportables.

---

## 14. Preguntas frecuentes

**¿Por qué mis compañeros no ven los gastos que registré?**
Porque los módulos de grupos y gastos funcionan en modo local. Consulte la sección 1.1.

**¿Puedo entrar desde el celular y ver mis grupos?**
Su cuenta sí funciona desde cualquier dispositivo, pero los grupos y gastos quedan en el navegador donde los creó.

**¿Puedo cambiar mi correo?**
No. Identifica su cuenta. Si necesita otro, debe registrar una cuenta nueva.

**Olvidé mi contraseña.**
La recuperación aún no está implementada. Contacte al equipo del proyecto.

**¿Qué pasa si elimino un gasto?**
Se borra junto con su división y los balances del grupo se recalculan. Solo puede hacerlo quien pagó el gasto.

**¿El sistema maneja centavos?**
No. Los montos se manejan en pesos colombianos enteros.

**¿La foto de mi recibo se sube a algún servidor?**
No. El reconocimiento se ejecuta dentro de su navegador.

**¿Mis datos están seguros?**
Las contraseñas se almacenan cifradas y el acceso usa tokens de corta duración. Tenga en cuenta que esta es una versión académica en desarrollo: no registre información personal sensible.

---

## 15. Soporte

Para reportar un error o sugerir una mejora, abra un *issue* en `https://github.com/FT-GROUP`, indicando qué estaba haciendo, qué esperaba, qué ocurrió y una captura de pantalla.

---

## 16. Control de versiones del documento

| Versión | Fecha | Autor | Cambios |
|---|---|---|---|
| 1.0 | Septiembre de 2026 | Jheinson Gutiérrez Marín | Versión inicial: cuentas de usuario, grupos, gastos, historial y escaneo de recibos |
