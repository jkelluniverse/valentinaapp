-- Reading full-page view: one-tap "send to client" notification timestamp.
ALTER TABLE "IntegrativeReading" ADD COLUMN "clientNotifiedAt" TIMESTAMP(3);
