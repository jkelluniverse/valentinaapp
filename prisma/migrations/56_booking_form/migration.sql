-- C42-PRACTITIONER-FORMS (rulings 225, 234). ADDITIVE ONLY.
--
-- One flag, the isIntake precedent (C11): the worksheet that IS the booking
-- form's questions. At most one per practice — enforced by the same clear-
-- then-set transaction the intake flag uses, not by a constraint, because
-- Worksheet rows are tenant-scoped and a partial unique index on a nullable
-- tenantId would not say what "one per practice" means for legacy rows.
-- Default false: every existing worksheet is unchanged, every practice keeps
-- today's form until it opens the builder.
ALTER TABLE "Worksheet" ADD COLUMN IF NOT EXISTS "isBooking" BOOLEAN NOT NULL DEFAULT false;
