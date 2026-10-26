-- CLIENT-ONBOARDING v1.1 — intake engine + quiet discovery. Additive only.

CREATE TYPE "IntakePurpose" AS ENUM ('INITIAL', 'UPDATE', 'REASSESSMENT');
CREATE TYPE "IntakeStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABANDONED');
CREATE TYPE "HintStatus" AS ENUM ('UNSEEN', 'SEEN', 'DISMISSED');

CREATE TABLE "IntakeFlow" (
    "tenantId" TEXT,
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "purpose" "IntakePurpose" NOT NULL DEFAULT 'INITIAL',
    "status" "IntakeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "schemaHash" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeFlow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeFlow_tenantId_clientId_idx" ON "IntakeFlow"("tenantId", "clientId");

CREATE TABLE "IntakeAnswer" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "questionTextSnapshot" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeAnswer_flowId_fieldKey_key" ON "IntakeAnswer"("flowId", "fieldKey");
ALTER TABLE "IntakeAnswer" ADD CONSTRAINT "IntakeAnswer_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "IntakeFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientHintState" (
    "tenantId" TEXT,
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "hintKey" TEXT NOT NULL,
    "status" "HintStatus" NOT NULL DEFAULT 'UNSEEN',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientHintState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientHintState_clientId_hintKey_key" ON "ClientHintState"("clientId", "hintKey");

CREATE TABLE "ActivityEvent" (
    "tenantId" TEXT,
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "actor" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivityEvent_tenantId_eventKey_createdAt_idx" ON "ActivityEvent"("tenantId", "eventKey", "createdAt");
