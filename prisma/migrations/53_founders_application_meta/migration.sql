-- C35-FOUNDERS-EVENT — the founding application's extra answers.
--
-- ADDITIVE ONLY: one nullable JSONB column. No existing column is altered,
-- renamed, retyped or dropped, so every row that exists keeps exactly the shape
-- it has and every gate covering the capture pipeline is unaffected.
ALTER TABLE "PractitionerProspect" ADD COLUMN IF NOT EXISTS "applicationMeta" JSONB;
