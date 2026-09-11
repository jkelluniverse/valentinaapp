-- CreateEnum
CREATE TYPE "AppointmentKind" AS ENUM ('SESSION', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('SESSION', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'SCHEDULED', 'COMPLETED', 'CONVERTED', 'CLOSED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "kind" "AppointmentKind" NOT NULL DEFAULT 'SESSION',
ALTER COLUMN "clientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AvailabilityRule" ADD COLUMN     "kind" "AvailabilityKind" NOT NULL DEFAULT 'SESSION';

-- AlterTable
ALTER TABLE "SchedulingConfig" ADD COLUMN     "discoveryMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "discoveryVideoUrl" TEXT;

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "appointmentId" TEXT,
    "convertedUserId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_appointmentId_key" ON "Lead"("appointmentId");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

