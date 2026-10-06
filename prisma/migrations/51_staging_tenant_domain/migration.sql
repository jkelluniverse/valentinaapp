-- PLATFORM SPLIT P3.3 — the STAGING host, mapped before the fallback is removed.
--
-- WHY THIS MIGRATION EXISTS AND WHY IT IS NOT OPTIONAL. P3.3 removes the
-- host-pattern DEFAULT: a host with no TenantDomain row and no
-- {slug}.$PLATFORM_DOMAIN shape now resolves to NOTHING. Railway's staging
-- service is reached at valentinaapp-staging.up.railway.app, which is neither.
-- Without this row, the first deploy of P3.3 turns every public page on staging
-- into the /unavailable 503 — and staging is where rulings 48/62 say the
-- serving tip gets verified, so the verification surface would go down in the
-- same push that needed verifying.
--
-- THIS IS TRUE DATA, NOT A REINSTATED FALLBACK. That host really does serve
-- tenant #1's staging clone; saying so in the mapping is a statement of fact of
-- exactly the same kind as valentinavelez.com in migration 50. The row is inert
-- in production, where that name never arrives.
--
-- Deliberately NOT seeded here, for the same reason as www.valentinavelez.com
-- in migration 50: psychefolio.com and www.psychefolio.com. The platform's own
-- host must resolve to NO practice — that is P2/P3's entire point (ruling 83).
-- Mapping it would hand the platform's apex back to tenant #1 and undo the
-- split in one row.
--
-- Idempotent: ON CONFLICT DO NOTHING, so a replay over a database where the
-- host was already mapped by hand is a no-op rather than a failed deploy.

INSERT INTO "TenantDomain" ("id", "host", "tenantId")
VALUES ('td_valentina_staging0001', 'valentinaapp-staging.up.railway.app', 'tnt_valentina_000000001')
ON CONFLICT ("host") DO NOTHING;
