-- C5 — Synthesis pipeline (session prep).
-- Adds explicit AI-review consent on User and the SessionPrep store, which is
-- both the practitioner-only formulation and the audit record.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "aiConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessionPrep" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopeFrom" TIMESTAMP(3),
    "scopeTo" TIMESTAMP(3),
    "model" TEXT NOT NULL,
    "referralFlag" BOOLEAN NOT NULL DEFAULT false,
    "output" JSONB NOT NULL,
    "practitionerNotes" TEXT,

    CONSTRAINT "SessionPrep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionPrep_clientId_createdAt_idx" ON "SessionPrep"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionPrep" ADD CONSTRAINT "SessionPrep_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
