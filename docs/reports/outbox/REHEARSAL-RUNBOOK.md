# PRE-FREEZE REHEARSAL RUNBOOK — throwaway tenant on production (authorized item 2)

**Status: BLOCKED ON DB ACCESS, reported before minting.** The builder has NO
production database access: the Railway connector redacts variable values (OAuth =
names only), the Railway AI agent confirmed it cannot execute SQL ("I cannot connect
to or query databases directly", quoted 2026-09-16), and no app surface exposes counts
or tenant deletion. C2 (before/after counts per table) and the teardown are therefore
not executable by the builder alone. NOTHING HAS BEEN MINTED.

## The recommended split (no credentials ever enter the session transcript)

**Jacob runs three copy-paste SQL blocks** via `railway connect Postgres` (the Railway
CLI opens a psql shell against the production service; alternatively `railway run
psql $DATABASE_URL` or any client with DATABASE_PUBLIC_URL). **The builder runs the
entire HTTP walk and the email verification.** Alternative (declined unless ordered):
handing the builder DATABASE_PUBLIC_URL puts a production credential into the session
transcript; if that route is chosen anyway, rotate the database password afterward.

### Block 1 — BEFORE counts (Jacob, before the builder mints; paste output back)

```sql
SELECT 'Tenant' t, count(*) FROM "Tenant"
UNION ALL SELECT 'User', count(*) FROM "User"
UNION ALL SELECT 'PractitionerProspect', count(*) FROM "PractitionerProspect"
UNION ALL SELECT 'TenantModule', count(*) FROM "TenantModule"
UNION ALL SELECT 'TenantBilling', count(*) FROM "TenantBilling"
UNION ALL SELECT 'AuditEvent', count(*) FROM "AuditEvent"
UNION ALL SELECT 'null-tenant rows', (
  (SELECT count(*) FROM "User" WHERE "tenantId" IS NULL) +
  (SELECT count(*) FROM "AuditEvent" WHERE "tenantId" IS NULL) +
  (SELECT count(*) FROM "TenantModule" WHERE "tenantId" IS NULL) +
  (SELECT count(*) FROM "TenantBilling" WHERE "tenantId" IS NULL) +
  (SELECT count(*) FROM "PracticeSetting" WHERE "tenantId" IS NULL) +
  (SELECT count(*) FROM "Lead" WHERE "tenantId" IS NULL) +
  (SELECT count(*) FROM "Appointment" WHERE "tenantId" IS NULL));
```

### The builder's walk (after Block 1's output is in hand)

Identical to Jacob's rehearsal, over HTTP, on production:
1. `GET https://valentinavelez.com/join` with JS disabled (multipart post of the SSR
   form) as referrer `jkelluniverse+psf-ref@gmail.com` → thanks screen → capture the
   referral code AS DISPLAYED.
2. `GET /signup?ref=<displayed code>` → mint founder
   `jkelluniverse+psf-founder@gmail.com`, practice "PSF Rehearsal Studio", slug
   `psf-rehearsal`, a fresh throwaway password → welcome screen.
3. `https://psf-rehearsal.psychefolio.com` — root 307 → /book; /book and /login: the
   PRACTICE's brand in page AND tab, zero "veritas"/"Valentina" chrome (C31 observed
   live); credentials sign-in → /practitioner portal 200, ITS brand, ITS tab.
4. The welcome EMAIL (C1): lands at jkelluniverse+psf-founder@gmail.com — the builder
   reads it via the connected Gmail and reports subject, sender identity, and whether
   its links point at psf-rehearsal.psychefolio.com (C27 observed live; note: code
   review predicts the BUTTON url uses the signup host — getBaseUrl() — while the
   paragraph text carries the portal host; observed truth to be reported either way).
5. C3: any break → STOP, report, tear down only after the Architect has seen it.

### Block 2 — teardown (Jacob, ONLY after the builder reports the walk green)

Dependency order = the same shape signup's own rollbackTenant uses:

```sql
BEGIN;
DELETE FROM "PracticeSetting" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal');
DELETE FROM "AuditEvent"      WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal');
DELETE FROM "TenantBilling"   WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal');
DELETE FROM "TenantModule"    WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal');
DELETE FROM "User"            WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal');
DELETE FROM "Tenant"          WHERE slug='psf-rehearsal';
DELETE FROM "PractitionerProspect" WHERE email IN ('jkelluniverse+psf-ref@gmail.com','jkelluniverse+psf-founder@gmail.com');
COMMIT;
```

### Block 3 — AFTER counts + null-tenant invariant (Jacob; paste output back)

Re-run Block 1 verbatim. Every table count must equal its BEFORE value, and
'null-tenant rows' must be 0 — that is tenant-stamp-audit's invariant expressed as
read-only SQL (the gate itself refuses nothing here, but it cannot be pointed at
production without its DATABASE_URL, same access gap).

## Notes of record
- The welcome email is ONE real send (production has RESEND_API_KEY +
  NOTIFY_FROM_EMAIL, so emailConfigured() is TRUE), to a +tag on Jacob's own address
  per C1. The engage gate stays CLOSED; nothing else mails.
- No Stripe object is created (FOUNDING_COMP, NULL stripe ids — asserted in Block 1/3
  counts staying equal on TenantBilling after teardown, and by C30's gate logic).
- The C26 stale-resolution cache (60s TTL) means psf-rehearsal.psychefolio.com may
  serve the tenant for up to ~60s after teardown — expected, documented, expires.
