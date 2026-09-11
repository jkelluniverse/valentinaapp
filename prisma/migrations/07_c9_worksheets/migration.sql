-- C9 — Worksheet Studio.
-- Structured worksheets (typed-field JSON schema), assignment to clients, and
-- structured responses that feed the record.

-- CreateTable
CREATE TABLE "Worksheet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "schema" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worksheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorksheetAssignment" (
    "id" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorksheetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorksheetResponse" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorksheetResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorksheetAssignment_clientId_status_idx" ON "WorksheetAssignment"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorksheetResponse_assignmentId_key" ON "WorksheetResponse"("assignmentId");

-- AddForeignKey
ALTER TABLE "WorksheetAssignment" ADD CONSTRAINT "WorksheetAssignment_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksheetAssignment" ADD CONSTRAINT "WorksheetAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksheetResponse" ADD CONSTRAINT "WorksheetResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorksheetAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
