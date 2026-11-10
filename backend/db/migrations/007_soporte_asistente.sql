-- Migracion 007: modulo de soporte al cliente y asistente conversacional.
--
-- Añade el expediente de soporte (ticket), su hilo de mensajes y la memoria
-- de las conversaciones con el asistente. No modifica ninguna tabla previa:
-- solo crea tablas nuevas que referencian usuario(id).

-- ---------------------------------------------------------------------------
-- Consecutivo anual para numerar los tickets como FT-2026-0001.
-- Se usa con un UPSERT ... RETURNING para que dos solicitudes simultaneas
-- nunca obtengan el mismo numero.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_consecutivo (
    anio    INTEGER PRIMARY KEY,
    ultimo  INTEGER NOT NULL DEFAULT 0 CHECK (ultimo >= 0)
);

-- ---------------------------------------------------------------------------
-- Expediente de soporte.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_soporte (
    id              BIGSERIAL PRIMARY KEY,
    numero          VARCHAR(20) NOT NULL UNIQUE,
    usuario_id      BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    categoria       VARCHAR(20) NOT NULL
        CHECK (categoria IN ('cuenta', 'grupos', 'gastos', 'divisiones',
                             'pagos', 'balances', 'analisis', 'escaneo', 'otro')),
    asunto          VARCHAR(150) NOT NULL,
    descripcion     TEXT NOT NULL,
    prioridad       VARCHAR(10) NOT NULL DEFAULT 'normal'
        CHECK (prioridad IN ('baja', 'normal', 'alta')),
    estado          VARCHAR(15) NOT NULL DEFAULT 'abierto'
        CHECK (estado IN ('abierto', 'en_revision', 'resuelto', 'cerrado')),
    atendido_por    BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_cierre    TIMESTAMPTZ,
    CONSTRAINT ticket_cierre_coherente
        CHECK ((estado IN ('resuelto', 'cerrado')) OR fecha_cierre IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_ticket_usuario
    ON ticket_soporte (usuario_id, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_estado
    ON ticket_soporte (estado, fecha_creacion DESC);

-- ---------------------------------------------------------------------------
-- Hilo de mensajes del ticket: lo que añade el usuario y lo que responde
-- quien lo atiende (moderador o supervisor).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_mensaje (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT NOT NULL REFERENCES ticket_soporte(id) ON DELETE CASCADE,
    autor_id    BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
    autor_rol   VARCHAR(20) NOT NULL
        CHECK (autor_rol IN ('usuario', 'moderador', 'supervisor')),
    contenido   TEXT NOT NULL,
    fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_mensaje_ticket
    ON ticket_mensaje (ticket_id, fecha ASC, id ASC);

-- ---------------------------------------------------------------------------
-- Memoria del asistente. Una conversacion agrupa los mensajes de una sesion
-- de chat; si de esa conversacion sale un ticket, queda vinculado para que
-- quien atienda vea el dialogo completo que lo origino.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversacion_asistente (
    id              BIGSERIAL PRIMARY KEY,
    usuario_id      BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    ticket_id       BIGINT REFERENCES ticket_soporte(id) ON DELETE SET NULL,
    fecha_inicio    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_ultimo    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversacion_usuario
    ON conversacion_asistente (usuario_id, fecha_ultimo DESC);

CREATE TABLE IF NOT EXISTS mensaje_asistente (
    id               BIGSERIAL PRIMARY KEY,
    conversacion_id  BIGINT NOT NULL REFERENCES conversacion_asistente(id) ON DELETE CASCADE,
    rol              VARCHAR(12) NOT NULL CHECK (rol IN ('usuario', 'asistente')),
    contenido        TEXT NOT NULL,
    fecha            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensaje_asistente_conversacion
    ON mensaje_asistente (conversacion_id, fecha ASC, id ASC);
