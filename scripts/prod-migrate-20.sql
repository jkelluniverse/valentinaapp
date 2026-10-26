-- prod-migrate-20.sql — apply migration 20 (AMD-05 + C13-PACKAGES + C10-POLICY)
-- to the production database, and record it in the Prisma migration ledger.
--
-- PREREQUISITE: migration 19 (scripts/prod-fix-c18.sql) must already be applied.
--   Check with:  SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name;
--   The list must end with 19_c18_public_leads.
--
-- HOW TO RUN (from the Railway Postgres shell or any machine with psql):
--   psql "$DATABASE_URL" -f scripts/prod-migrate-20.sql
-- or paste this whole file into a psql session. It is safe to run once.

BEGIN;

-- 20 — AMENDMENT-05 (bilingual + account settings) + C13-PACKAGES + C10-POLICY.
-- One coordinated patch: locale plumbing, session revocation, verified email
-- change, deletion requests, the package/credit ledger, and the late-fee policy.

-- ---- AMENDMENT-05: User ----
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "notifyPrefs" JSONB;

-- ---- AMENDMENT-05: ClientProfile ----
ALTER TABLE "ClientProfile" ADD COLUMN "birthTimePrecision" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "paymentRemindersMuted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientProfile" ADD COLUMN "renewalMessagesMuted" BOOLEAN NOT NULL DEFAULT false;

-- Backfill precision from the legacy boolean (UNKNOWN when checked, EXACT when a time exists).
UPDATE "ClientProfile" SET "birthTimePrecision" = 'UNKNOWN' WHERE "birthTimeUnknown" = true;
UPDATE "ClientProfile" SET "birthTimePrecision" = 'EXACT' WHERE "birthTimeUnknown" = false AND "birthTime" IS NOT NULL;

-- ---- AMENDMENT-05: content locales ----
ALTER TABLE "Worksheet" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Worksheet" ADD COLUMN "translationOfId" TEXT;
ALTER TABLE "Prompt" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Prompt" ADD COLUMN "translationOfId" TEXT;
ALTER TABLE "Course" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Course" ADD COLUMN "translationOfId" TEXT;

-- ---- AMENDMENT-05: RecordItem language signal (never a gate) ----
ALTER TABLE "RecordItem" ADD COLUMN "detectedLanguage" TEXT;

-- ---- AMENDMENT-05: verified email change ----
CREATE TABLE "EmailChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailChangeRequest_tokenHash_key" ON "EmailChangeRequest"("tokenHash");
CREATE INDEX "EmailChangeRequest_userId_idx" ON "EmailChangeRequest"("userId");
ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- AMENDMENT-05: deletion requests (a request, not a self-serve nuke) ----
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeletionRequest_status_createdAt_idx" ON "DeletionRequest"("status", "createdAt");
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- C13-PACKAGES: enums ----
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'REFUNDED');
CREATE TYPE "CreditState" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');
ALTER TYPE "ChargeStatus" ADD VALUE 'COVERED';

-- ---- C13-PACKAGES: Charge rework ----
-- One charge per appointment per KIND (a session bill and a late fee coexist;
-- a late fee can never stack twice on one appointment).
DROP INDEX IF EXISTS "Charge_appointmentId_key";
ALTER TABLE "Charge" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SESSION';
ALTER TABLE "Charge" ADD COLUMN "packageId" TEXT;
ALTER TABLE "Charge" ADD COLUMN "feeReason" TEXT;
ALTER TABLE "Charge" ADD COLUMN "lastRemindedAt" TIMESTAMP(3);
ALTER TABLE "Charge" ADD COLUMN "remindCount" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Charge_appointmentId_kind_key" ON "Charge"("appointmentId", "kind");
CREATE UNIQUE INDEX "Charge_squareInvoiceId_key" ON "Charge"("squareInvoiceId");

-- ---- C13-PACKAGES: the package + append-only credit ledger ----
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "chargeId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastSessionNoticeAt" TIMESTAMP(3),
    "completedNoticeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Package_chargeId_key" ON "Package"("chargeId");
CREATE INDEX "Package_clientId_status_idx" ON "Package"("clientId", "status");

CREATE TABLE "SessionCredit" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "state" "CreditState" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "reason" TEXT,
    "actorId" TEXT,
    CONSTRAINT "SessionCredit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionCredit_appointmentId_key" ON "SessionCredit"("appointmentId");
CREATE INDEX "SessionCredit_packageId_state_idx" ON "SessionCredit"("packageId", "state");
ALTER TABLE "SessionCredit" ADD CONSTRAINT "SessionCredit_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- C10-POLICY: config, not constants ----
ALTER TABLE "SchedulingConfig" ADD COLUMN "lateFeeCents" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "SchedulingConfig" ADD COLUMN "lateFeeAutoApply" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchedulingConfig" ADD COLUMN "noShowConsumesCredit" BOOLEAN NOT NULL DEFAULT false;

-- Record migration 20 in the ledger so `prisma migrate deploy` stays in sync.
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'd7be2ed145f0f6652c8dbc7acdcb27a38a823b28ca1da8754d5999475be6f258',
  now(), '20_amd05_packages_policy', NULL, NULL, now(), 1
);

COMMIT;
