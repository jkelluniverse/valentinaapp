-- BILLING Phase B3 — Layer 2 tenant subscriptions (Stripe)
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');

CREATE TABLE "TenantBilling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "plan" TEXT NOT NULL,
    "status" "BillingStatus" NOT NULL,
    "graceUntil" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),

    CONSTRAINT "TenantBilling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantBilling_tenantId_key" ON "TenantBilling"("tenantId");
CREATE UNIQUE INDEX "TenantBilling_stripeCustomerId_key" ON "TenantBilling"("stripeCustomerId");
