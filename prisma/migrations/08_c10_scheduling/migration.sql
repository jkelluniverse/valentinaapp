-- C10 — Scheduling & Sessions.
-- Per-practitioner availability config, recurring weekly rules, one-off
-- exceptions, and client appointments. Times are UTC; the practitioner tz
-- lives on SchedulingConfig. Everything keys by practitionerId.

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SessionLocation" AS ENUM ('VIRTUAL', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('BLOCK', 'OPEN');

-- CreateTable
CREATE TABLE "SchedulingConfig" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 50,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 10,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 12,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
    "cancelCutoffHours" INTEGER NOT NULL DEFAULT 24,
    "defaultVideoUrl" TEXT,
    "calendarFeedSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "reason" TEXT,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "location" "SessionLocation" NOT NULL DEFAULT 'VIRTUAL',
    "videoProvider" TEXT,
    "videoUrl" TEXT,
    "videoRoomId" TEXT,
    "bookedBy" TEXT NOT NULL,
    "clientNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingConfig_practitionerId_key" ON "SchedulingConfig"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingConfig_calendarFeedSecret_key" ON "SchedulingConfig"("calendarFeedSecret");

-- CreateIndex
CREATE INDEX "AvailabilityRule_practitionerId_weekday_idx" ON "AvailabilityRule"("practitionerId", "weekday");

-- CreateIndex
CREATE INDEX "AvailabilityException_practitionerId_date_idx" ON "AvailabilityException"("practitionerId", "date");

-- CreateIndex
CREATE INDEX "Appointment_practitionerId_startAt_idx" ON "Appointment"("practitionerId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_clientId_startAt_idx" ON "Appointment"("clientId", "startAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
