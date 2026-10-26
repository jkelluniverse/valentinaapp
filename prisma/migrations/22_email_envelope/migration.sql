-- 22 — EMAIL-SPEC: auto-sent invites (send state + her personal note) and the
-- 24h session reminder's once-only marker.
ALTER TABLE "Invite" ADD COLUMN "personalNote" TEXT;
ALTER TABLE "Invite" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Invite" ADD COLUMN "emailSentAt" TIMESTAMP(3);
ALTER TABLE "Invite" ADD COLUMN "emailError" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
