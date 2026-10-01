-- C23-REFERRAL §1 — attribution is DERIVED from PractitionerProspect
-- (referredByCode + status/tenantId), never from a parallel ledger. Every
-- referral count is therefore a lookup by the referrer's code, so that column
-- gets the index it needs.

CREATE INDEX "PractitionerProspect_referredByCode_idx" ON "PractitionerProspect"("referredByCode");
