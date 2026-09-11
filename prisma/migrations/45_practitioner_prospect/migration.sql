-- C23-SIGNUP §1 — the practitioner-prospect ledger (the front door's people
-- list). Platform-level, not practice-scoped: no tenant scope column. The
-- `tenantId` here is the tenant the prospect came to OWN, set on conversion.

CREATE TYPE "ProspectStatus" AS ENUM ('LEAD', 'SIGNED_UP', 'DECLINED');

CREATE TABLE "PractitionerProspect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "practiceName" TEXT,
    "note" TEXT,
    "status" "ProspectStatus" NOT NULL DEFAULT 'LEAD',
    "source" TEXT,
    "referredByCode" TEXT,
    "referralCode" TEXT NOT NULL,
    "tenantId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PractitionerProspect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PractitionerProspect_email_key" ON "PractitionerProspect"("email");
CREATE UNIQUE INDEX "PractitionerProspect_referralCode_key" ON "PractitionerProspect"("referralCode");
CREATE INDEX "PractitionerProspect_status_createdAt_idx" ON "PractitionerProspect"("status", "createdAt");
