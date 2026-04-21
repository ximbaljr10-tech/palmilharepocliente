-- Rollback da migration
BEGIN;
DROP TABLE IF EXISTS remessa_label_jobs CASCADE;
COMMIT;
