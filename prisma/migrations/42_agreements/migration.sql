-- C20-AGREEMENTS — templates, agreements, append-only audit events
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED', 'VOIDED');

CREATE TABLE "AgreementTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "slug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requiresCountersign" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sendOnInviteAccept" BOOLEAN NOT NULL DEFAULT false,
    "requireBeforeBooking" BOOLEAN NOT NULL DEFAULT false,
    "sendOnPackagePurchase" BOOLEAN NOT NULL DEFAULT false,
    "sendOnRecordingConsent" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgreementTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgreementTemplate_tenantId_slug_version_locale_key" ON "AgreementTemplate"("tenantId", "slug", "version", "locale");

CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "templateId" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "titleSnapshot" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "mergeData" JSONB NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "disclosureShownAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerDrawn" TEXT,
    "signerIp" TEXT,
    "signerAgent" TEXT,
    "countersignRequired" BOOLEAN NOT NULL DEFAULT false,
    "countersignedAt" TIMESTAMP(3),
    "countersignName" TEXT,
    "declinedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "paperSignedAt" TIMESTAMP(3),
    "sealedKey" TEXT,
    "sealedSha256" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Agreement_tokenHash_key" ON "Agreement"("tokenHash");
CREATE INDEX "Agreement_tenantId_clientId_idx" ON "Agreement"("tenantId", "clientId");
CREATE INDEX "Agreement_tenantId_status_idx" ON "Agreement"("tenantId", "status");

CREATE TABLE "AgreementEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "agreementId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "meta" JSONB,
    CONSTRAINT "AgreementEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgreementEvent_agreementId_at_idx" ON "AgreementEvent"("agreementId", "at");
