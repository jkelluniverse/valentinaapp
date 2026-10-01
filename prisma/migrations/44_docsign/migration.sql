-- C21-DOCSIGN: one-off external signature requests, uploaded document
-- files, stored practitioner countersign mark.

ALTER TABLE "AgreementTemplate" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TEXT';

ALTER TABLE "Agreement" ADD COLUMN "recipientEmail" TEXT;
ALTER TABLE "Agreement" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "Agreement" ADD COLUMN "countersignDrawn" TEXT;

CREATE TABLE "AgreementFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "templateId" TEXT,
    "agreementId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgreementFile_templateId_idx" ON "AgreementFile"("templateId");
CREATE INDEX "AgreementFile_agreementId_idx" ON "AgreementFile"("agreementId");
