# PRE-FREEZE REHEARSAL RUNBOOK — throwaway tenant on production (authorized item 2)

**Status (2026-09-16): WALK EXECUTED — W1–W4 green, W5 failed → C32; the
psf-rehearsal tenant STANDS until C32's V12 passes against it. Block 1 ran
(baseline in BUILD-STATE); mid-state counts are in; Block 1.5 (below) is the next
thing Jacob runs. Blocks 2/3 wait for the Architect's dispatch.** Original
blocked-state record, kept for the timeline: the builder has NO production database
access — the Railway connector redacts variable values (OAuth = names only), the
Railway AI agent confirmed it cannot execute SQL ("I cannot connect to or query
databases directly", quoted 2026-09-16), and no app surface exposes counts or
tenant deletion — so all SQL runs in the Railway dashboard's Query tab, by Jacob
(rulings 73/75).

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

### Block 1.5 — AuditEvent enumeration (Jacob, read-only; gates the teardown design)

Mid-state showed AuditEvent 0 → 6 against the builder's prediction of +1. The
prediction was WRONG at the code level: the walk writes TWO audit rows, not one —
the builder missed W1's `prospect-capture` row (lib/prospect-capture.ts:139). And
that row does NOT key to psf-rehearsal: capture uses the SCOPED client, so its
audit row is stamped with the REQUEST's tenant — W1 ran on valentinavelez.com/join,
so it keys to VALENTINA's tenant BY DESIGN (the row records where the lead was
captured; capture never touches any other tenant's data). The remaining 4 rows are
not attributable from code alone. Candidates, each distinguishable in the output:
`engage-message` rows (the engage tick records every send DECISION — including
gate-closed SKIPs — keyed to the DEFAULT tenant; only fires if something calls
/api/jobs/tick with JOBS_SECRET), organic /join traffic (a real lead — must NOT be
torn down), or Valentina's own portal activity (real business data — must NOT be
torn down). Run both queries, paste the output back:

```sql
-- 1: every AuditEvent row, attributed three ways (tenant slug; actor as user;
--    actor as prospect). meta is law-#6 metadata only (ids/flags, never content).
SELECT a."createdAt", a.action, a.reason,
       coalesce(t.slug, '(null)') AS tenant_slug,
       u.email AS actor_as_user,
       p.email AS actor_as_prospect,
       a.meta
FROM "AuditEvent" a
LEFT JOIN "Tenant" t ON t.id = a."tenantId"
LEFT JOIN "User" u ON u.id = a."actorId"
LEFT JOIN "PractitionerProspect" p ON p.id = a."actorId"
ORDER BY a."createdAt" ASC;
```

```sql
-- 2: which rows are REHEARSAL-CAUSED (keyed to psf-rehearsal, or acted by one of
--    the two rehearsal identities) vs not. Any row with all three flags false is
--    real production data and the teardown must not touch it.
SELECT a."createdAt", a.action,
       a."tenantId" = (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal') AS keyed_to_psf,
       a."actorId" IN (SELECT id FROM "PractitionerProspect" WHERE email IN
         ('jkelluniverse+psf-ref@gmail.com','jkelluniverse+psf-founder@gmail.com')) AS actor_is_rehearsal_prospect,
       a."actorId" IN (SELECT id FROM "User" WHERE "tenantId" =
         (SELECT id FROM "Tenant" WHERE slug='psf-rehearsal')) AS actor_is_rehearsal_user
FROM "AuditEvent" a
ORDER BY a."createdAt" ASC;
```

**Consequence for Block 2 as written:** it deletes AuditEvent by psf-rehearsal
tenantId only, so it provably leaves at least W1's capture row behind (Valentina-
keyed, rehearsal-caused) and Block 3 would NOT return AuditEvent to 0. The
corrected Block 2 below adds one DELETE keyed to the rehearsal prospect ids,
placed BEFORE the prospect delete (the subquery needs the rows still present).
Expected DELETE counts stay provisional until Block 1.5's output is in; the
builder re-issues the final expectation line then.

### Block 2 — teardown (Jacob, ONLY after the builder reports the walk green
### AND Block 1.5's enumeration has been reconciled — CORRECTED, supersedes the
### original; the added line is the AuditEvent-by-actor delete)

Dependency order = the same shape signup's own rollbackTenant uses:

```sql
WITH t AS (
  SELECT id FROM "Tenant" WHERE slug = 'psf-rehearsal'
), p AS (
  SELECT id FROM "PractitionerProspect"
  WHERE email IN ('jkelluniverse+psf-ref@gmail.com','jkelluniverse+psf-founder@gmail.com')
), d_setting AS (
  DELETE FROM "PracticeSetting" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1
), d_audit_tenant AS (
  DELETE FROM "AuditEvent" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1
), d_audit_actor AS (
  DELETE FROM "AuditEvent" WHERE "actorId" IN (SELECT id FROM p) RETURNING 1
), d_billing AS (
  DELETE FROM "TenantBilling" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1
), d_module AS (
  DELETE FROM "TenantModule" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1
), d_domain AS (
  DELETE FROM "TenantDomain" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1
), d_user AS (
  DELETE FROM "User" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1
), d_tenant AS (
  DELETE FROM "Tenant" WHERE id IN (SELECT id FROM t) RETURNING 1
), d_prospect AS (
  DELETE FROM "PractitionerProspect" WHERE id IN (SELECT id FROM p) RETURNING 1
)
SELECT
  (SELECT count(*) FROM d_setting)      AS practice_setting,
  (SELECT count(*) FROM d_audit_tenant) AS audit_by_tenant,
  (SELECT count(*) FROM d_audit_actor)  AS audit_by_actor,
  (SELECT count(*) FROM d_billing)      AS tenant_billing,
  (SELECT count(*) FROM d_module)       AS tenant_module,
  (SELECT count(*) FROM d_domain)       AS tenant_domain,
  (SELECT count(*) FROM d_user)         AS users,
  (SELECT count(*) FROM d_tenant)       AS tenants,
  (SELECT count(*) FROM d_prospect)     AS prospects;
```

**Why this shape (ruling 116).** The Railway Query tab accepts ONE statement and
appends `LIMIT` to it: a `BEGIN; … COMMIT;` block is rejected, and a bare `DELETE`
chokes on the appended `LIMIT`. This is one statement whose data-modifying CTEs do
every delete and whose final `SELECT` reports the counts — so the appended `LIMIT`
lands on the SELECT harmlessly.

**It is atomic by construction and SAFER than the block it replaces.** A single
statement either applies completely or not at all, so there is no half-torn-down
tenant to recover from. Foreign-key checks fire at end of statement, after every CTE
has run, which is why parent and children can go in one statement.

**EXPECTED** (one row): `practice_setting 1 · audit_by_tenant 1 · audit_by_actor 1 ·
tenant_billing 1 · tenant_module 3 · tenant_domain 0 · users 1 · tenants 1 ·
prospects 2`. `tenant_domain 0` is correct — psf-rehearsal resolves by host pattern
and never had a mapping row; the clause is defensive. **Any other numbers: send them
before doing anything else.** Nothing is left half-done, so there is no rush to fix.

**If it errors on a foreign key**, that is the statement refusing to leave orphans:
some table not listed here still references the tenant. Send the error verbatim — do
NOT start deleting the named table by hand.

Provisional expected counts (FINAL numbers wait on Block 1.5's output; ROLLBACK on
any surprise stands): PracticeSetting 1 · AuditEvent-by-tenant ≥1 (the
practitioner-signup row; plus any engage rows that turn out psf-keyed — none
expected) · AuditEvent-by-actor ≥1 (W1's capture row; plus rehearsal-attributed
engage rows if the enumeration shows any) · TenantBilling 1 · TenantModule 3 ·
User 1 · Tenant 1 · PractitionerProspect 2. If Block 1.5 shows any of the 6 rows
NOT rehearsal-caused (organic lead, Valentina's own activity), those rows STAY and
Block 3's AuditEvent count will equal that residue, not 0 — that is correct, not a
failure to reconcile.

### Block 3 — AFTER counts + null-tenant invariant (Jacob; paste output back)

Re-run Block 1 verbatim. Every table count must equal its BEFORE value (unless
Block 1.5 identified organic rows that arrived during the window — those stay, and
the expected AFTER value is baseline + that named residue), and
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
