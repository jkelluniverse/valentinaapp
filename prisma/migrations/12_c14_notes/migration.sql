-- C14 — The Margins: practitioner-only notes and their AI connection-scans.

-- CreateEnum
CREATE TYPE "NoteDepth" AS ENUM ('JOT', 'NOTE');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('OPEN', 'ELABORATED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "fromNoteId" TEXT;

-- AlterTable
ALTER TABLE "WorksheetAssignment" ADD COLUMN "fromNoteId" TEXT;

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "depth" "NoteDepth" NOT NULL DEFAULT 'JOT',
    "status" "NoteStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "linkedRecordItemIds" TEXT[],
    "parentNoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteScan" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "connections" JSONB NOT NULL,
    "referralFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_clientId_createdAt_idx" ON "Note"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_authorId_depth_status_idx" ON "Note"("authorId", "depth", "status");

-- CreateIndex
CREATE INDEX "NoteScan_noteId_createdAt_idx" ON "NoteScan"("noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteScan" ADD CONSTRAINT "NoteScan_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
