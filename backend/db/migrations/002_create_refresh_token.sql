-- Migracion 002: tabla REFRESH_TOKEN
-- Ver seccion 3.2 del "Esquema de Base de Datos y Documentacion Tecnica" (FT. GROUP).

CREATE TABLE IF NOT EXISTS refresh_token (
    id                  BIGSERIAL PRIMARY KEY,
    usuario_id          BIGINT NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    token               VARCHAR(500) NOT NULL UNIQUE,
    fecha_creacion      TIMESTAMP NOT NULL,
    fecha_expiracion    TIMESTAMP NOT NULL,
    revocado            BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_usuario ON refresh_token (usuario_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_token ON refresh_token (token);
