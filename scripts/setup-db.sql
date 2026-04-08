-- Run this once to initialize all tables.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS trending_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT        NOT NULL,
  score_tendencia   NUMERIC,
  fuente            TEXT        NOT NULL,  -- 'google_trends' | 'mercadolibre'
  fecha             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evergreen_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                TEXT        NOT NULL,
  ventas_historicas     INTEGER,
  estabilidad_tendencia NUMERIC,
  fecha_actualizacion   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arbitrage_gaps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT        NOT NULL,
  precio_compra    NUMERIC     NOT NULL,
  precio_promedio  NUMERIC     NOT NULL,
  gap_porcentaje   NUMERIC     NOT NULL,
  link             TEXT,
  fuente           TEXT,  -- 'trending' | 'evergreen'
  fecha            TIMESTAMPTZ DEFAULT NOW()
);
