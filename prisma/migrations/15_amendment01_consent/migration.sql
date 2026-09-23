-- AMENDMENT-01 — Unified Consent: one versioned global grant, the single gate.

-- CreateTable
CREATE TABLE "ConsentGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentGrant_userId_version_key" ON "ConsentGrant"("userId", "version");

-- AddForeignKey
ALTER TABLE "ConsentGrant" ADD CONSTRAINT "ConsentGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (AMENDMENT-01 §5): every client who already consented gets a grant
-- for the LEGACY version — a faithful record of what they agreed to then. It
-- does NOT satisfy the CURRENT-version check, so each is re-asked exactly once
-- on next sign-in, then never again.
INSERT INTO "ConsentGrant" ("id", "userId", "version", "grantedAt")
SELECT 'legacy-' || "id", "id", 'legacy', COALESCE("consentAt", CURRENT_TIMESTAMP)
FROM "User"
WHERE "consentAt" IS NOT NULL;
