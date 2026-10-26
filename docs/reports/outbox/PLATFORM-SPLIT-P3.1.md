# P3.1 — THE DATA LAYER NOW CONSULTS TenantDomain (the blocker, cleared)

Serving tip 299e837. One function changed: `requestTenantId()` in `lib/prisma.ts`
consults `TenantDomain` first and falls back second — P1's exact shape, for P1's
exact reason. Same tenant id either way, so **net behavior change zero**.

## V1a — a real READ of HER practice, live

`GET https://valentinavelez.com/book` → 200,
`<title>Book a free discovery call · Valentina Vélez</title>`, and it renders **12
bookable slots read from her own availability**:

```
Mon, Sep 21 · Wed, Sep 23 · Fri, Sep 25 · Mon, Sep 28 · Wed, Sep 30 · Fri, Oct 2 …
```

Those dates come from tenant-scoped rows, through the changed function. `/login` 200,
`/api/tenant-kind` `{"kind":"tenant","isDefault":true}`.

## V1b — a real WRITE against her practice, live. Surface named first, and why.

**Chosen: `/join` on valentinavelez.com.** It sends **no email** (verified in
`lib/prospect-capture.ts` — no `sendEmail`/`notify` import on that path) and writes
exactly two rows: a `PractitionerProspect`, which is the platform's PRACTITIONER-lead
ledger and explicitly outside `SCOPED_MODEL_SET` (not her client data), and a
**tenant-scoped `AuditEvent` stamped with whatever `requestTenantId()` returned** —
which is precisely the artifact this item needs.

**Rejected: `/book`** — it writes a Lead and an Appointment into her live client
funnel and calendar. Rejected: `/forgot` (either writes nothing, or mails a real
person), `/signup` (creates a tenant).

Result: `303 → /join/thanks?code=QBA8XS9M`, a real referral code minted, the thanks
screen rendering under HER chrome (`You are on the list · Valentina Vélez`).

## V2 / V2a — which resolver decided, and proof the fallback did NOT

Production, the read at 16:49:52Z and **the write itself at 16:51:02Z**:

```
[tenant-scope] host=valentinavelez.com tenantId=tnt_valentina_000000001 via=TenantDomain
[tenant-scope] host=valentinavelez.com tenantId=tnt_valentina_000000001 via=TenantDomain
```

**V2a in the strong form.** A filter for `host-pattern` across production returns
**zero** lines for her host. That silence is meaningful only if the instrument speaks,
so both were proven:
1. the filter matches substrings — `via=` returns the lines above, so an empty
   `host-pattern` result is a real absence, not a filter artifact;
2. the fallback branch DOES emit in production — for psf-rehearsal, below.

So for her host the mapping fired AND the fallback was not used. Both branches are
instrumented; absence is evidence.

## V4 — psf-rehearsal, read AND write, on the UNMAPPED path

It has no `TenantDomain` row, so it must still resolve by host pattern. READ:
`/book` → 200, `<title>… · PSF Rehearsal Studio</title>`, 4 visible "PSF Rehearsal",
**0 visible "Valentina"**. WRITE: `/join` → `303 → /join/thanks?code=VFV5ZR4J`.
The log:

```
[tenancy]      host=psf-rehearsal.psychefolio.com has no TenantDomain row — host-pattern resolution decides
[tenant-scope] host=psf-rehearsal.psychefolio.com tenantId=cmu4m1p160003x6aemtexsxeu via=host-pattern-slug
```

**Its own tenant id, not hers.** The second write produced no additional line — the
60s per host+outcome throttle, working as designed.

## V-x — demonstrated able to fail (local, scratch DB, both halves)

With the mapping row: `[tenant-scope] host=valentinavelez.com
tenantId=tnt_valentina_000000001 via=TenantDomain`, no fallback line. Row DELETEd,
server restarted: `[tenant-scope] host=valentinavelez.com
tenantId=tnt_valentina_000000001 via=host-pattern-fallback`. `/book` **byte-identical**
either way. Row restored.

## A3 ANSWERED — and it CORRECTS MY OWN Q4 CLAIM

The census said the cron tick runs outside a request and therefore emits her domain
through `getBaseUrlSafe()`'s catch. **That was wrong, and the correction matters
because P3.3's shape depended on it.**

1. **There is no scheduler at all.** No `cronSchedule` on the Railway service (config
   read live), no GitHub Actions workflow, nothing in the repo. `/api/jobs/tick` is
   triggered manually — the billing checklist literally says "each visit is one run".
2. **The tick is an HTTP route**, so `headers()` WORKS inside it. It never rode the
   headers-catch fallback. What decides its tenant is the **Host it is called with**:
   on valentinavelez.com it now resolves via TenantDomain; called on the railway.app
   domain it rides the host-pattern fallback today.
3. **After P3.3**, a tick called on an unmapped host must REFUSE. The hazard to design
   for: the route catches per-step errors and still returns `ok: true` with
   `report.<step> = "error"`, so a naive monitor reading only `ok` would see a
   refusing tick as healthy. **P3.3 must make unmapped scoped access throw
   (`TenantUnresolvedError`), never resolve to a tenant with zero rows** — an
   empty-but-successful run is the fail-closed that looks correct and is not.
4. The DATA layer out-of-request is unaffected either way: it returns
   `ambientTenantId()` → null → unscoped passthrough, visible to the null-tenant
   audit. P3.3 does not change that.

## FOR JACOB — confirm the write's attribution, then clean up (rulings 73/75)

These two rows **cannot affect P3.2's census**: the `AuditEvent` rows carry a NON-null
tenantId, and `PractitionerProspect` is not in `SCOPED_MODELS` at all. Run whenever
convenient.

```sql
-- CONFIRM: each verification write landed under the RIGHT practice
SELECT a."createdAt", a.action, coalesce(t.slug,'(null)') AS tenant_slug, p.email AS actor
FROM "AuditEvent" a
LEFT JOIN "Tenant" t ON t.id = a."tenantId"
LEFT JOIN "PractitionerProspect" p ON p.id = a."actorId"
WHERE p.email IN ('jkelluniverse+p31-write@gmail.com','jkelluniverse+p31-psf@gmail.com')
ORDER BY a."createdAt";
```
EXPECTED: `+p31-write` → tenant_slug **valentina**; `+p31-psf` → tenant_slug
**psf-rehearsal**. Anything else means the data layer stamped the wrong practice and
P3 stops.

```sql
-- CLEAN UP (after the confirm above)
BEGIN;
DELETE FROM "AuditEvent" WHERE "actorId" IN (SELECT id FROM "PractitionerProspect" WHERE email IN ('jkelluniverse+p31-write@gmail.com','jkelluniverse+p31-psf@gmail.com'));
DELETE FROM "PractitionerProspect" WHERE email IN ('jkelluniverse+p31-write@gmail.com','jkelluniverse+p31-psf@gmail.com');
COMMIT;
```
EXPECTED: DELETE 2, then DELETE 2. ROLLBACK on any other count.

## Sweep

38/38 green, nexturl-origin included, stamp-audit LAST, `SWEEP EXIT: 0`.

## Holding

P3.2 is Jacob's 79-model null-tenant census and is yours to dispatch. A1 stands and is
NOT satisfied by P3.1 — before P3.3 I re-enumerate for a THIRD consumer of the
fallback, because the count was wrong once and the correction is not to assume the new
number is final.
