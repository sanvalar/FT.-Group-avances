CREATE TABLE IF NOT EXISTS auditoria_evento (
    id              BIGSERIAL PRIMARY KEY,
    actor_id        BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
    actor_email     VARCHAR(150) NOT NULL,
    actor_rol       VARCHAR(20) NOT NULL
        CHECK (actor_rol IN ('usuario', 'moderador', 'supervisor')),
    accion          VARCHAR(80) NOT NULL,
    metodo          VARCHAR(10) NOT NULL,
    ruta            VARCHAR(255) NOT NULL,
    estado_http     SMALLINT NOT NULL CHECK (estado_http BETWEEN 100 AND 599),
    solicitud_id    VARCHAR(80),
    fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_evento (fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_actor ON auditoria_evento (actor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_rol_fecha ON auditoria_evento (actor_rol, fecha DESC);
