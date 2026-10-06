-- PLATFORM Phase 2 — her three panels render through the module registry.
-- The exact copy her clients see today moves into TenantModule.settings
-- (the practitioner's words are data, Rule 0.4); components keep only
-- neutral defaults. Idempotent: jsonb concatenation overwrites the key.

UPDATE "TenantModule"
SET "settings" = "settings" || '{"panel": {"heading": "Your Gene Keys", "sub": "Read from the same birth moment — eleven spheres to contemplate slowly, one at a time, rather than all at once."}}'::jsonb
WHERE "id" = 'tm_valentina_archkeys001';

UPDATE "TenantModule"
SET "settings" = "settings" || '{"panel": {"heading": "Your values snapshot", "sub": "From your own reflections — where your energy tends to live these days.", "pending": "Your values reflection is in — Valentina is looking at it, and it''ll appear here once she has."}}'::jsonb
WHERE "id" = 'tm_valentina_valspiral01';
