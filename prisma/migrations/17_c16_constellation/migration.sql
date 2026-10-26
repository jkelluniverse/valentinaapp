-- C16 — The Constellation: psyche graph, extraction audit, curation audit,
-- Pattern Library (schema-incapable of holding client content), and the
-- client's First Map completion stamp.

-- CreateEnum
CREATE TYPE "NodeKind" AS ENUM ('WOUND', 'SHADOW', 'CORE_BELIEF', 'PROTECTION', 'PATTERN', 'BEHAVIOR', 'TRAIT', 'RESOURCE', 'GIFT');

-- CreateEnum
CREATE TYPE "NodeSource" AS ENUM ('AI_EXTRACTED', 'PRACTITIONER', 'SELF_REPORTED');

-- CreateEnum
CREATE TYPE "NodeState" AS ENUM ('ACTIVE', 'LOOSENING', 'INTEGRATED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN "firstMapCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PsycheNode" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "NodeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "source" "NodeSource" NOT NULL,
    "state" "NodeState" NOT NULL DEFAULT 'ACTIVE',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidenceRecordItemIds" TEXT[],
    "chartRefs" JSONB,
    "giftLabel" TEXT,
    "suggestedState" "NodeState",
    "suggestedReason" TEXT,
    "selfX" DOUBLE PRECISION,
    "selfY" DOUBLE PRECISION,
    "promptKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsycheNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsycheEdge" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidenceRecordItemIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsycheEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsycheExtraction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "deep" BOOLEAN NOT NULL DEFAULT false,
    "scopeFrom" TIMESTAMP(3),
    "scopeTo" TIMESTAMP(3) NOT NULL,
    "model" TEXT NOT NULL,
    "nodesCreated" INTEGER NOT NULL DEFAULT 0,
    "nodesUpdated" INTEGER NOT NULL DEFAULT 0,
    "edgesCreated" INTEGER NOT NULL DEFAULT 0,
    "referralFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsycheExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PsycheAudit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PsycheAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternArchetype" (
    "id" TEXT NOT NULL,
    "kind" "NodeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "clientCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatternArchetype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternLink" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "clientCount" INTEGER NOT NULL,

    CONSTRAINT "PatternLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PsycheNode_clientId_kind_state_idx" ON "PsycheNode"("clientId", "kind", "state");
CREATE UNIQUE INDEX "PsycheEdge_fromId_toId_relation_key" ON "PsycheEdge"("fromId", "toId", "relation");
CREATE INDEX "PsycheEdge_clientId_idx" ON "PsycheEdge"("clientId");
CREATE INDEX "PsycheExtraction_clientId_createdAt_idx" ON "PsycheExtraction"("clientId", "createdAt");
CREATE INDEX "PsycheAudit_clientId_createdAt_idx" ON "PsycheAudit"("clientId", "createdAt");
CREATE UNIQUE INDEX "PatternArchetype_label_key" ON "PatternArchetype"("label");
CREATE UNIQUE INDEX "PatternLink_fromId_toId_relation_key" ON "PatternLink"("fromId", "toId", "relation");
