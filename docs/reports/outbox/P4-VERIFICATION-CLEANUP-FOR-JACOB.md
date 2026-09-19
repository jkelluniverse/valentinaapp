# FOR JACOB — clean up the hotfix verification rows (Railway → Query tab)

The P3.3 front-door hotfix was verified **end to end on production**, which means a
real practice and two real leads now exist and are mine, not anyone's. Ruling 73
keeps the production database out of the builder's session, so these are for you.

**Please run BLOCK 1 first and read it**, then BLOCK 2. One statement each — the
Query tab takes one statement and appends its own LIMIT (ruling 116), so BLOCK 2 is
a data-modifying CTE that ends in a SELECT.

**Time matters a little:** engage is the commercial sender and runs from the tick
every 15 minutes against prospects. The two leads use `@fixture.test` addresses, so
nothing can reach a real person, but leaving them in place costs a bounced send per
cycle. Sooner is better; nothing breaks if it waits.

---

## BLOCK 1 — CONFIRM (read-only, changes nothing)

```sql
SELECT 'tenant' AS kind, t.id, t.slug AS detail, t."displayName" AS extra
  FROM "Tenant" t WHERE t.slug = 'p4verify'
UNION ALL
SELECT 'user', u.id, u.email, u.role FROM "User" u
  WHERE u.email IN ('p4-verify@fixture.test')
UNION ALL
SELECT 'billing', b.id, b."tenantId", b.plan::text FROM "TenantBilling" b
  WHERE b."tenantId" IN (SELECT id FROM "Tenant" WHERE slug = 'p4verify')
UNION ALL
SELECT 'prospect', p.id, p.email, p.status::text FROM "PractitionerProspect" p
  WHERE p.email IN ('p4-verify@fixture.test','p4-join-verify@fixture.test')
UNION ALL
SELECT 'auditevent', a.id, a.action, a."tenantId" FROM "AuditEvent" a
  WHERE a."actorId" IN (SELECT id FROM "PractitionerProspect"
                        WHERE email IN ('p4-verify@fixture.test','p4-join-verify@fixture.test'))
     OR a."tenantId" IN (SELECT id FROM "Tenant" WHERE slug = 'p4verify');
```

**What it should show, and the one row worth actually reading:**

- one `tenant` — slug `p4verify`, display name `P4 Verify DELETE ME`
- one `user` — `p4-verify@fixture.test`, role `PRACTITIONER`
- one `billing` row on that tenant
- two `prospect` rows — the signup's own prospect, and `p4-join-verify@fixture.test`
- some `auditevent` rows. **The one to look at is the `prospect-capture` row whose
  actor is `p4-join-verify@fixture.test`. Its `tenantId` should be
  `tnt_valentina_000000001`** — that is ruling 133's tracked constant doing exactly
  what it says: a capture on the platform host has no practice to belong to, so it is
  attributed to tenant #1 and that attribution is wrong and tracked. P4 item 5 fixes
  it. It is in this report so you see the defect in live data rather than only in a
  comment.

---

## BLOCK 2 — DELETE (one statement, CTE chain, ends in a SELECT)

```sql
WITH t AS (SELECT id FROM "Tenant" WHERE slug = 'p4verify'),
     p AS (SELECT id FROM "PractitionerProspect"
            WHERE email IN ('p4-verify@fixture.test','p4-join-verify@fixture.test')),
     da AS (DELETE FROM "AuditEvent"
             WHERE "actorId" IN (SELECT id FROM p)
                OR "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dp AS (DELETE FROM "PractitionerProspect" WHERE id IN (SELECT id FROM p) RETURNING 1),
     du AS (DELETE FROM "User" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     db AS (DELETE FROM "TenantBilling" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dm AS (DELETE FROM "TenantModule" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dd AS (DELETE FROM "TenantDomain" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dt AS (DELETE FROM "Tenant" WHERE id IN (SELECT id FROM t) RETURNING 1)
SELECT (SELECT count(*) FROM da) AS audit_events,
       (SELECT count(*) FROM dp) AS prospects,
       (SELECT count(*) FROM du) AS users,
       (SELECT count(*) FROM db) AS billing,
       (SELECT count(*) FROM dm) AS modules,
       (SELECT count(*) FROM dd) AS domains,
       (SELECT count(*) FROM dt) AS tenants;
```

Re-running BLOCK 1 afterwards should return **zero rows**.

**Deliberately scoped to `p4verify` and those two exact addresses.** It touches no
other practice and no client data. If BLOCK 1 shows anything you did not expect —
especially a `user` row that is not `p4-verify@fixture.test` — stop and say so
rather than running BLOCK 2.

---

## A correction to an earlier instruction

An earlier dispatch asked for confirm-and-delete statements for
`PractitionerProspect` `cmu8ntxwn0001kqgsi05bgsoy`. **That row was never in
production.** It was written to the builder's local scratch database by
`audits/platform-frontdoor-verify.ts`, which refuses a Railway `DATABASE_URL`
outright, and its own cleanup removed it; re-querying scratch returns zero rows and
zero orphaned audit events. No SQL was written for it, on purpose — statements aimed
at a row that does not exist in production invite being run there.
