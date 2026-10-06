-- BILLING-DASH — "Send renewal email" one-tap: remember when it went out so
-- the dashboard can say "sent Jul 18 · no purchase yet" and never double-nudge
-- silently.
ALTER TABLE "Package" ADD COLUMN "renewalEmailSentAt" TIMESTAMP(3);
