CREATE TABLE IF NOT EXISTS liquidacion_pago (
  id BIGSERIAL PRIMARY KEY,
  grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
  gasto_id BIGINT REFERENCES gasto(id) ON DELETE SET NULL,
  deudor_id BIGINT NOT NULL REFERENCES usuario(id),
  acreedor_id BIGINT NOT NULL REFERENCES usuario(id),
  monto NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmada')),
  fecha_reporte TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_confirmacion TIMESTAMPTZ,
  CHECK (deudor_id <> acreedor_id),
  CHECK (
    (estado = 'pendiente' AND fecha_confirmacion IS NULL)
    OR (estado = 'confirmada' AND fecha_confirmacion IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_liquidacion_pendiente_grupo_par
  ON liquidacion_pago (grupo_id, deudor_id, acreedor_id)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_liquidacion_confirmada_grupo_par
  ON liquidacion_pago (grupo_id, deudor_id, acreedor_id)
  WHERE estado = 'confirmada';

ALTER TABLE movimiento
  DROP CONSTRAINT IF EXISTS movimiento_tipo_movimiento_check;

ALTER TABLE movimiento
  ADD CONSTRAINT movimiento_tipo_movimiento_check
  CHECK (tipo_movimiento IN (
    'gasto_creado', 'gasto_editado', 'gasto_eliminado', 'pago_reportado',
    'pago_registrado', 'miembro_agregado', 'miembro_expulsado'
  ));

ALTER TABLE notificacion
  DROP CONSTRAINT IF EXISTS notificacion_tipo_check;

ALTER TABLE notificacion
  ADD CONSTRAINT notificacion_tipo_check
  CHECK (tipo IN (
    'nuevo_gasto', 'pago_recibido', 'pago_reportado', 'recordatorio', 'invitacion_grupo'
  ));
