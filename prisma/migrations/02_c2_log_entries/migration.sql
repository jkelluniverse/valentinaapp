-- C2 — Self-awareness log.
-- Adds the LogEntry table: a client's own moments of awareness.

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('TRIGGER', 'INSIGHT', 'PROGRESS', 'REFLECTION');

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "EntryType" NOT NULL DEFAULT 'REFLECTION',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "trigger" TEXT,
    "mood" INTEGER,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEntry_clientId_occurredAt_idx" ON "LogEntry"("clientId", "occurredAt");

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
