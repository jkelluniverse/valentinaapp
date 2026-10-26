-- C12 — Integrative Profile Engine: shared birth-data core, pluggable lens
-- results, the synthesis profile, and practice-wide settings.

-- AlterTable
ALTER TABLE "Worksheet" ADD COLUMN "isSpiral" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BirthChartCore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personality" JSONB NOT NULL,
    "design" JSONB NOT NULL,
    "incarnationCross" TEXT,
    "spheres" JSONB,
    "provider" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthChartCore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lens" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "contentRef" TEXT,
    "practitionerReviewed" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LensResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrativeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "synthesis" JSONB NOT NULL,
    "narrative" TEXT,
    "version" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrativeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "BirthChartCore_userId_key" ON "BirthChartCore"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LensResult_userId_lens_key" ON "LensResult"("userId", "lens");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrativeProfile_userId_key" ON "IntegrativeProfile"("userId");

-- AddForeignKey
ALTER TABLE "BirthChartCore" ADD CONSTRAINT "BirthChartCore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensResult" ADD CONSTRAINT "LensResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrativeProfile" ADD CONSTRAINT "IntegrativeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
