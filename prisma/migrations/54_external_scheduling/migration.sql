-- C37-EXTERNAL-SCHEDULING — embed AND sync.
--
-- ADDITIVE ONLY. No existing column is altered, renamed, retyped or dropped, so
-- every row that exists keeps exactly the shape it has and every gate covering
-- Appointment and Lead is unaffected.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalProvider"  TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalId"        TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalPayload"   JSONB;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalUpdatedAt" TIMESTAMP(3);

-- The reconciliation key. NULLs do not collide in a Postgres unique index, so
-- every internally-booked appointment (both columns null) is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_externalProvider_externalId_key"
  ON "Appointment" ("externalProvider", "externalId");

-- RULING 193 — the provider's intake answers. Stored, visible, NOT evidence.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "intakeAnswers" JSONB;

CREATE TABLE IF NOT EXISTS "ExternalSchedulingConnection" (
  "tenantId"         TEXT,
  "id"               TEXT NOT NULL,
  "provider"         TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'CONNECTED',
  "externalOwner"    TEXT,
  "credentialEnc"    TEXT NOT NULL,
  "signingKeyEnc"    TEXT,
  "ingressTokenHash" TEXT,
  "embedUrl"         TEXT,
  "lastEventAt"      TIMESTAMP(3),
  "lastErrorAt"      TIMESTAMP(3),
  "lastError"        TEXT,
  "eventCount30d"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalSchedulingConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalSchedulingConnection_ingressTokenHash_key"
  ON "ExternalSchedulingConnection" ("ingressTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalSchedulingConnection_tenantId_provider_key"
  ON "ExternalSchedulingConnection" ("tenantId", "provider");
