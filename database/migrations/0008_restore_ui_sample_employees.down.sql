-- Restore migration rollback intentionally left as no-op.
-- Data restoration is idempotent and may have been merged with real records.
SELECT 1;
