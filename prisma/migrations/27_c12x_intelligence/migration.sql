-- C12X — The Client Intelligence Layer.
-- New evidence-source + retired state, resonance marks, the Practitioner
-- Integration Guide, three ledgers (Goals / Belief Work / Interventions),
-- Ask-the-Record answers, and the structured reading payload.

ALTER TYPE "NodeSource" ADD VALUE 'CHART_DERIVED';
ALTER TYPE "NodeState" ADD VALUE 'CONTRADICTED';

ALTER TABLE "PsycheNode" ADD COLUMN "chartBasis" TEXT;
ALTER TABLE "PsycheNode" ADD COLUMN "blockKey" TEXT;

ALTER TABLE "IntegrativeReading" ADD COLUMN "structured" JSONB;

CREATE TABLE "ResonanceMark" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priorValue" TEXT,
    "markedById" TEXT NOT NULL,
    "markedByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResonanceMark_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResonanceMark_clientId_subjectType_subjectKey_createdAt_idx"
    ON "ResonanceMark"("clientId", "subjectType", "subjectKey", "createdAt");

CREATE TABLE "IntegrationGuide" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationGuide_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationGuide_clientId_key" ON "IntegrationGuide"("clientId");

CREATE TABLE "ClientGoal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "whyItMatters" TEXT,
    "obstacles" TEXT,
    "relatedNodeIds" TEXT[],
    "progressRecordItemIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientGoal_clientId_status_idx" ON "ClientGoal"("clientId", "status");

CREATE TABLE "BeliefWork" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "belief" TEXT NOT NULL,
    "nodeId" TEXT,
    "supportingRecordItemIds" TEXT[],
    "contradictingRecordItemIds" TEXT[],
    "statementOptions" JSONB,
    "approvedStatement" TEXT,
    "approvedAt" TIMESTAMP(3),
    "balanceUsed" TEXT,
    "subjectiveResponse" TEXT,
    "followUpRecordItemIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BeliefWork_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BeliefWork_clientId_status_idx" ON "BeliefWork"("clientId", "status");

CREATE TABLE "InterventionOutcome" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "worksheetAssignmentId" TEXT,
    "purpose" TEXT,
    "linkedNodeId" TEXT,
    "clientResponse" TEXT,
    "insights" TEXT,
    "difficulties" TEXT,
    "decision" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterventionOutcome_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterventionOutcome_assignmentId_key"
    ON "InterventionOutcome"("assignmentId");
CREATE UNIQUE INDEX "InterventionOutcome_worksheetAssignmentId_key"
    ON "InterventionOutcome"("worksheetAssignmentId");
CREATE INDEX "InterventionOutcome_clientId_idx" ON "InterventionOutcome"("clientId");

CREATE TABLE "AskRecordAnswer" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "askedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AskRecordAnswer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AskRecordAnswer_clientId_createdAt_idx"
    ON "AskRecordAnswer"("clientId", "createdAt");
