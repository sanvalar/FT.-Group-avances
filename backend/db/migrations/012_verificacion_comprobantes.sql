CREATE TABLE IF NOT EXISTS comprobante_factura (
    gasto_id BIGINT PRIMARY KEY REFERENCES gasto(id) ON DELETE CASCADE,
    archivo_hash CHAR(64) NOT NULL,
    comercio VARCHAR(120),
    nit_normalizado VARCHAR(20),
    numero_factura_normalizado VARCHAR(60),
    cufe VARCHAR(96),
    fecha_factura DATE,
    monto_total NUMERIC(12, 2),
    estado_verificacion VARCHAR(30) NOT NULL
        CHECK (estado_verificacion IN ('datos_consistentes', 'inconsistente', 'pendiente', 'duplicada')),
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprobante_hash
    ON comprobante_factura (archivo_hash);

CREATE INDEX IF NOT EXISTS idx_comprobante_factura_emisor_numero
    ON comprobante_factura (nit_normalizado, numero_factura_normalizado)
    WHERE nit_normalizado IS NOT NULL AND numero_factura_normalizado IS NOT NULL;
