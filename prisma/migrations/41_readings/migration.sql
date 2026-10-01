-- PLATFORM Phase 3 — computed readings (ReadingProvider)
CREATE TYPE "ReadingStatus" AS ENUM ('COMPLETE', 'PENDING_RETRY', 'FAILED');

CREATE TABLE "Reading" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "moduleKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "raw" JSONB,
    "status" "ReadingStatus" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Reading_tenantId_clientId_kind_inputsHash_key" ON "Reading"("tenantId", "clientId", "kind", "inputsHash");
CREATE INDEX "Reading_tenantId_clientId_idx" ON "Reading"("tenantId", "clientId");
CREATE INDEX "Reading_status_idx" ON "Reading"("status");
