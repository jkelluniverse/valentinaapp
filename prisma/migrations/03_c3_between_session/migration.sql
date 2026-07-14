-- C3 — Between-session support.
-- Practitioner-authored library (Prompt), manual assignment to a client
-- (Assignment; scheduleRule nullable — recurring delivery deferred), and the
-- client's answer (PromptResponse, shaped like a C2 entry for C4/C5).

-- CreateEnum
CREATE TYPE "PromptKind" AS ENUM ('PROMPT', 'EXERCISE', 'CHECK_IN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "kind" "PromptKind" NOT NULL DEFAULT 'PROMPT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "scheduleRule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptResponse" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "body" TEXT,
    "mood" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_clientId_status_idx" ON "Assignment"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromptResponse_assignmentId_key" ON "PromptResponse"("assignmentId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptResponse" ADD CONSTRAINT "PromptResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
