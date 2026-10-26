-- A reviewed-and-dismissed external payment stops appearing in "Worth a look".
ALTER TABLE "ExternalPayment" ADD COLUMN "dismissedAt" TIMESTAMP(3);
