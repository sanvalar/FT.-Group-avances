-- 008_base_datos_historica.sql
-- Separacion de almacenamiento en caliente (Activos) vs. Almacenamiento frio / archivo (Inactivos)
-- Esquema dedicado: historico_inactivos

CREATE SCHEMA IF NOT EXISTS historico;

-- 1. Tabla de usuarios inactivos / deshabilitados
CREATE TABLE IF NOT EXISTS historico.usuario_inactivo (
  id BIGINT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telefono VARCHAR(20),
  rol VARCHAR(20) NOT NULL,
  motivo_desactivacion TEXT DEFAULT 'Desactivacion de cuenta por usuario o administrador',
  fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL,
  fecha_desactivacion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_usuario_email ON historico.usuario_inactivo (email);

-- 2. Tabla de grupos archivados / inactivos
CREATE TABLE IF NOT EXISTS historico.grupo_archivado (
  id BIGINT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  creado_por BIGINT NOT NULL,
  total_gastos NUMERIC(14,2) DEFAULT 0,
  num_integrantes INT DEFAULT 0,
  fecha_creacion TIMESTAMP WITH TIME ZONE NOT NULL,
  fecha_archivado TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata_cierre JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hist_grupo_creador ON historico.grupo_archivado (creado_por);

-- 3. Tabla de auditoria de movimientos archivados
CREATE TABLE IF NOT EXISTS historico.movimiento_historico (
  id BIGSERIAL PRIMARY KEY,
  grupo_id BIGINT,
  usuario_id BIGINT,
  tipo_movimiento VARCHAR(50) NOT NULL,
  descripcion TEXT NOT NULL,
  fecha_original TIMESTAMP WITH TIME ZONE NOT NULL,
  fecha_archivo TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
