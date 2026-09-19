# FOR JACOB — REVISED cleanup for the verification rows (Railway → Query tab)

**Supersedes the earlier version of this file. Do not run the old BLOCK 2.**
Your confirm query found eight `engage-message` audit rows the old plan did not
anticipate, and the old delete was wrong for them in both directions: it would
have **missed** the two under `tnt_valentina_000000001` (caught by neither its
actorId nor its tenantId clause) and it had a tenantId clause that must never be
allowed to widen to the platform tenant's other rows.

**The eight rows are benign.** An `engage-message` row records a send
**DECISION**, not a send — see §1. Nothing has sent.

---

## 1 — WHAT AN `engage-message` ROW MEANS (Q1, Q4)

From `lib/engage.ts`, in `actOnStep()`, written immediately after `decide()`:

```ts
  // Law #6 — every send DECISION is recorded with its reason. METADATA ONLY:
  // no subject, no body, no email address (Verify item 12).
  await prisma.auditEvent.create({
    data: {
      tenantId: PLATFORM_TENANT_ID,
      actorId: step.prospectId,
      action: "engage-message",
      reason: outcome.reason,
      meta: { prospectId, sequenceKey, stepKey, templateKey, locale, status: outcome.status, … },
```

It is written for **every** outcome — `SENT`, `SKIPPED`, `SUPPRESSED`,
`UNCONFIGURED` — and `meta.status` plus `reason` say which. So eight rows
accumulating while the gate is closed is the engine recording eight refusals to
send. **That is the system working, not a leak.**

**It also proves the gate was CONSULTED, not merely set.** The audit write
happens *after* `decide()`, whose second check is
`if (!switches.gateOpen) return { status: "SKIPPED", reason: REASONS.gateClosed }`.
The reason vocabulary (`lib/engage-config.ts`):

| reason | meaning |
| --- | --- |
| `engine-gate-closed` | the gate was consulted and was closed |
| `globally-paused` | gate open, engine paused |
| `sequence-gated-off` | that sequence is disabled |
| `email-not-configured` | platform identity incomplete (incl. no postal address) |
| `prospect-unsubscribed` | consent, honoured before anything else |
| **`delivered-to-transport`** | **a message WAS handed to Resend** |

**If any of the eight says `delivered-to-transport`, stop and tell me** — the
standing "engage has never sent" record would be wrong.

---

## 2 — BLOCK 1.5: ENUMERATE THE EIGHT BEFORE DELETING (read-only)

Run this first. It answers Q2's gate half and Q5 from data.

```sql
SELECT a.id,
       a."tenantId",
       a.reason,
       a.meta->>'status'      AS status,
       a.meta->>'sequenceKey' AS sequence,
       p.email                AS prospect_email,
       CASE WHEN p.email IN ('p4-verify@fixture.test',
                             'p4-join-verify@fixture.test',
                             'jkelluniverse+p4verify@gmail.com')
            THEN 'VERIFICATION — will be deleted'
            ELSE 'REAL LEAD — will be KEPT' END AS disposition
  FROM "AuditEvent" a
  LEFT JOIN "PractitionerProspect" p ON p.id = a."actorId"
 WHERE a.action = 'engage-message'
 ORDER BY a.id;
```

**What to check, in order:**

1. **`reason` on every row.** Expected `engine-gate-closed`. Anything reading
   `delivered-to-transport` means engage sent — stop.
2. **`disposition`.** Every row is labelled. The two under
   `tnt_valentina_000000001` are the interesting ones: they were written BEFORE
   P4 item 5 deployed, and the 17:15 tick showed `considered=1` before any
   verification artifact existed — **so at least one real prospect is in engage's
   audience and one of those two may belong to them.**
3. **`prospect_email` NULL** would mean the prospect is already gone; such a row
   is not deleted by BLOCK 2 and can be left alone.

**The two/six split across tenants is P4 item 5 landing mid-stream** — the two
older rows carry the old attribution, the six newer ones carry the platform
tenant. That is the attribution fix visible in live data.

---

## 3 — BLOCK 2 (REVISED): one statement, deletes exactly the verification artifacts

**Keyed on the three verification identities, never on `action` and never on the
platform tenant.** It therefore removes verification `engage-message` rows under
*either* tenant, and cannot touch a real lead's row.

```sql
WITH t AS (SELECT id FROM "Tenant" WHERE slug IN ('p4verify','p4mail')),
     p AS (SELECT id FROM "PractitionerProspect"
            WHERE email IN ('p4-verify@fixture.test',
                            'p4-join-verify@fixture.test',
                            'jkelluniverse+p4verify@gmail.com')),
     da AS (DELETE FROM "AuditEvent"
             WHERE "actorId" IN (SELECT id FROM p)
                OR "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dp AS (DELETE FROM "PractitionerProspect" WHERE id IN (SELECT id FROM p) RETURNING 1),
     du AS (DELETE FROM "User"          WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     db AS (DELETE FROM "TenantBilling" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dm AS (DELETE FROM "TenantModule"  WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dd AS (DELETE FROM "TenantDomain"  WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dt AS (DELETE FROM "Tenant"        WHERE id IN (SELECT id FROM t) RETURNING 1)
SELECT (SELECT count(*) FROM da) AS audit_events,
       (SELECT count(*) FROM dp) AS prospects,
       (SELECT count(*) FROM du) AS users,
       (SELECT count(*) FROM db) AS billing,
       (SELECT count(*) FROM dm) AS modules,
       (SELECT count(*) FROM dd) AS domains,
       (SELECT count(*) FROM dt) AS tenants;
```

### Expected counts

| column | expected | note |
| --- | --- | --- |
| `tenants` | **2** | `p4verify`, `p4mail` |
| `users` | **2** | one practitioner each |
| `billing` | **2** | one `TenantBilling` each |
| `modules` | 2 × the standard module count | whatever signup provisions |
| `domains` | **0** | neither verification tenant was given a TenantDomain row |
| `prospects` | **3** | the two fixture addresses + the real one |
| `audit_events` | **3 + N + M** | see below |

`audit_events` breaks down as: **3** `prospect-capture` / `practitioner-signup`
rows for the verification prospects, plus **N** = the verification tenants' own
signup audit rows, plus **M** = however many of the eight `engage-message` rows
BLOCK 1.5 labelled `VERIFICATION`. **Take M from BLOCK 1.5 and check it matches.**

### Which of the eight are deleted, which are kept, and why

- **Deleted:** every `engage-message` row whose `actorId` is one of the three
  verification prospects — under **either** tenant, because the clause keys on
  the prospect and not on the tenant. Those rows exist only because my
  verification created prospects that engage then considered.
- **Kept:** every `engage-message` row belonging to a **real** lead, including
  any of the two `tnt_valentina_000000001` rows that turns out to be one. It is
  a genuine record of a genuine refusal to send, and deleting it would destroy
  audit history for a real person.
- **Kept, always:** the platform tenant's other rows. **`tnt_platform_00000000001`
  appears nowhere in BLOCK 2.** The only tenantId clause is `IN (SELECT id FROM t)`,
  and `t` is the two verification slugs.

### And do NOT delete the platform tenant row

`tnt_platform_00000000001`, slug `__platform__`, status `PLATFORM` — created by
migration 52. It is not verification debris; it is where platform activity is
attributed so it stops being recorded as Valentina's practice data. It should
never have modules, billing, a domain mapping or users; if you ever see it with
any of those, raise it.

---

## 4 — STILL YOURS TO CONFIRM (Q2, the half code cannot answer)

- **The Resend PLATFORM account's send log, last 24h.** Expected: nothing to
  `p4-verify@fixture.test`, `p4-join-verify@fixture.test`, or any prospect
  address. The one message that SHOULD be there is the P4 signup welcome to
  `jkelluniverse+p4verify@gmail.com` at 4:43 PM — that is transactional signup
  mail, not engage.
- **`PLATFORM_POSTAL_ADDRESS`'s value.** The connector I use redacts variable
  values, so I confirmed only that it is SET. `2202 31st St NE, Canton, OH 44705`
  rests on your word until a commercial send renders it.
