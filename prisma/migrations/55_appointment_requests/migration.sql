-- C40-APPOINTMENT-REQUESTS (rulings 223, 226-234). ADDITIVE ONLY.
--
-- Postgres rule this file respects: a value added by ALTER TYPE ... ADD VALUE
-- cannot be USED in the transaction that added it, and migrate deploy wraps
-- this file in one transaction. So nothing here writes the new values — no
-- backfill, no default change. Migrations 14, 20 and 27 are shaped this way
-- and landed in production through the same pre-deploy step.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
-- item 3: the 30-minute reminder's dedup mark, beside reminderSentAt (24h).
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reminder30SentAt" TIMESTAMP(3);
