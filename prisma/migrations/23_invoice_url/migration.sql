-- 23 — invoices are delivered by OUR branded email (Square hosts only the pay
-- page); keep the hosted URL for the email button and re-sends.
ALTER TABLE "Charge" ADD COLUMN "squareInvoiceUrl" TEXT;
