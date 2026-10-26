-- ============================================================================
-- PRODUCTION FIX for the C18 outage (paste this whole thing into Railway's
-- Postgres query tool and run it once). It:
--   1. Renames the migration-history rows to the zero-padded names (P1 fix),
--   2. Adds the C18 columns/tables the new code needs (migration 19), and
--   3. Records migration 19 as applied, so Prisma is happy afterward.
-- Everything is inside ONE transaction: if any line fails, the whole thing
-- rolls back and nothing changes. Safe to run without a backup.
-- ============================================================================

BEGIN;

-- 1) Reconcile migration history names (0_ … 9_  ->  00_ … 09_). No-op if
--    they're already padded.
UPDATE "_prisma_migrations" SET migration_name = '00_init'              WHERE migration_name = '0_init';
UPDATE "_prisma_migrations" SET migration_name = '01_c1_accounts'       WHERE migration_name = '1_c1_accounts';
UPDATE "_prisma_migrations" SET migration_name = '02_c2_log_entries'    WHERE migration_name = '2_c2_log_entries';
UPDATE "_prisma_migrations" SET migration_name = '03_c3_between_session' WHERE migration_name = '3_c3_between_session';
UPDATE "_prisma_migrations" SET migration_name = '04_c4_record'         WHERE migration_name = '4_c4_record';
UPDATE "_prisma_migrations" SET migration_name = '05_c5_session_prep'   WHERE migration_name = '5_c5_session_prep';
UPDATE "_prisma_migrations" SET migration_name = '06_c6_courses'        WHERE migration_name = '6_c6_courses';
UPDATE "_prisma_migrations" SET migration_name = '07_c9_worksheets'     WHERE migration_name = '7_c9_worksheets';
UPDATE "_prisma_migrations" SET migration_name = '08_c10_scheduling'    WHERE migration_name = '8_c10_scheduling';
UPDATE "_prisma_migrations" SET migration_name = '09_c11_profile_hd'    WHERE migration_name = '9_c11_profile_hd';

-- 2) The C18 schema changes (migration 19_c18_public_leads).
CREATE TYPE "AppointmentKind" AS ENUM ('SESSION', 'DISCOVERY');
CREATE TYPE "AvailabilityKind" AS ENUM ('SESSION', 'DISCOVERY');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'SCHEDULED', 'COMPLETED', 'CONVERTED', 'CLOSED');

ALTER TABLE "Appointment" ADD COLUMN "kind" "AppointmentKind" NOT NULL DEFAULT 'SESSION',
  ALTER COLUMN "clientId" DROP NOT NULL;

ALTER TABLE "AvailabilityRule" ADD COLUMN "kind" "AvailabilityKind" NOT NULL DEFAULT 'SESSION';

ALTER TABLE "SchedulingConfig" ADD COLUMN "discoveryMinutes" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "discoveryVideoUrl" TEXT;

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "appointmentId" TEXT,
    "convertedUserId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Lead_appointmentId_key" ON "Lead"("appointmentId");
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Record migration 19 as applied (checksum matches the file in the repo, so
--    a future `prisma migrate deploy` will say "up to date").
INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text,
   'a609fcdc0d376c701d0805d41066bd9920f73092b8a01167c996ec028c35727a',
   now(), '19_c18_public_leads', NULL, NULL, now(), 1);

COMMIT;
