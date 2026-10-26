-- C11 — Client profile, intake designation, and Human Design chart.
-- Birth data is sensitive PII; charts are computed in-house from it.

-- AlterTable
ALTER TABLE "Worksheet" ADD COLUMN "isIntake" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredName" TEXT,
    "pronouns" TEXT,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "birthTime" TEXT,
    "birthTimeUnknown" BOOLEAN NOT NULL DEFAULT false,
    "birthPlace" TEXT,
    "birthLat" DOUBLE PRECISION,
    "birthLng" DOUBLE PRECISION,
    "birthTz" TEXT,
    "intakeCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanDesignChart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT,
    "strategy" TEXT,
    "authority" TEXT,
    "profile" TEXT,
    "definition" TEXT,
    "centers" JSONB,
    "channels" JSONB,
    "gates" JSONB,
    "variables" JSONB,
    "bodygraphSvg" TEXT,
    "raw" JSONB,
    "inputHash" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accuracyNote" TEXT,

    CONSTRAINT "HumanDesignChart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanDesignChart_userId_key" ON "HumanDesignChart"("userId");

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanDesignChart" ADD CONSTRAINT "HumanDesignChart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
