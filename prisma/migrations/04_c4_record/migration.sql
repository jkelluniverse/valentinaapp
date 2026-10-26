-- C4 — Longitudinal client record.
-- One write-through timeline (RecordItem) that every feature appends to via
-- the record service. Denormalized snapshots; source rows remain the truth.

-- CreateEnum
CREATE TYPE "RecordKind" AS ENUM ('LOG_ENTRY', 'PROMPT_RESPONSE', 'WORKSHEET_RESPONSE', 'COURSE_ACTIVITY', 'NOTE');

-- CreateTable
CREATE TABLE "RecordItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "mood" INTEGER,
    "tags" TEXT[],
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordItem_sourceType_sourceId_key" ON "RecordItem"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "RecordItem_clientId_occurredAt_idx" ON "RecordItem"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "RecordItem_clientId_kind_idx" ON "RecordItem"("clientId", "kind");

-- AddForeignKey
ALTER TABLE "RecordItem" ADD CONSTRAINT "RecordItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
