# P5 PREFLIGHT — A1–A5 verified, not trusted

Nothing built. Two of the five assumptions are wrong in ways that change P5's
shape, and two more need production data before the central item can ship.

## A1 — WRONG IN ONE HALF. They are NOT only data layer and test apparatus.

Measured against current code: **170 `DEFAULT_TENANT_*` references** — `lib/` 23,
`app/` 10, `audits/` 123, `scripts/`+`prisma/` 11, other 3. The test-apparatus
half of the belief holds (123 of 170). The data-layer half does not: **there are
five CHROME branches in `app/` that decide PRESENTATION by "is this the default
tenant"**, which P1/P3 did not retire because they were never resolution.

Classified, all 13 production files:

**(1) Chrome / presentation — "is it NOT the default?" → 5 sites.** This is the
category the belief missed.
- `app/(public)/book/page.tsx:22,48` · `app/(public)/layout.tsx:73,114` ·
  `app/api/tenant-kind/route.ts:17` (`isDefault` in the API contract)

Under ruling 85 these should ask *"does this tenant have its own chrome?"* rather
than *"is it not tenant #1?"*. `tenant-kind`'s `isDefault` field is a published
API shape that middleware consumes, so changing it touches C29's redirect.

**(2) Data-scope equivalence — A2's central item → 3 sites.**
- `lib/tenancy/scope.ts:59` — `scopeFilter`'s NULL-equals-default
- `lib/prisma.ts:318,373` — the ownership pre-check is SKIPPED for the default
  tenant. A performance shortcut that is also a **security asymmetry**: every
  other practice gets a fail-closed check she does not.

**(3) Identity defaulting in libs → 3 sites.**
- `lib/notify.ts:164` and `lib/agreements/index.ts:279` — `tid === null || tid ===
  DEFAULT_TENANT_ID → "default"`, i.e. her mail and agreements take the LEGACY path
- `lib/payments/account.ts:41` — legacy payment-token migration, money-adjacent

**(4) Auth → 1 site.** `lib/auth-guards.ts:52` — A3's target.

**(5) Structural / out of scope.** `lib/tenancy/index.ts:254` (unknown-slug →
default content, documented chrome behaviour), `:334` `staticSiteTenant()` —
**explicitly OUT of P5 per ruling 131** — plus declarations, re-exports and
comments.

## A2 — NEEDS FRESH PRODUCTION DATA BEFORE REMOVAL (ruling 144)

`scopeFilter` is confirmed as the central item and the code is exactly as
believed. What cannot come from the earlier census is whether any row still
relies on it. **Query in §6 below — run immediately before the removal, not now
and not from P3.2's numbers.**

## A3 — CODE CONFIRMED, DATA PENDING

`lib/auth-guards.ts:52`: `if (!userTenantId && tenant.slug !== DEFAULT_TENANT_SLUG) return null;`
A user whose `tenantId` is NULL resolves only on her host. The branch is dead
**iff** no user row has a null `tenantId` — the same query answers it.

## A4 — WRONG. The count is FIVE, not three.

My own earlier survey was the narrow instrument: it keyed on a pattern that
missed two sites, and I judged the rest by eye (ruling 153). All five use the
scoped client while asking a question that is **global by intent**, because
`User.email` is `@unique` across every tenant:

| site | the question it means to ask |
| --- | --- |
| `app/account/actions.ts:86` | is the requested new email already somebody's login? |
| `app/account/confirm-email/[token]/page.tsx:20` | the same check, at confirm time |
| `app/invite/[token]/actions.ts:29` | does this invitee already have an account? |
| **`app/practitioner/clients/[clientId]/help-actions.ts:109`** | **is this address taken, before changing a client's email?** |
| **`app/practitioner/clients/actions.ts:79`** | **"Don't invite someone who already has an account."** |

The two in bold are new. `lib/provisioning.ts` and `lib/signup.ts` ask the same
question correctly, on the raw client — which is why nobody noticed.

## A5 — BOTH COUNTS LOW. 26 files, 18 standing-set gates.

Estimated 15 files and 5 gates; measured **26 files**, of which **18 are standing
entries**. (My first matcher was wrong too — it matched on `basename`, which is
`verify.ts` for most gates and therefore matched nearly every line of
`regress.sh`. Corrected to full-path matching and proven in both directions: 1 for
a file in the set, 0 for one outside it.)

**Which gates lose coverage if this is done wrong.** The honest fix is explicit
fixture tenants, never relaxing an assertion. The four that would silently lose
their point:

- **`fail-closed-tenancy-verify`** — its whole subject is what happens when
  resolution fails. Relaxing a default-tenant assertion here would remove C26's
  proof rather than update it.
- **`nested-stamp-verify` / `tenant-scope-verify`** — both assert stamping and
  scope against her id. If they moved to a generic fixture tenant *without*
  keeping a case that exercises the legacy-null equivalence, the very rows P5
  removes support for would stop being covered on the way out.
- **`platform/verify`** — the 79-model isolation proof keys tenant B against her
  as tenant A. It needs two *ordinary* tenants after P5, not "the default and
  another".

## §6 — FOR JACOB: the fresh null-tenant census (read-only, one statement)

Answers **A2 and A3 together**. Dynamic — it finds every table with a `tenantId`
column rather than trusting a hardcoded list, so it cannot go stale the way
P3.2's 79-model census already has (scratch now reports **82**).

```sql
SELECT c.table_name,
       (xpath('/row/cnt/text()',
              query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I WHERE "tenantId" IS NULL',
                                  c.table_schema, c.table_name), false, true, '')))[1]::text::bigint AS null_tenant_rows
  FROM information_schema.columns c
 WHERE c.column_name = 'tenantId' AND c.table_schema = 'public'
 ORDER BY null_tenant_rows DESC, c.table_name;
```

**What to look for.** It returns **one row per table, including the zeros** — on
purpose. An empty result would be an absence with no positive control; a list of
~82 tables reading 0 is proof the query actually examined them (ruling 110).
Sorted so anything non-zero is at the top.

- **All zeros** → `scopeFilter`'s NULL equivalence supports no live row, and A3's
  auth branch is dead by data. P5's central item can proceed.
- **Any non-zero** → name the table and the count. P5's central item STOPS until
  those rows are attributed.
- **`User` specifically** → that is A3. Non-zero means the sign-in branch is live
  and must not be removed.

Tested on scratch before being handed over: 82 rows, all zero.
