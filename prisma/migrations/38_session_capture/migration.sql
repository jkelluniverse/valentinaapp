-- SESSION-PIPELINE Phase 1 — the capture job container. Additive only.

CREATE TYPE "CaptureSource" AS ENUM ('UPLOAD', 'PORTAL_RECORDER', 'EMAIL_IN', 'SHARE');
CREATE TYPE "CaptureStatus" AS ENUM ('AWAITING_CLIENT', 'AWAITING_CONSENT', 'TRANSCRIBING', 'EXTRACTING', 'REVIEW', 'MERGED', 'DISCARDED', 'ERROR');

CREATE TABLE "SessionCapture" (
    "tenantId" TEXT,
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "clientId" TEXT,
    "source" "CaptureSource" NOT NULL,
    "status" "CaptureStatus" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "audioKey" TEXT,
    "audioMime" TEXT,
    "audioBytes" INTEGER,
    "audioDeletedAt" TIMESTAMP(3),
    "providerJobId" TEXT,
    "draftId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionCapture_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionCapture_providerJobId_key" ON "SessionCapture"("providerJobId");
CREATE UNIQUE INDEX "SessionCapture_draftId_key" ON "SessionCapture"("draftId");
CREATE INDEX "SessionCapture_tenantId_status_createdAt_idx" ON "SessionCapture"("tenantId", "status", "createdAt");
