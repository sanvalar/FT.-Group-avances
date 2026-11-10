ALTER TABLE academia_leccion
  ADD COLUMN IF NOT EXISTS publicada BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS academia_leccion_publicada_idx
  ON academia_leccion(publicada);
