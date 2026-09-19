# FOR JACOB — engage audience cleanup (Railway → Query tab)

**Supersedes `P4-VERIFICATION-CLEANUP-FOR-JACOB.md` entirely. Do not run that file.**
It was scoped to two tenants and three prospects; the enumeration found 299 audit
rows across a fourth prospect it did not know about.

**Nothing has sent.** All 299 decisions read `engine-gate-closed`. And the
gate-open path is now proven idempotent — see the closing note.

---

## 1 — DOES DELETING THE psf-founder PROSPECT TOUCH THE psf-rehearsal TENANT?

**No. Not in any way.** Checked in the schema rather than assumed:

- `PractitionerProspect.tenantId` is a bare `String?`, commented *"the tenant they
  now OWN (set on conversion) — **not a scope column**"*. There is **no
  `@relation`**, so no foreign key and no cascade.
- `Tenant` has no prospect relation at all.
- No code anywhere reads a prospect by `tenantId`.

Deleting the prospect leaves the psf-rehearsal tenant, its users, modules, billing
and domain rows **completely untouched**. What is lost is the provenance record —
that psf-rehearsal came from that rehearsal signup — and its referral code. Both
are already written down in the C30 report and the ledger.

**There is one consequence of NOT deleting it.** `ProspectMessage.prospectId` is
also a bare `String` with no cascade, so deleting only the audit rows leaves the
prospect in engage's audience — and it is re-decided **every 15 minutes, forever**:
**~96 new audit rows per day, per prospect-step**, until ruling 150's fix lands.
That is how 289 rows accumulated over three days.

**DECIDED (Jacob): delete all five verification prospects.** Not an
audit-rows-only variant. None of the five is a genuine lead, the psf-rehearsal
tenant is provably unaffected, and each surviving prospect would generate ~96
audit rows per day until ruling 150 is fixed.

**Also decided: ruling 150's engine fix WAITS until after Sept 23.** Once the five
prospects are gone and terminal steps stop being reconsidered, the accumulation
largely stops on its own. The fix is a behaviour change to the engine three days
before the engine's first real use — the audit noise is tolerable, an untested
change to the send path is not. It is queued post-event together with ruling
146's naming item, since they touch the same write.

---

## 2 — BLOCK 0: ENUMERATE EVERY PROSPECT (read-only, run first)

The earlier enumeration only saw prospects that have engage rows, which is why
`jkelluniverse+psf-ref@gmail.com` was invisible. This sees all of them.

```sql
SELECT p.email,
       p.status,
       p.source,
       p."referralCode",
       p."referredByCode",
       p."tenantId",
       t.slug                                     AS owns_tenant,
       p."createdAt",
       (SELECT count(*) FROM "AuditEvent" a
         WHERE a."actorId" = p.id)                AS audit_rows,
       (SELECT count(*) FROM "ProspectMessage" m
         WHERE m."prospectId" = p.id)             AS ledger_rows
  FROM "PractitionerProspect" p
  LEFT JOIN "Tenant" t ON t.id = p."tenantId"
 ORDER BY p."createdAt";
```

**What to look for:** every row should be one of the four verification addresses
below. **If any other address appears, stop and report it** — that would be a
genuine lead and nothing here should touch it.

| address | what it is |
| --- | --- |
| `jkelluniverse+psf-founder@gmail.com` | C30 rehearsal founder signup — minted psf-rehearsal |
| `jkelluniverse+psf-ref@gmail.com` | the referrer from the same rehearsal |
| `p4-verify@fixture.test` | P4 signup verification |
| `p4-join-verify@fixture.test` | P4 /join verification |
| `jkelluniverse+p4verify@gmail.com` | P4 mail verification — the one that reached your inbox |

*(That is five addresses; `p4-verify@fixture.test` and
`jkelluniverse+p4verify@gmail.com` are two separate signups.)*

---

## 3 — BLOCK 1: one statement, everything verification, nothing else

Keyed on the five verification addresses and the two verification tenant slugs.
**There are no cascades on any of these links** — `ProspectMessage.prospectId`,
`AuditEvent.actorId` and `PractitionerProspect.tenantId` are all bare strings —
so each table is deleted explicitly, children before parents.

**`tnt_platform_00000000001` appears nowhere below**, and **psf-rehearsal's tenant
slug appears nowhere below** — only its founder's prospect row is removed.

```sql
WITH t AS (SELECT id FROM "Tenant" WHERE slug IN ('p4verify','p4mail')),
     p AS (SELECT id FROM "PractitionerProspect"
            WHERE email IN ('jkelluniverse+psf-founder@gmail.com',
                            'jkelluniverse+psf-ref@gmail.com',
                            'p4-verify@fixture.test',
                            'p4-join-verify@fixture.test',
                            'jkelluniverse+p4verify@gmail.com')),
     dm AS (DELETE FROM "ProspectMessage" WHERE "prospectId" IN (SELECT id FROM p) RETURNING 1),
     da AS (DELETE FROM "AuditEvent"
             WHERE "actorId" IN (SELECT id FROM p)
                OR "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dp AS (DELETE FROM "PractitionerProspect" WHERE id IN (SELECT id FROM p) RETURNING 1),
     du AS (DELETE FROM "User"          WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     db AS (DELETE FROM "TenantBilling" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dmo AS (DELETE FROM "TenantModule" WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dd AS (DELETE FROM "TenantDomain"  WHERE "tenantId" IN (SELECT id FROM t) RETURNING 1),
     dt AS (DELETE FROM "Tenant"        WHERE id IN (SELECT id FROM t) RETURNING 1)
SELECT (SELECT count(*) FROM dm)  AS ledger_rows,
       (SELECT count(*) FROM da)  AS audit_events,
       (SELECT count(*) FROM dp)  AS prospects,
       (SELECT count(*) FROM du)  AS users,
       (SELECT count(*) FROM db)  AS billing,
       (SELECT count(*) FROM dmo) AS modules,
       (SELECT count(*) FROM dd)  AS domains,
       (SELECT count(*) FROM dt)  AS tenants;
```

### Expected counts

| column | expected | note |
| --- | --- | --- |
| `ledger_rows` | small, single digits | one per prospect-step actually claimed |
| `audit_events` | **≈ 299 + a handful** | the 299 engage rows **plus** the capture/signup rows for the five prospects and the two verification tenants. Take the exact engage figure from BLOCK 0's `audit_rows` column and check the total is consistent. |
| `prospects` | **5** | the five addresses above |
| `users` | **2** | one practitioner each for p4verify, p4mail |
| `billing` | **2** | |
| `modules` | 2 × the standard module count | |
| `domains` | **0** | neither verification tenant was given a TenantDomain row |
| `tenants` | **2** | `p4verify`, `p4mail` — **NOT psf-rehearsal** |

**If `tenants` comes back as anything other than 2, stop.**

### What is NOT touched

- **psf-rehearsal the tenant** — held until P6 as the reference second practice.
  Only its founder's prospect row is removed, and that link has no foreign key.
- **`tnt_platform_00000000001`** — the platform's own tenant, from migration 52.
  It is where platform activity is attributed. It should never have modules,
  billing, a domain mapping or users; if you ever see it with any, raise it.
- **Valentina's practice** — nothing above references her tenant.

---

## 4 — THE GATE IS SAFE TO OPEN ON THE RE-SEND AXIS

The question was whether opening the gate with ~40 founding partners re-sends the
same email every fifteen minutes. **It does not**, and this is now covered by a
standing gate (`audits/engage-send-idempotency-verify.ts`) rather than an argument:
with the gate open, tick 1 sends once and tick 2 does not call the transport at
all. A sent step is excluded before the engine even re-decides it, and the claim
that enforces it is a database unique constraint, not application logic.

**One caveat worth knowing before the event:** the send and the "mark it sent"
write are not in the same transaction. If the process dies between the transport
accepting a message and that write landing, the row stays `PENDING` and is
reclaimed after 15 minutes — **one** duplicate to **one** recipient. Not a
blocker; just so it is not a surprise if it ever happens.
