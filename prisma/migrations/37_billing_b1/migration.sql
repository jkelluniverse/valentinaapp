-- CLAUDE-BILLING Phase B1 — Layer 1 foundation: connected payment accounts
-- (Square OAuth), payment references, webhook idempotency. Additive only.

CREATE TYPE "ConnAccountStatus" AS ENUM ('CONNECTED', 'NEEDS_RECONNECT', 'REVOKED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'FAILED');

CREATE TABLE "ConnectedPaymentAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT,
    "locationId" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "scopes" TEXT[],
    "status" "ConnAccountStatus" NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "ConnectedPaymentAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConnectedPaymentAccount_tenantId_key" ON "ConnectedPaymentAccount"("tenantId");

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "clientId" TEXT,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purpose" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE INDEX "Payment_tenantId_clientId_idx" ON "Payment"("tenantId", "clientId");

CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
