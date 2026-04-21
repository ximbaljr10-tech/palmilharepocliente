-- ============================================================
-- MIGRATION: Tabela remessa_label_jobs
-- Data:      2026-04-21
-- Propósito: cache/queue de PDFs de etiquetas por remessa
-- Segurança: 100% aditiva. Nenhuma referência a "order".
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS remessa_label_jobs (
  id                 SERIAL PRIMARY KEY,
  remessa_id         INTEGER NOT NULL REFERENCES remessas(id) ON DELETE CASCADE,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',
  order_ids_hash     VARCHAR(64),
  pdf_path           TEXT,
  pdf_size_bytes     INTEGER,
  page_count         INTEGER,
  progress_current   INTEGER NOT NULL DEFAULT 0,
  progress_total     INTEGER NOT NULL DEFAULT 0,
  error_message      TEXT,
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT remessa_label_jobs_status_chk
    CHECK (status IN ('pending','building','ready','error')),
  CONSTRAINT remessa_label_jobs_remessa_unique UNIQUE (remessa_id)
);

CREATE INDEX IF NOT EXISTS idx_remessa_label_jobs_status
  ON remessa_label_jobs(status);
CREATE INDEX IF NOT EXISTS idx_remessa_label_jobs_updated_at
  ON remessa_label_jobs(updated_at DESC);

COMMIT;
