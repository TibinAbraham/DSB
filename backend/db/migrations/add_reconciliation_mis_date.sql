-- Migration: Add mis_date to reconciliation_results for consistent date filtering
-- The batch/reconciliation run date - used when saving and loading final results

ALTER TABLE reconciliation_results ADD mis_date DATE;
-- Backfill: set mis_date from pickup_date or remittance_date for existing rows
UPDATE reconciliation_results SET mis_date = COALESCE(pickup_date, remittance_date) WHERE mis_date IS NULL;
COMMIT;
