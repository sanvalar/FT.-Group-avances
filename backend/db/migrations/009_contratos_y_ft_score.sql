-- Migration 009: Contratos Digitales de Gasto y FT-Score (Educación Financiera)

-- Tabla de reputación y score financiero por usuario
CREATE TABLE IF NOT EXISTS usuario_ft_score (
    usuario_id BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
    ft_score INT NOT NULL DEFAULT 750, -- Rango 300 - 990
    nivel VARCHAR(20) NOT NULL DEFAULT 'Bronce', -- Bronce, Plata, Oro, Platino, Diamante
    pagos_a_tiempo INT NOT NULL DEFAULT 0,
    pagos_mora INT NOT NULL DEFAULT 0,
    ahorro_total_generado NUMERIC(12, 2) DEFAULT 0.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Contratos Digitales de Gasto (Smart Expense Contracts)
CREATE TABLE IF NOT EXISTS contrato_gasto (
    id VARCHAR(36) PRIMARY KEY,
    gasto_id BIGINT NOT NULL,
    grupo_id BIGINT NOT NULL REFERENCES grupo(id),
    creador_id BIGINT NOT NULL REFERENCES usuario(id),
    titulo VARCHAR(150) NOT NULL,
    monto_total NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(10) NOT NULL DEFAULT 'COP',
    fecha_limite_pago TIMESTAMP NOT NULL,
    clausula_impago VARCHAR(50) DEFAULT 'RESTRUCTURACION', -- RESTRUCTURACION, FONDO_COBERTURA, PENALIZACION_SCORE
    interes_mora_diario NUMERIC(5, 2) DEFAULT 0.05, -- 0.05% pedagogico diario
    estado VARCHAR(20) DEFAULT 'PENDIENTE_FIRMAS', -- PENDIENTE_FIRMAS, ACTIVO, CUMPLIDO, EN_DISPUTA, INCUMPLIDO
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de firmas de participantes en el contrato
CREATE TABLE IF NOT EXISTS contrato_firma (
    id VARCHAR(36) PRIMARY KEY,
    contrato_id VARCHAR(36) NOT NULL REFERENCES contrato_gasto(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id),
    monto_asignado NUMERIC(12, 2) NOT NULL,
    estado_pago VARCHAR(20) DEFAULT 'PENDIENTE', -- PENDIENTE, PAGADO, MORA, RESTRUCTURADO
    firmado BOOLEAN DEFAULT FALSE,
    fecha_firma TIMESTAMP,
    hash_firma VARCHAR(64), -- SHA-256 de la firma
    unique(contrato_id, usuario_id)
);
