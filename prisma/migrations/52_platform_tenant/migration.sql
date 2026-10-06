-- P4 item 5 (rulings 82 / 133) — THE PLATFORM'S OWN TENANT ROW.
--
-- WHAT IT IS FOR, and it is exactly one thing: an ATTRIBUTION TARGET. Platform
-- activity — a founding-partner capture on psychefolio.com, an engage marketing
-- send, an engage unsubscribe — has always been recorded as tenant #1's data,
-- because AuditEvent.tenantId is required and the only tenant in existence was
-- hers. That is ruling 82, and it made the platform's own marketing look like
-- Valentina's practice data.
--
-- IT IS NOT A PRACTICE AND MUST NEVER RESOLVE FROM A HOST. status = 'PLATFORM'
-- is the marker both resolvers refuse on (lib/tenancy/index.ts and
-- lib/prisma.ts), and audits/platform-tenant-verify.ts proves no host can reach
-- it. The guard is in CODE rather than in the slug's shape on purpose: Railway's
-- wildcard *.psychefolio.com matches whatever Host a caller sends, so a slug
-- chosen to be "un-typeable" is not a guarantee — a crafted Host header would
-- still produce it. A status check cannot be spoofed by a header.
--
-- It carries no modules, no billing row, no domain mapping, and no users. If it
-- ever acquires any of those, something has started treating it as a practice.

INSERT INTO "Tenant" ("id", "slug", "displayName", "status", "layoutKey", "skinKey", "branding", "featureFlags")
VALUES (
  'tnt_platform_00000000001',
  '__platform__',
  'Psychefolio',
  'PLATFORM',
  'journey-v1',
  'warm-clay',
  '{}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT ("slug") DO NOTHING;
