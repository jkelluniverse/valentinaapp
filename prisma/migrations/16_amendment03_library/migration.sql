-- AMENDMENT-03 — The Library, as Folders. Tables only; the four default folders
-- and auto-filing of existing worksheets/prompts/courses are seeded idempotently
-- by lib/library.ts on first load (so new studio content self-files too).

-- CreateTable
CREATE TABLE "LibraryFolder" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "fileKey" TEXT,
    "url" TEXT,
    "body" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryFolder_practitionerId_parentId_order_idx" ON "LibraryFolder"("practitionerId", "parentId", "order");

-- CreateIndex
CREATE INDEX "LibraryItem_folderId_order_idx" ON "LibraryItem"("folderId", "order");
