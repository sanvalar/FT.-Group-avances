ALTER TABLE grupo
  ADD COLUMN IF NOT EXISTS moneda CHAR(3) NOT NULL DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS tasa_cop NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (tasa_cop > 0),
  ADD COLUMN IF NOT EXISTS instrucciones_pago TEXT;

ALTER TABLE gasto
  ADD COLUMN IF NOT EXISTS moneda_original CHAR(3) NOT NULL DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS monto_original NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS tasa_cambio NUMERIC(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS creado_por BIGINT REFERENCES usuario(id),
  ADD COLUMN IF NOT EXISTS solicitud_id UUID,
  ADD COLUMN IF NOT EXISTS huella_solicitud CHAR(64),
  DROP CONSTRAINT IF EXISTS gasto_tipo_division_check;

ALTER TABLE gasto
  ADD CONSTRAINT gasto_tipo_division_check
  CHECK (tipo_division IN ('equitativa', 'personalizada', 'porcentaje', 'participaciones'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_solicitud_usuario
  ON gasto (grupo_id, creado_por, solicitud_id)
  WHERE solicitud_id IS NOT NULL AND creado_por IS NOT NULL;

CREATE TABLE IF NOT EXISTS gasto_articulo (
  id BIGSERIAL PRIMARY KEY,
  gasto_id BIGINT NOT NULL REFERENCES gasto(id) ON DELETE CASCADE,
  descripcion VARCHAR(200) NOT NULL,
  cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad > 0),
  monto_total NUMERIC(12, 2) NOT NULL CHECK (monto_total > 0),
  orden SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plantilla_division (
  id BIGSERIAL PRIMARY KEY,
  grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  nombre VARCHAR(80) NOT NULL,
  tipo_division VARCHAR(20) NOT NULL
    CHECK (tipo_division IN ('equitativa', 'personalizada', 'porcentaje', 'participaciones')),
  asignaciones JSONB NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grupo_id, usuario_id, nombre)
);

CREATE TABLE IF NOT EXISTS gasto_recurrente (
  id BIGSERIAL PRIMARY KEY,
  grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  creado_por BIGINT NOT NULL REFERENCES usuario(id),
  pagador_id BIGINT NOT NULL REFERENCES usuario(id),
  descripcion VARCHAR(255) NOT NULL,
  monto_total NUMERIC(12, 2) NOT NULL CHECK (monto_total > 0),
  categoria VARCHAR(60) NOT NULL,
  tipo_division VARCHAR(20) NOT NULL
    CHECK (tipo_division IN ('equitativa', 'personalizada', 'porcentaje', 'participaciones')),
  participaciones JSONB NOT NULL,
  articulos JSONB NOT NULL DEFAULT '[]'::jsonb,
  moneda_original CHAR(3) NOT NULL DEFAULT 'COP',
  monto_original NUMERIC(12, 2) NOT NULL,
  tasa_cambio NUMERIC(18, 8) NOT NULL DEFAULT 1,
  frecuencia VARCHAR(12) NOT NULL CHECK (frecuencia IN ('semanal', 'mensual', 'anual')),
  proxima_fecha DATE NOT NULL,
  mes_ano SMALLINT NOT NULL CHECK (mes_ano BETWEEN 1 AND 12),
  dia_mes SMALLINT NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gasto_recurrente_due
  ON gasto_recurrente (proxima_fecha) WHERE activa = TRUE;

CREATE TABLE IF NOT EXISTS gasto_recurrente_instancia (
  recurrencia_id BIGINT NOT NULL REFERENCES gasto_recurrente(id) ON DELETE CASCADE,
  fecha_programada DATE NOT NULL,
  gasto_id BIGINT NOT NULL REFERENCES gasto(id) ON DELETE CASCADE,
  PRIMARY KEY (recurrencia_id, fecha_programada),
  UNIQUE (gasto_id)
);

CREATE TABLE IF NOT EXISTS importacion_transaccion (
  id BIGSERIAL PRIMARY KEY,
  grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id),
  huella CHAR(64) NOT NULL,
  gasto_id BIGINT REFERENCES gasto(id) ON DELETE SET NULL,
  importado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grupo_id, usuario_id, huella)
);
