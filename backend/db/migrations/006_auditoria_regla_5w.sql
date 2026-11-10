ALTER TABLE auditoria_evento
  ADD COLUMN IF NOT EXISTS motivo VARCHAR(255);

UPDATE auditoria_evento
SET motivo = 'Motivo no disponible: evento anterior a la implementación de la regla 5W.'
WHERE motivo IS NULL;

ALTER TABLE auditoria_evento
  ALTER COLUMN motivo SET NOT NULL;
