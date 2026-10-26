-- AMD-06 — practitioner support tools & assist mode.

ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SquareCustomerLink" ADD COLUMN "cardConsentAt" TIMESTAMP(3);
ALTER TABLE "SquareCustomerLink" ADD COLUMN "cardConsentRevokedAt" TIMESTAMP(3);

ALTER TABLE "Charge" ADD COLUMN "channel" TEXT;
ALTER TABLE "Charge" ADD COLUMN "channelNote" TEXT;

ALTER TABLE "WorksheetResponse" ADD COLUMN "assistedById" TEXT;

CREATE TABLE "AssistGrant" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AssistGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistGrant_clientId_createdAt_idx" ON "AssistGrant"("clientId", "createdAt");

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "onBehalfOfId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditEvent_onBehalfOfId_createdAt_idx" ON "AuditEvent"("onBehalfOfId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
