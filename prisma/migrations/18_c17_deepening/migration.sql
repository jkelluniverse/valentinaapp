-- C17 — The Deepening: one optional door per kept reflection, safety-first.

-- CreateTable
CREATE TABLE "EntryDeepening" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "door" TEXT,
    "question" TEXT,
    "pacing" TEXT NOT NULL DEFAULT 'settled',
    "routeToSession" BOOLEAN NOT NULL DEFAULT false,
    "groundingNote" TEXT,
    "connectionItemId" TEXT,
    "connectionLine" TEXT,
    "answer" TEXT,
    "answeredNodeId" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "crisis" BOOLEAN NOT NULL DEFAULT false,
    "crisisCleared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "EntryDeepening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntryDeepening_entryId_key" ON "EntryDeepening"("entryId");
CREATE INDEX "EntryDeepening_clientId_createdAt_idx" ON "EntryDeepening"("clientId", "createdAt");
