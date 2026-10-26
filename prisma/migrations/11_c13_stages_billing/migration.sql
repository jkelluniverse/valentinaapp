-- C13 — program stages, the billing ledger, and Square linkage.

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN "stage" TEXT;

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('DUE', 'PENDING', 'PAID', 'REFUNDED', 'WAIVED', 'CANCELED');

-- CreateTable
CREATE TABLE "StageChange" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stage" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'SESSION',
    "sessionsIncluded" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "priceBookId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ChargeStatus" NOT NULL DEFAULT 'DUE',
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidVia" TEXT,
    "squarePaymentId" TEXT,
    "squareInvoiceId" TEXT,
    "lastActionById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquareCustomerLink" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "squareCustomerId" TEXT NOT NULL,
    "cardOnFile" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SquareCustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPayment" (
    "id" TEXT NOT NULL,
    "squarePaymentId" TEXT NOT NULL,
    "squareCustomerId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedChargeId" TEXT,

    CONSTRAINT "ExternalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StageChange_clientId_changedAt_idx" ON "StageChange"("clientId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_appointmentId_key" ON "Charge"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_squarePaymentId_key" ON "Charge"("squarePaymentId");

-- CreateIndex
CREATE INDEX "Charge_clientId_status_idx" ON "Charge"("clientId", "status");

-- CreateIndex
CREATE INDEX "Charge_status_dueAt_idx" ON "Charge"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "SquareCustomerLink_clientId_key" ON "SquareCustomerLink"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SquareCustomerLink_squareCustomerId_key" ON "SquareCustomerLink"("squareCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPayment_squarePaymentId_key" ON "ExternalPayment"("squarePaymentId");
