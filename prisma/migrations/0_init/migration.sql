-- Baseline migration: represents the C0 schema already present in the
-- production database (created earlier with `prisma db push`). On the existing
-- Railway database this migration is marked as already applied
-- (`prisma migrate resolve --applied 0_init`) so it is never re-run there.
-- On a fresh database it recreates the C0 starting point.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PRACTITIONER', 'CLIENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
