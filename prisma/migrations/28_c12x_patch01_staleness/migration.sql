-- C12X-PATCH-01 §2 — staleness, not schedules: each generated artifact keeps
-- an inputs fingerprint, and prior versions append instead of vanishing.

ALTER TABLE "IntegrationGuide" ADD COLUMN "fingerprint" JSONB;
ALTER TABLE "IntegrativeProfile" ADD COLUMN "fingerprint" JSONB;

CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArtifactVersion_clientId_artifactType_createdAt_idx"
    ON "ArtifactVersion"("clientId", "artifactType", "createdAt");
