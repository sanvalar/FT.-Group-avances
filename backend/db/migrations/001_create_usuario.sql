-- Migracion 001: tabla USUARIO
-- Ver seccion 3.1 del "Esquema de Base de Datos y Documentacion Tecnica" (FT. GROUP).

CREATE TABLE IF NOT EXISTS usuario (
    id              BIGSERIAL PRIMARY KEY,
    nombre          VARCHAR(120) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    telefono        VARCHAR(20),
    fecha_registro  TIMESTAMP NOT NULL DEFAULT NOW(),
    estado          VARCHAR(20) NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'bloqueado'))
);

-- Indice unico para email, usado en el login (seccion 4 del esquema de BD).
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_email ON usuario (email);
