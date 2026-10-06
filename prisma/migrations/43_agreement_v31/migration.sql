-- C20 v3.1 — per-item acknowledgments, version labels, pattern-library election
ALTER TABLE "AgreementTemplate" ADD COLUMN "versionLabel" TEXT;
ALTER TABLE "AgreementTemplate" ADD COLUMN "initialItems" JSONB;
ALTER TABLE "Agreement" ADD COLUMN "initialsCaptured" JSONB;

CREATE TABLE "PatternElection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "clientId" TEXT NOT NULL,
    "participate" BOOLEAN NOT NULL,
    "version" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatternElection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatternElection_clientId_key" ON "PatternElection"("clientId");
