-- C23-ENGAGE §1 — the send ledger, plus the two columns follow-up needs on the
-- prospect itself. Platform-level like PractitionerProspect: no tenant scope
-- column, outside SCOPED_MODELS, outside the null-tenant stamp audit.
--
-- The UNIQUE (prospectId, sequenceKey, stepKey) index is the load-bearing
-- object in this migration: the engine claims a step by INSERTING its ledger
-- row, so the database — not application care — is what makes a second send
-- impossible.

-- Follow-up consent (permanent suppression) and the prospect's own language.
ALTER TABLE "PractitionerProspect" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
ALTER TABLE "PractitionerProspect" ADD COLUMN "locale" TEXT;

CREATE TYPE "ProspectMessageStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'SUPPRESSED', 'UNCONFIGURED');

CREATE TABLE "ProspectMessage" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "sequenceKey" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "ProspectMessageStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspectMessage_prospectId_sequenceKey_stepKey_key" ON "ProspectMessage"("prospectId", "sequenceKey", "stepKey");
CREATE INDEX "ProspectMessage_status_scheduledFor_idx" ON "ProspectMessage"("status", "scheduledFor");
CREATE INDEX "ProspectMessage_prospectId_createdAt_idx" ON "ProspectMessage"("prospectId", "createdAt");
