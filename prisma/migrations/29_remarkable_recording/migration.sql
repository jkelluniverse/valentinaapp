-- C14-REMARKABLE (handwritten session notes) + C19 scaffold (session
-- recording, consent-first).

ALTER TABLE "PsycheNode" ADD COLUMN "evidenceNoteIds" TEXT[];
ALTER TABLE "PsycheNode" ADD COLUMN "evidenceTranscriptRefs" TEXT[];
ALTER TABLE "Appointment" ADD COLUMN "recordingConfirmed" BOOLEAN;

CREATE TABLE "HandwrittenNote" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'EMAIL',
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT,
    "pdf" BYTEA NOT NULL,
    "transcript" TEXT,
    "transcriptModel" TEXT,
    "matchedClientId" TEXT,
    "matchedAppointmentId" TEXT,
    "matchConfidence" TEXT,
    "appliedNoteId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HandwrittenNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HandwrittenNote_appliedNoteId_key" ON "HandwrittenNote"("appliedNoteId");
CREATE INDEX "HandwrittenNote_status_receivedAt_idx" ON "HandwrittenNote"("status", "receivedAt");

CREATE TABLE "RecordingConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "textSnapshot" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "RecordingConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecordingConsent_clientId_key" ON "RecordingConsent"("clientId");

CREATE TABLE "RecordingDraft" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "matchedClientId" TEXT,
    "matchedAppointmentId" TEXT,
    "matchConfidence" TEXT,
    "appliedTranscriptId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecordingDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecordingDraft_providerRef_key" ON "RecordingDraft"("providerRef");
CREATE UNIQUE INDEX "RecordingDraft_appliedTranscriptId_key" ON "RecordingDraft"("appliedTranscriptId");
CREATE INDEX "RecordingDraft_status_receivedAt_idx" ON "RecordingDraft"("status", "receivedAt");

CREATE TABLE "SessionTranscript" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "audioRef" TEXT,
    "summary" TEXT,
    "segments" JSONB NOT NULL,
    "redactedCount" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "noteId" TEXT,
    "crisisFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionTranscript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionTranscript_appointmentId_key" ON "SessionTranscript"("appointmentId");
CREATE UNIQUE INDEX "SessionTranscript_noteId_key" ON "SessionTranscript"("noteId");
CREATE INDEX "SessionTranscript_clientId_createdAt_idx" ON "SessionTranscript"("clientId", "createdAt");
