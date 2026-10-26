# BUILD-REPORT — C24-NESTED-STAMP

- **Spec:** C24-NESTED-STAMP — close task #75, make the audit mean something
- **Status: PARTIAL** — every Verify item passes with evidence, `audits/tenant-stamp-audit.ts`
  exits **0** after a full gate sweep, and task #75's stated work is done. It is PARTIAL for one
  reason, stated up front rather than buried: **the spec's central diagnosis was wrong, and one of
  the two real producers of null-tenant rows is still live.** See Finding 1 and ARCHITECT-REQUEST 1.

---

## THE FIVE ASSUMPTIONS — findings first

Mechanical evidence for all five is in `audits/nested-stamp-verify.ts` (43/43) and
`audits/nested-stamp/VERIFY-LOG.md`, which the gate writes itself (ruling 17).

### A1 — "the null rows are produced by nested relation writes" · **FALSE. The hypothesis is wrong about the mechanism.**

The null-tenant rows are produced by the scoped client's **out-of-request passthrough**, exercised
by **CLI gate harnesses**. Not by nested writes. Three independent pieces of evidence:

1. **There are no nested relation writes on scoped models anywhere in this repo.** A schema-driven
   scan (relation fields taken from `Prisma.dmmf`, so it cannot drift from the schema) over 462
   `.ts`/`.tsx` files against all 43 relation fields returns **zero hits** outside the new harness —
   and finds all 16 that the harness writes deliberately, so the scanner is not blind. Every
   `create:` in the codebase that looked like a nested write is a **top-level `upsert`'s** create
   branch, which the extension already stamped. `connectOrCreate` appears nowhere.
2. **The real mechanism, reproduced directly.** `lib/prisma.ts` resolves the tenant from
   `headers()`; outside a request `headers()` throws and the client returns `null` → **passthrough,
   unstamped**. Proven in the gate: the identical `logEntry.create` writes `tenantId = null` outside
   a request and `tnt_valentina_000000001` inside one. This is documented, deliberate design ("ops
   tooling states its own intentions") — the request path was never the leak.
3. **The two actual producers, both gate harnesses, identified by per-gate attribution.** I ran the
   entire regression list one gate at a time against a freshly-seeded DB, checking null counts after
   each:
   - `prisma/fixtures/c12x-verify.ts` → **+11 rows across 6 tables** every run
     (`user 1, psycheNode 3, humanDesignChart 1, resonanceMark 3, practiceSetting 1, recordItem 2`).
     It imports the SCOPED client, runs from the CLI, and never states a tenant — for its own writes
     *and* for the product libs it drives (`seedChartHypotheses`, `markResonance`, `lib/record.ts`).
     **Fixed** (see Built).
   - `audits/remarkable-recording/verify.ts` → **+`handwrittenNote: 1` and `appointment: 1`**, which
     is *exactly* the failure signature the spec quotes. Confirmed by running it as a diagnostic
     (it cannot pass in this environment — no `ANTHROPIC_API_KEY`) and observing precisely those two
     rows appear. **NOT fixed** — see ARCHITECT-REQUEST 1.
   - **Every other gate in the regression list produced zero null rows**, before and after the fix.

   So the historically-quoted `handwrittenNote: 1` + `appointment: 1` was the remarkable harness, and
   "six rows across five tables" was almost certainly a different harness mix at that time.

**The nested-write gap was nonetheless real.** Reproduced in the gate: the pre-fix stamping shape
(`{ tenantId, ...data }`, top level only) applied to a parent-with-child create leaves the child
`tenantId = null`, and the audit sees it. It was simply a **latent** hole — no code exercised it. It
is now closed (§2 built as specified), which is worth having before multi-tenant conversion, but it
was never the cause and closing it alone would have left the audit red.

### A2 — "`lib/prisma.ts` is the single place scoped writes are stamped" · **TRUE for the request path, FALSE in general.**

The nested-stamp walker is imported by `lib/prisma.ts` and nothing else (asserted mechanically), so
the request path does have exactly one stamping site. But **10 files stamp a tenant explicitly at the
call site** precisely because of the out-of-request seam — `lib/pattern-library.ts` is the clearest
precedent and says so in a comment: *"Stamp aggregates with the practice tenant explicitly: this job
also runs from CLI/tick contexts where the scoped client passes through (the null-tenant invariant
audit caught exactly this)."* That comment is the fix for the actual bug, written a build or two
ago, and never generalised. A fix "belonging in the extension" is therefore only half of the answer:
the extension covers requests; nothing covers CLI callers.

### A3 — "`SCOPED_MODEL_SET` is authoritative, and `handwrittenNote` + `appointment` are in it" · **TRUE, with two corrections.**

Both models are in the set (asserted). Every one of its entries has a **nullable** `tenantId`, and
the audit iterates exactly that list. Corrections: (a) it holds **79** models, not the 66 that
`docs/PRISMA-ALLOWLIST.md` claimed — doc fixed; (b) the only two models with a `tenantId` column
*outside* the set are `TenantModule` (required — it *is* the FK) and `PractitionerProspect` (nullable,
but it means "the tenant they now own", not a scope column). Neither is stamped, deliberately.

### A4 — "the rows are created by audit/gate probes, not product paths" · **TRUE, and now provable.**

Product code cannot produce a null: it always runs inside a request (stamped), and it contains no
nested writes. The producers are gate harnesses (A1.3). The gate now runs `c12x-verify` in-process
and asserts the null count is unchanged by it — the check that would have caught this on day one.
**No product path leaks.** (If one ever does, it would be a materially bigger finding, as the spec
says; none does.)

### A5 — "the audit iterates every scoped model and reports per-table counts" · **TRUE.**

Proven positively rather than by reading: a null row injected into `Note` is reported as
`{"note": 1}` by table name and counted; removing it returns the audit to zero; 79 tables iterated.
The audit's non-zero exit was also proven live (injected row → `FAIL … logEntry: 1`, exit **1**).

---

## Built

- **`lib/tenancy/stamp.ts` (new)** — the payload stamper. Walks create/update payloads once and
  stamps `tenantId` into nested `create`, `createMany`, `connectOrCreate`, nested `upsert` (both
  branches) and creates inside a nested `update`, at any depth. Two invariants are load-bearing and
  tested: an explicitly-provided `tenantId` is **never** overwritten (including a *different*
  tenant's id and an explicit `null`), and only `SCOPED_MODEL_SET` members are stamped — platform
  models and `IntakeAnswer` (no column) are walked through, never touched.
- **`lib/prisma.ts`** — `create`/`createMany`/`createManyAndReturn` route through the stamper;
  `upsert` stamps its `create` branch and walks its `update` branch; `update`/`updateMany` never
  rewrite the row's own `tenantId` but do stamp nested creates inside them. Applied in **both**
  code paths (`runOp` and the synchronous `buildTxCall` used by array-form `$transaction`), so
  transactional writes get the same treatment. Header comment's "known honest limits" section
  corrected to name the real seam.
- **`prisma/fixtures/c12x-verify.ts`** — the actual bug. Its own creates now state
  `DEFAULT_TENANT_ID` (the `lib/pattern-library.ts` contract), and the rows the product libs write
  on its behalf are cleared on the way **out** as well as in, so a completed run leaves the
  invariant intact. Gate still 23 passed · 0 failed.
- **`prisma/migrations/48_stamp_null_tenants_nested/migration.sql` (new)** — the backfill. All 79
  scoped tables, platform tables deliberately absent (listed by name in the comment), the
  single-practice assumption stated out loud with the warning about when it stops being true,
  per-table + total `RAISE NOTICE` counts, idempotent, and **reversible** via
  `_TenantStampBackfill48 (table_name, pk_column, row_id)` with the exact reverse statement in the
  header. Fails loudly on schema drift rather than silently skipping a table.
- **`audits/nested-stamp-verify.ts` (new, 43 checks)** — house style, self-cleaning, writes
  `audits/nested-stamp/VERIFY-LOG.md` itself. Runs the request-path checks through the **real**
  scoped client against the **real** database inside a **simulated request scope** (Next's request
  async storage), because a CLI harness otherwise only ever exercises the passthrough and would
  prove nothing about the path under test. It asserts the simulation is real before trusting a
  single check built on it.
- **Docs/guard** — `scripts/guard-prisma.ts` + `docs/PRISMA-ALLOWLIST.md` allowlist entry for the
  new harness (harness only; **no product code needed an entry**). The allowlist's "known honest
  limits" section rewritten: nested writes are no longer a limit, and the out-of-request passthrough
  is now named as the real source, with both violating harnesses named. Stale "66" → 79.
- **Diagnostic hints corrected** in `audits/tenant-stamp-audit.ts`, `lib/tenancy/stamp-audit.ts` and
  `audits/platform/verify.ts` — all three told the reader "likely cause: a nested relation write",
  which would have sent the next person down the same wrong path. No check was changed.

**Nothing was excluded, narrowed or softened.** The audit still counts every row in all 79 tables
and still exits non-zero on one.

### Performance shape (this runs on every write)

The walk is driven by the **schema, not the payload**: at each node only keys the DMMF says are
relation fields of that model are visited, so JSON columns, `Buffer`s and `Date`s are never
descended into. The relation map is built once, lazily. Copy-on-write throughout — unchanged
subtrees are returned by identity, so a create with no nested writes allocates exactly the one
object it allocated before. Measured (200k iterations, warm):

| payload | per call |
|---|---|
| flat create, 7 keys incl. a nested JSON blob | **0.135 µs** |
| pre-fix shape `{ tenantId, ...data }` (same payload) | 0.099 µs |
| 3-level nested create (parent + child + grandchild) | 1.64 µs |

**+0.036 µs on the shape the app actually writes** — four orders of magnitude below a Postgres round
trip. Not a hot-path concern.

---

## Verification — each Verify item, PASS/FAIL + evidence

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Five assumptions confirmed/corrected in writing | **PASS** | Section above. A1 **FALSE** (real mechanism named), A2 **partly false**, A3/A4/A5 true with corrections. 12 mechanical checks in the gate. |
| 2 | Minimal reproduction: null before, stamped after | **PASS** | Pre-fix stamping shape reproduced against the raw client → `parent=tnt_valentina_000000001 child=null`, and the audit reports `{"chapter":1}`. Same call through the fixed scoped client in a request → `parent=… child=tnt_valentina_000000001`. Reproduction is IN the gate, so the bug cannot return silently. Separately, the *real* mechanism is reproduced too (out-of-request create → null; same create in-request → stamped). |
| 3 | Nested writes stamped at depth | **PASS** | Parent create with 2 children (array form) + 3 grandchildren via nested `create` **and** nested `createMany` → all `tnt_valentina_000000001`. Nested create inside an `update` → child + grandchild stamped. Non-default tenant, host-resolved → `parent=tnt_nsx_probe_b_00001 child=tnt_nsx_probe_b_00001`. |
| 4 | `connectOrCreate` and nested `upsert` stamped | **PASS** | Nested `connectOrCreate` (child + grandchild) stamped; nested `upsert`'s create branch (child + grandchild) stamped; a create inside a nested upsert's **update** branch stamped; top-level `upsert` still stamps, plus its nested create. |
| 5 | Explicit `tenantId` preserved, incl. a different tenant's | **PASS** | Inside the default tenant's request, a nested child carrying `tnt_nsx_foreign_00001` is stored as `tnt_nsx_foreign_00001`, and is findable as that tenant's row (1 row) — **the cross-tenant write stays visible to the audit, not normalised**. Same under a non-default tenant's request. An `update` never rewrites an existing `tenantId`. |
| 6 | Platform models not stamped, not broken | **PASS** | `PractitionerProspect` written in-request → `tenantId` stays `null`; `ProspectMessage`, `Tenant` (update) and `TenantModule` (create) all write fine and carry no injected scope; zero null rows in any *scoped* table from those writes. |
| 7 | `audits/tenant-stamp-audit.ts` exits **zero** on a freshly-seeded DB **after a full gate sweep** | **PASS** | Fresh reset (drop/create/`migrate deploy` through 48/`seed.ts`/`seed-staging.ts`) → `npm run build` → the entire item-11 sweep, 19 gates, then the audit: `tenant-stamp audit: PASS — zero null-tenant rows across all scoped tables`, **exit 0**. Re-run after `platform/verify.ts`: still 0. The condition that had never held. Ran the sweep **first**, then the audit, as instructed. |
| 8 | `audits/platform/verify.ts` null-tenant check passes | **PASS** | `✓ zero null-tenant rows across every scoped table — 79 tables checked` · `ALL CHECKS PASS`, exit 0, in the same post-sweep state. |
| 9 | Backfill states counts, leaves zero nulls, safe twice | **PASS** | Against the real 11-row drift: per-table notices (`User 1, PsycheNode 3, HumanDesignChart 1, ResonanceMark 3, PracticeSetting 1, RecordItem 2`) + `11 null-tenant row(s) stamped across 6 of 79 scoped tables`; audit → 0. Second run: `0 null-tenant row(s) stamped across 0 of 79`. Reversal exercised with the documented statement → the same 11 rows returned to null. Re-proved inside the gate on seeded drift (`Chapter=1 LogEntry=2`). |
| 10 | Isolation not weakened; a cross-tenant read still fails | **PASS** | `platform/phase2-verify` **16/16**, `phase3-verify` **11/11**, `platform/verify.ts` ALL CHECKS PASS (79-table isolation proof, both directions, one real tenant-B row per table). Explicit cross-tenant reads return nothing in both directions; tenant B's unique write against the default tenant's row is refused fail-closed: `tenant-scope: course.update target not found in tenant scope`. |
| 11 | Regression list | **PASS** | `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean · `npm run build` ✓ Compiled successfully · `smoke` PASS · `smoke:writes` PASS · signup **37/37** · capture **59/59** · referral **68/68** · engage **172/172** · platform/phase5 **17/17** · c21 **58/58** · c20 **28/28** · v31 **32/32** · fixtures/c12x **23 passed · 0 failed** · onboarding complete **16/16**, stage1 **17/17**, update **7/7**, ui **10/10**, discovery **19/19** · password-reset ALL CHECKS PASS. Plus the new `nested-stamp-verify` **43/43**, run twice consecutively, self-cleaning both times. |

Not run, per the session's environment constraints and not in the spec's regression list:
`pipeline/p12`, `fixtures/values-verify`, `remarkable-recording` (no `ANTHROPIC_API_KEY`,
`RESEND_API_KEY`, Square/AssemblyAI/R2 credentials). The 16-screen visual baseline was not
recaptured or committed (ruling 11); this build touches no `/space` or `/login` chrome.

---

## Discrepancies & decisions needed

### ARCHITECT-REQUEST 1 — the second producer is still live, and the class of bug is unfixed

**Context.** The audit is green here because I fixed the one violating harness in my sweep. The
*other* violator, `audits/remarkable-recording/verify.ts`, still writes `handwrittenNote: 1` +
`appointment: 1` with null tenants — confirmed by diagnostic run, and those are literally the rows
the spec quotes. It is not in this spec's regression list and cannot pass in this environment, so I
did not edit it: blind-editing a gate I cannot run to green is exactly the move I should not make.

**The ambiguity.** §2 says the fix "belongs in the extension rather than at call sites", and law #5
says *"'Remember to pass tenantId' is not enforcement."* But the extension governs the **request**
path, which was never leaking, and the leak is on the **CLI** path, where passthrough is deliberate
design ratified across Phases 0–5. Fixing harness-by-harness *is* review discipline — which the
spec's own law forbids — and I have no authorisation to change out-of-request semantics.

**Options.**
1. **`withTenantScope(tenantId, fn)`** — a small AsyncLocalStorage scope in `lib/tenancy`; the
   scoped client consults it only when `headers()` is unavailable. Opt-in, so **no existing
   behaviour changes**; a CLI harness wraps its body in one line and every row it and the product
   libs it drives create is stamped. Fixes both violators and every future one, in the data layer.
   *(This is also what my gate does internally, via Next's storage — the mechanism is proven to
   work.)*
2. **Make out-of-request creates stamp `DEFAULT_TENANT_ID` implicitly.** Smallest diff; semantically
   equal to what migrations 36/48 already assert (null *means* default tenant to `scopeFilter`).
   **My objection:** it removes most of the audit's detection surface, and a script that forgets a
   tenant for practice B would silently write rows as Valentina's instead of leaving them null and
   visible. Trades a loud defect for a quiet one — the same trade §2 forbids for explicit values.
3. **Fix the remaining harness only** (state the tenant on its `appointment.create`; the
   `handwrittenNote` comes from `ingestInboundEmail`, so it needs end-of-run cleanup or option 1).
   Cheapest, unverifiable here, and leaves the class open for the next harness.

**Recommendation: option 1**, plus fixing the remarkable harness with it. **Blocked until answered:**
task #75 closing cleanly for *every* gate rather than for my sweep; and the audit staying green on
Jacob's environment if anyone runs `remarkable-recording` there.

### 2 — `_TenantStampBackfill48` is outside `schema.prisma` (informational)

The reversibility ledger is a real table Prisma does not know about. Harmless under `migrate deploy`
(the only command this repo uses) and `_`-prefixed by convention like `_prisma_migrations`, but
`prisma migrate dev` would report it as drift. If you would rather the reversal record live outside
the database, say so and I will emit it as a file instead.

### 3 — two behaviour changes in the stamper worth ratifying

(a) `tenantId: undefined` is now treated as *absent* and gets stamped; previously the old spread
shape let it through as a null row. Strictly better, but it is a change. (b) An explicit
`tenantId: null` is **preserved**, on the "never overwrite an explicit value" rule — so a caller can
still deliberately write a null row, and the audit will (correctly) shout about it. Both are
asserted in the gate.

### 4 — `STRUCTURE.md` still stale (ruling 6)

Now also on `lib/tenancy/stamp.ts`, `audits/nested-stamp-verify.ts`, `audits/nested-stamp/`, and
migration 48. Folded into the next cycle, as before.

---

## Cost / ops notes

- **New migration to deploy: `48_stamp_null_tenants_nested`.** Idempotent, reversible, self-reporting.
  It creates `_TenantStampBackfill48` and stamps any remaining null rows to
  `tnt_valentina_000000001`. On Jacob's DB it will report real counts — **read them**; a large count
  is information about how long the harnesses have been running there.
- **No new env vars. No new dependencies. No vendors touched.** No API keys were used or needed.
- **Migrations run in this session:** full reset → `migrate deploy` through 48 → `prisma/seed.ts` →
  `SEED_ENV=staging prisma/fixtures/seed-staging.ts`. `prisma db push` never used.
- **Two VERIFY-LOG.md files changed** (`audits/engage/`, `audits/password-reset/`) — those gates
  write their own logs, so the diff is an artifact of running the sweep, not an edit (ruling 17).
- **`audits/nested-stamp-verify.ts` depends on a Next internal**
  (`next/dist/client/components/request-async-storage.external.js`) to simulate a request. This is
  the only way to exercise the request path from a CLI harness, and the harness asserts the
  simulation works before trusting anything built on it — so a Next upgrade that moves the internal
  fails this gate loudly rather than quietly turning 30 checks into no-ops. Flagged as a known
  maintenance cost, not hidden.
- **Nothing was committed or pushed.**
