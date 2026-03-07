-- Migration: Add is_final to reconciliation_results for final/saved reconciliation
-- Run on existing DBs

ALTER TABLE reconciliation_results ADD is_final NUMBER(1) DEFAULT 0;
UPDATE reconciliation_results SET is_final = 0 WHERE is_final IS NULL;
COMMIT;
