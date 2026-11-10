CREATE TABLE IF NOT EXISTS grupo (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    creado_por BIGINT NOT NULL REFERENCES usuario(id),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    estado VARCHAR(20) NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'archivado'))
);

CREATE TABLE IF NOT EXISTS miembro_grupo (
    id BIGSERIAL PRIMARY KEY,
    grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    rol VARCHAR(20) NOT NULL DEFAULT 'miembro'
        CHECK (rol IN ('administrador', 'miembro')),
    fecha_union TIMESTAMP NOT NULL DEFAULT NOW(),
    estado VARCHAR(20) NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo', 'expulsado', 'salido')),
    UNIQUE (grupo_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS gasto (
    id BIGSERIAL PRIMARY KEY,
    grupo_id BIGINT NOT NULL REFERENCES grupo(id),
    pagador_id BIGINT NOT NULL REFERENCES usuario(id),
    descripcion VARCHAR(255) NOT NULL,
    monto_total NUMERIC(12, 2) NOT NULL CHECK (monto_total > 0),
    fecha_gasto DATE NOT NULL,
    categoria VARCHAR(60) NOT NULL,
    tipo_division VARCHAR(20) NOT NULL
        CHECK (tipo_division IN ('equitativa', 'personalizada')),
    comprobante_url VARCHAR(500),
    origen_registro VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (origen_registro IN ('manual', 'ocr')),
    fecha_registro TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participacion_gasto (
    id BIGSERIAL PRIMARY KEY,
    gasto_id BIGINT NOT NULL REFERENCES gasto(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id),
    monto_asignado NUMERIC(12, 2) NOT NULL CHECK (monto_asignado >= 0),
    estado_pago VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado_pago IN ('pendiente', 'pagado')),
    fecha_pago TIMESTAMP,
    UNIQUE (gasto_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS balance (
    id BIGSERIAL PRIMARY KEY,
    grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
    deudor_id BIGINT NOT NULL REFERENCES usuario(id),
    acreedor_id BIGINT NOT NULL REFERENCES usuario(id),
    monto NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (grupo_id, deudor_id, acreedor_id),
    CHECK (deudor_id <> acreedor_id)
);

CREATE TABLE IF NOT EXISTS movimiento (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id),
    grupo_id BIGINT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
    gasto_id BIGINT REFERENCES gasto(id) ON DELETE SET NULL,
    tipo_movimiento VARCHAR(30) NOT NULL CHECK (
        tipo_movimiento IN ('gasto_creado', 'gasto_editado', 'pago_registrado', 'miembro_agregado', 'miembro_expulsado')
    ),
    descripcion TEXT,
    fecha TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificacion (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (
        tipo IN ('nuevo_gasto', 'pago_recibido', 'recordatorio', 'invitacion_grupo')
    ),
    mensaje TEXT NOT NULL,
    leido BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_miembro_grupo_activo ON miembro_grupo (usuario_id, estado, grupo_id);
CREATE INDEX IF NOT EXISTS idx_gasto_grupo_fecha ON gasto (grupo_id, fecha_gasto DESC);
CREATE INDEX IF NOT EXISTS idx_participacion_usuario_pago ON participacion_gasto (usuario_id, estado_pago);
CREATE INDEX IF NOT EXISTS idx_balance_grupo ON balance (grupo_id);
CREATE INDEX IF NOT EXISTS idx_movimiento_grupo_fecha ON movimiento (grupo_id, fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notificacion_usuario_fecha ON notificacion (usuario_id, fecha_creacion DESC);