CREATE TABLE IF NOT EXISTS academia_leccion (
  id VARCHAR(50) PRIMARY KEY,
  ruta VARCHAR(30) NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  descripcion TEXT NOT NULL,
  contenido JSONB NOT NULL DEFAULT '[]',
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS academia_progreso (
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  leccion_id VARCHAR(50) NOT NULL REFERENCES academia_leccion(id) ON DELETE CASCADE,
  estado VARCHAR(20) NOT NULL DEFAULT 'iniciada'
    CHECK (estado IN ('iniciada', 'completada')),
  puntaje INTEGER NOT NULL DEFAULT 0 CHECK (puntaje BETWEEN 0 AND 100),
  intentos INTEGER NOT NULL DEFAULT 0,
  completada_at TIMESTAMP,
  actualizada_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, leccion_id)
);

CREATE TABLE IF NOT EXISTS presupuesto_categoria (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  categoria VARCHAR(60) NOT NULL,
  periodo CHAR(7) NOT NULL,
  monto_limite NUMERIC(12,2) NOT NULL CHECK (monto_limite >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, categoria, periodo)
);

CREATE TABLE IF NOT EXISTS meta_financiera (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  titulo VARCHAR(120) NOT NULL,
  monto_objetivo NUMERIC(12,2) NOT NULL CHECK (monto_objetivo > 0),
  monto_actual NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_actual >= 0),
  fecha_limite DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'completada', 'cancelada')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS factura_documento (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  gasto_id BIGINT REFERENCES gasto(id) ON DELETE SET NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  tipo_mime VARCHAR(100) NOT NULL,
  tamano_bytes INTEGER NOT NULL CHECK (tamano_bytes >= 0),
  hash_sha256 CHAR(64) NOT NULL UNIQUE,
  texto_ocr TEXT,
  datos_extraidos JSONB NOT NULL DEFAULT '{}',
  estado VARCHAR(20) NOT NULL,
  confianza NUMERIC(5,2) NOT NULL,
  confirmado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmado_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gasto_producto (
  id BIGSERIAL PRIMARY KEY,
  gasto_id BIGINT NOT NULL REFERENCES gasto(id) ON DELETE CASCADE,
  cantidad NUMERIC(10,3) NOT NULL DEFAULT 1,
  descripcion VARCHAR(255) NOT NULL,
  precio_unitario NUMERIC(12,2) NOT NULL,
  importe NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS gasto_producto_consumidor (
  producto_id BIGINT NOT NULL REFERENCES gasto_producto(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, usuario_id)
);

INSERT INTO academia_leccion (id, ruta, titulo, descripcion, contenido, orden) VALUES
('presupuesto-essencial', 'esencial', 'Construye un presupuesto realista',
 'Aprende a separar ingresos, necesidades, deseos y compromisos grupales.',
 '[{"tipo":"texto","titulo":"Regla 50/30/20 como punto de partida","cuerpo":"No es una norma rígida: ajusta las porcentajes a tu realidad."},{"tipo":"caso","titulo":"Caso práctico","cuerpo":"Carlos gana 1.800.000 COP. Renta 700.000, transporte 180.000 y mercado 320.000."},{"tipo":"quiz","pregunta":"¿Qué monto queda antes de imprevistos?","opciones":["600.000","800.000","1.200.000"],"respuesta":1}]', 1),
('factura-consciente', 'esencial', 'Lee una factura sin confundirte',
 'Comprende subtotal, impuestos, propina, descuentos y total final.',
 '[{"tipo":"texto","titulo":"Total no siempre significa consumo","cuerpo":"El total puede incluir impuestos, propina, descuentos y cargos adicionales."},{"tipo":"caso","titulo":"Comprueba el cálculo","cuerpo":"Subtotal 100.000, IVA 19.000, propina 10.000: ¿cuál es el total?"},{"tipo":"quiz","pregunta":"¿Qué línea debe servir como base de recaudación?","opciones":["El subtotal","El valor total válido","El número NIT"],"respuesta":1}]', 2),
('acuerdos-grupales', 'grupal', 'Acuerdos antes de gastar',
 'Evita conflictos definiendo responsables, cuotas y fecha límite.',
 '[{"tipo":"texto","titulo":"Acordar antes de comprometer","cuerpo":"La firma representa responsabilidad dentro de la app, no sustituye asesoría jurídica."},{"tipo":"caso","titulo":"Rechazo de una parte","cuerpo":"Si alguien rechaza su parte, vuelve el gasto a borrador y se negocia la distribución."},{"tipo":"quiz","pregunta":"¿Qué hacer ante un rechazo?","opciones":["Activar el contrato igual","Modificar o reestructurar el acuerdo","Eliminar la deuda del sistema"],"respuesta":1}]', 3),
('aháso-puntual', 'habitos', 'Crea hábitos de pago puntual',
 'Relaciona recordatorios, obligaciones y salud financiera.',
 '[{"tipo":"texto","titulo":"Automatiza sin endeudarte","cuerpo":"Una obligación sostenible cabe en tu presupuesto y tiene fecha realista."},{"tipo":"quiz","pregunta":"¿Qué debes hacer cuando sabes que no podrás pagar a tiempo?","opciones":["Ocultarlo","Avisar antes del vencimiento y acordar una solución","Aceptar todas las cuotas aunque excedan el presupuesto"],"respuesta":1}]', 4),
('emergencia-financiera', 'habitos', 'Construye un fondo de emergencia',
 'Aprende por qué el ahorro debe tener meta, tiempo y prioridad.',
 '[{"tipo":"texto","titulo":"Primero estabilidad, después metas grandes","cuerpo":"Empieza con un objetivo pequeño y constante antes de asumir compromisos mayores."},{"tipo":"quiz","pregunta":"¿Cuál es una meta de ahorro sostenible?","opciones":["Dejar todo el ingreso disponible","Aportar un porcentaje fijo mensual","Aumentar la deuda para ahorrar más"],"respuesta":1}]', 5)
ON CONFLICT (id) DO UPDATE SET ruta=EXCLUDED.ruta, titulo=EXCLUDED.titulo, descripcion=EXCLUDED.descripcion, contenido=EXCLUDED.contenido, orden=EXCLUDED.orden;
