ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'usuario';

ALTER TABLE usuario
    DROP CONSTRAINT IF EXISTS usuario_rol_check;

ALTER TABLE usuario
    ADD CONSTRAINT usuario_rol_check
    CHECK (rol IN ('usuario', 'moderador', 'supervisor'));
