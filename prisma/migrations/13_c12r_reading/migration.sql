-- C12 reading addendum — "What It All Means to You": the client-facing
-- integrative reading, generated from the three charts only.

-- CreateTable
CREATE TABLE "IntegrativeReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "editedByPractitioner" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrativeReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrativeReading_userId_key" ON "IntegrativeReading"("userId");

-- AddForeignKey
ALTER TABLE "IntegrativeReading" ADD CONSTRAINT "IntegrativeReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
