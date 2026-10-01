-- One-time production reconciliation for the migration zero-padding fix
-- (UX-AUDIT-2026-07-14, P1). Prisma matches migration folders to applied rows by
-- `migration_name`. We renamed folders 0_* … 9_* → 00_* … 09_* so they sort in
-- creation order on a FRESH `prisma migrate deploy`. Production already applied
-- them under the OLD names, so its `_prisma_migrations` ledger must be renamed to
-- match the new folders BEFORE the renamed folders are deployed — otherwise the
-- next deploy sees 10 "new" migrations and fails re-creating existing tables.
--
-- The migration SQL is byte-for-byte unchanged, so checksums stay valid; only the
-- name column moves. Folders 10_* … 18_* were already two digits and are untouched.
--
-- RUN ONCE against production, INSIDE the transaction below, AFTER a DB backup and
-- BEFORE deploying the branch that renames the folders. Idempotent: re-running is a
-- no-op once the old names are gone.

BEGIN;

UPDATE "_prisma_migrations" SET migration_name = '00_init'             WHERE migration_name = '0_init';
UPDATE "_prisma_migrations" SET migration_name = '01_c1_accounts'      WHERE migration_name = '1_c1_accounts';
UPDATE "_prisma_migrations" SET migration_name = '02_c2_log_entries'   WHERE migration_name = '2_c2_log_entries';
UPDATE "_prisma_migrations" SET migration_name = '03_c3_between_session' WHERE migration_name = '3_c3_between_session';
UPDATE "_prisma_migrations" SET migration_name = '04_c4_record'        WHERE migration_name = '4_c4_record';
UPDATE "_prisma_migrations" SET migration_name = '05_c5_session_prep'  WHERE migration_name = '5_c5_session_prep';
UPDATE "_prisma_migrations" SET migration_name = '06_c6_courses'       WHERE migration_name = '6_c6_courses';
UPDATE "_prisma_migrations" SET migration_name = '07_c9_worksheets'    WHERE migration_name = '7_c9_worksheets';
UPDATE "_prisma_migrations" SET migration_name = '08_c10_scheduling'   WHERE migration_name = '8_c10_scheduling';
UPDATE "_prisma_migrations" SET migration_name = '09_c11_profile_hd'   WHERE migration_name = '9_c11_profile_hd';

-- Sanity check before committing: expect 19 rows, all names two-digit-prefixed,
-- and zero rows still on a single-digit prefix. If the second query returns any
-- rows, ROLLBACK and investigate.
--   SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name;
--   SELECT migration_name FROM "_prisma_migrations" WHERE migration_name ~ '^[0-9]_';

COMMIT;
