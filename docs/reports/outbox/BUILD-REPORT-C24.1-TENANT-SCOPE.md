# BUILD-REPORT — C24.1-TENANT-SCOPE

- **Spec:** C24.1-TENANT-SCOPE — close the class, close task #75
- **Status: PARTIAL** — every Verify item passes with observed evidence, the stamp audit exits **0
  after a 23-gate sweep**, and both §1 and §2 are gated green (`audits/tenant-scope-verify.ts`
  **48/48**). PARTIAL for one reason, stated up front: **assumption 3 was false — there was a
  second live producer of null-tenant rows (`audits/amd06/verify.ts`, +8 rows across 5 tables per
  run), and a third candidate family that cannot be run here.** Plus one pre-existing defect found
  in the tenancy layer that is not mine to fix (ARCHITECT-REQUEST 2). Task #75 is recommended
  **CLOSED** — see the reasoning at the end of Findings.

---

## THE FIVE ASSUMPTIONS — findings first

All mechanical evidence is in `audits/tenant-scope-verify.ts` (48/48) and
`audits/tenant-scope/VERIFY-LOG.md`, which the gate writes itself (ruling 17).

### A1 — "`AsyncLocalStorage` is available and safe in every context that runs a scoped write" · **CONFIRMED, with the edge case named rather than assumed.**

- `node:async_hooks` resolves in the `tsx` CLI runtime (asserted), and `npm run build` compiles
  `lib/prisma.ts` — which now imports it — into the Next server bundle successfully.
- The properties the fix actually depends on are proven, not presumed: the scope **survives await
  boundaries and nested async frames** (a driven product lib is several frames down), **concurrent
  scopes do not bleed** into one another (`Promise.all` of a default-tenant scope and a tenant-B
  scope each read back their own value), and the scope **does not leak past its own exit**
  (`ambientTenantId()` is null again afterwards).
- The one real risk with `async_hooks` is an **Edge-runtime** execution. Proven structurally
  absent: **zero** `runtime = "edge"` declarations anywhere in `app/`, `lib/`, `components/`, and
  `middleware.ts` (the one edge-by-default context) does not import the prisma client at all.
  Prisma cannot run on Edge regardless.
- The job tick route (`app/api/jobs/tick/route.ts`) is a plain Node route handler with no edge
  export — and it runs **inside a request**, so `headers()` resolves and precedence 1 applies. The
  scope is irrelevant there, which is the correct answer rather than a lucky one.

### A2 — "`lib/prisma.ts` resolves the tenant in exactly one place, so a single fallback consult covers every write path" · **CONFIRMED for the resolver, CORRECTED on "one place".**

There is exactly **one** resolver (`requestTenantId`), **one** `headers()` call and **one**
`ambientTenantId()` consult in the file (counted over code, comments stripped). But that resolver
is **called from two write paths** — `makeLazyOp` (which feeds `runOp`) and the array-form
`$transaction` (which feeds the synchronous `buildTxCall`). The spec's phrasing would have been
false if the fallback had been placed at a call site; it is inside the resolver, so one consult
does cover both. Proven functionally, not just by reading: inside a CLI scope, a plain create,
`$transaction(fn)` **and** `$transaction([...])` all stamp.

### A3 — "the only remaining in-repo producer of null-tenant rows is `audits/remarkable-recording/verify.ts`" · **FALSE.**

Re-attributed by running each candidate against a freshly-seeded DB and reading the invariant after
it, one gate at a time:

| harness | null rows produced (before this build) |
|---|---|
| `audits/amd06/verify.ts` | **+8 across 5 tables** every run: `package 1, priceBook 1, charge 2, assistGrant 2, auditEvent 2` |
| `audits/remarkable-recording/verify.ts` | +2: `handwrittenNote 1, appointment 1` (C24's finding, re-confirmed) |
| `prisma/fixtures/c12x-verify.ts` | 0 (C24 fixed it) |
| `audits/password-reset/verify.ts`, `scripts/smoke-writes.ts`, `audits/billing/b1–b4`, `audits/platform/phase1-switch`, `phase2`, `phase4`, and every gate in the spec's regression list | **0** |

**`audits/amd06/verify.ts` was a second live producer, and it is runnable here.** C24 missed it for
a structural reason worth recording: **it is not in any regression list**, so the per-gate
attribution sweep never ran it. It creates a price book, charges, assist grants and audit rows
through the scoped client from the CLI and does not clean up. It is now wrapped, and the gate
asserts a run leaves the invariant intact (`ALL CHECKS PASS`, nulls before=0 after=0).

Beyond that, a **static scan** now enumerates every file under `audits/`, `scripts/`, `prisma/`
that imports the **scoped** client and calls `create`/`createMany`/`upsert`: 11 files. 5 are
wrapped; 6 state their tenant another way and each is named with its reason in the gate
(`audits/platform/verify.ts`, `phase1-switch`, `phase2-verify` — multi-tenant harnesses that state
every tenant explicitly and would be *broken* by a single ambient scope;
`prisma/fixtures/seed-staging.ts` — states tenantId literally and runs a final convergence pass;
`audits/nested-stamp-verify.ts` — writes through simulated requests on purpose; and
**`audits/c12x-ai-pass/run{,2-fixes,3-patch01}.ts` — UNRESOLVED**, see ARCHITECT-REQUEST 1). The
gate fails if a future CLI file appears in neither list, so this is the "correct by default"
property law #5 asks for, enforced rather than remembered.

### A4 — "`audits/remarkable-recording/verify.ts` cannot run in this environment (it needs AssemblyAI)" · **CONFIRMED that it cannot run; the named credential is imprecise.**

It fails at **R.2**, not at the recording half: the handwriting transcription in `lib/remarkable.ts`
calls **Anthropic** (`ANTHROPIC_API_KEY` is present in this environment but is a placeholder value,
so the call returns **403**), the transcript comes back null, and the run dies at R.4 on a
`note.create` with a null body. Exit **1**. AssemblyAI (`ASSEMBLYAI_API_KEY`, absent) is needed for
the REC half further down. So: unrunnable here, for **two** vendor credentials, the first of which
is Anthropic. Marked **`NOT VERIFIED — vendor credential required (ANTHROPIC_API_KEY for the
handwriting half, ASSEMBLYAI_API_KEY for the recording half)`**.

**What I can honestly claim, and no more.** I ran it as a diagnostic after wrapping it. The portion
that executes before the credential failure creates exactly the two rows C24 attributed to it, and
**both are now stamped**: `HandwrittenNote → tnt_valentina_000000001 (1 row)`,
`Appointment → tnt_valentina_000000001 (1 row)`, and the null-tenant audit reads **0** after the
run (it read `+2` before). That is direct evidence for the rows that were the known symptom. It is
**not** a passing gate, and the rows the harness would create after R.4 are covered by the
mechanism *by construction* (same ambient scope) but were **not observed**. The change to it is a
mechanical application of a pattern proven on four harnesses that do run — not a hope.

### A5 — "the ~10 explicit call sites stamp because of this same CLI seam, and keep working unchanged" · **CONFIRMED, with one consequence worth knowing.**

**12** files stamp explicitly (`tenantId: DEFAULT_TENANT_ID` or `(await getTenant()).id`);
`lib/pattern-library.ts` still carries the precedent and its comment. Their values are intact:
rather than checking "these files were not touched" (two of them *were* touched — the one-line wrap,
and the referral gate's new log write), the gate extracts **every explicit stamping line** from each
file and compares it to `git show HEAD:<file>`; all 12 are byte-identical. Functionally: an explicit
`tenantId` beats the scope at the top level and at depth, including a **different** tenant's id,
which stays visible to the audit; an explicit `null` is still preserved (ruling 25); and an explicit
stamp with no scope at all still lands exactly as stated.

**The consequence:** because explicit wins, a call site that resolves its own tenant via
`getTenant()` — which returns the *default* tenant outside a request — will keep writing the default
tenant's id even inside `withTenantScope(B, …)`. That is correct under the never-override rule and
harmless today (single practice), but at multi-tenant those ~12 call sites will need to consult the
scope rather than `getTenant()`. Flagged now, not later.

### Task #75 — recommended CLOSED

Ruling 27 set the condition precisely: *"#75 closes when `withTenantScope` lands and both harnesses
use it."* Both conditions are met, the audit exits 0 after a 23-gate sweep, and the symptom
attributed to the unrunnable harness is observed gone. The residue is **not** #75 — it is the newly
found `c12x-ai-pass` family, filed as a new task (#80) rather than left blurring an old one.

---

## Built

- **`lib/tenancy/tenant-scope.ts` (new)** — `withTenantScope(tenantId, fn)` +
  `ambientTenantId()`, backed by `AsyncLocalStorage`. Returns whatever `fn` returns, so it wraps
  sync and async bodies alike. An empty/non-string tenant **throws** rather than silently degrading
  to passthrough. The header states the precedence and states out loud what it deliberately is not
  (an implicit default-tenant stamp — ruling 24's rejected option).
- **`lib/prisma.ts`** — one line of behaviour: the `catch` around `headers()` now returns
  `ambientTenantId()` instead of `null`. The request path **cannot reach it**, so no wrapper can
  override a request's tenant. Header comment's "known honest limits" section updated to describe
  the new seam and to record that implicit stamping was considered and rejected.
- **Adoption (§2), one line each** — `prisma/fixtures/c12x-verify.ts` (its explicit stamps left in
  place as belt-and-braces, as the spec asks), **`audits/amd06/verify.ts`** (the newly found
  producer), `audits/password-reset/verify.ts`, `scripts/smoke-writes.ts`.
- **Adoption (§3)** — `audits/remarkable-recording/verify.ts`, wrapped identically, with a comment
  that says in the file itself that it is unverified here and why.
- **`audits/tenant-scope-verify.ts` (new, 48 checks)** — house style, self-cleaning, writes
  `audits/tenant-scope/VERIFY-LOG.md` itself. Request-path checks run through the **real** scoped
  client against the **real** database inside a simulated request scope (the same deliberate Next
  internal C24's gate uses), and it asserts the simulation is real before trusting anything built on
  it. It runs `c12x-verify` and `amd06` in-process with before/after null counts, and it proves the
  standing audit still exits **non-zero** on an unscoped write.
- **`audits/referral/verify.ts` (task #79)** — now collects its check lines and writes
  `audits/referral/VERIFY-LOG.md` itself, as its siblings do. Verified by running it: 68/68, log
  written with the real result (78 lines).
- **`/practitioner/settings` i18n (task #78)** — new `messages/{en,es}/practitionerSettings.json`
  (85 keys each) + `lib/practitioner-settings-copy.ts` (same shape as `lib/referral-copy.ts`;
  locale = `User.locale` with `?lang=` override, ruling 14). The page's inline `SAVED`/`ERRORS`
  dictionaries and every inline label — including the referrals link row — now come from the
  catalog. **It is an i18n move, not a copy rewrite, and that is machine-checked:** the new gate
  `audits/settings-i18n-verify.ts` (10/10) matches all **85** English strings against
  `git show HEAD:app/practitioner/settings/page.tsx` and both locales' rendered pages.
- **`STRUCTURE.md`** — brought current on C23-REFERRAL, C23-ENGAGE, C24, C24.1 and task #78 (feature
  map rows), on `lib/tenancy/*` and `lib/prisma-internal.ts`, on migrations through 48 (with the
  `_TenantStampBackfill48` / never-`migrate dev` note), and on the `audits/`, `scripts/`,
  `messages/`, `docs/` trees that were entirely absent.
- **`scripts/guard-prisma.ts` + `docs/PRISMA-ALLOWLIST.md`** — allowlist entry for the new harness
  (harness only; **no product code needed one**), and the known-limits section rewritten to name
  `withTenantScope`, the precedence, and all three violators with their row counts.

**Nothing was excluded, narrowed or softened.** One scanner exclusion changed and it is reported:
`audits/nested-stamp-verify.ts`'s nested-write scan already excluded itself as its own positive
control; the new sibling gate also writes nested payloads deliberately, so the exclusion is now a
named two-file list (`PROBE_HARNESSES`). The claim under test — that no *product* code performs a
nested relation write on a scoped model — still runs over the other ~465 files, and the
"scanner is not blind" check still requires it to find the deliberate ones.

---

## Verification — each Verify item, PASS/FAIL + evidence

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Five assumptions confirmed or corrected in writing | **PASS** | Section above. A1 confirmed (with the Edge case proven absent), A2 corrected ("one place" is one *resolver*, two call sites), **A3 FALSE** (`amd06` +8 rows / 5 tables; `c12x-ai-pass` unresolved), A4 confirmed but the named credential corrected to Anthropic-first, A5 confirmed with the `getTenant()` consequence flagged. ~20 mechanical checks in the gate. |
| 2 | A CLI write inside `withTenantScope(T, …)` is stamped `T` | **PASS** | `logEntry.create` in a CLI context → `tnt_valentina_000000001`; under a non-default scope → `tnt_tcv_probe_b_00001`; `$transaction(fn)` → stamped; `$transaction([...])` (the separate array-form builder) → stamped; a write several async frames below the wrap → stamped. |
| 3 | Nested children and grandchildren inside a `withTenantScope` CLI write | **PASS** | Course + 2 chapters + 3 lessons (nested `create` **and** nested `createMany`) all `tnt_valentina_000000001`; a nested create inside an `update` stamps child + grandchild; a non-default scope stamps its own id at depth. |
| 4 | **Request headers still win** | **PASS** | Four ways round, all observed: scope inside a request → request's tenant; request inside a scope → request's tenant (precedence is not nesting-order dependent); tenant B's request + a default-tenant wrapper → stays **B**; nested children inside a request → request's tenant at every depth, wrapper reaches none. **Reads too:** inside B's request a default-tenant wrapper cannot read her row (returns nothing). |
| 5 | **Absence is unchanged; no implicit default-tenant stamping** | **PASS** | An unscoped CLI create writes `tenantId = null` (**not** the default tenant), the audit reports it by table name (`{"logEntry":1}`) and `audits/tenant-stamp-audit.ts` exits **1** on it — detection surface intact. A nested child with no scope also stays null: no implicit default at any depth. Asserted too that `lib/prisma.ts` has no default-tenant write fallback (its only `?? DEFAULT_TENANT_ID` is the pre-existing unknown-*slug* case **inside** a request). |
| 6 | Explicit `tenantId` still wins, incl. a different tenant's, and stays audit-visible | **PASS** | Under `withTenantScope(B)`: explicit top-level default id → stored as default; nested explicit `B` → `B`; nested explicit `tnt_tcv_foreign_00001` → **unchanged**, and findable as that tenant's row (1 row). Explicit `null` preserved and still counted by the audit (ruling 25 intact). |
| 7 | The ~10 explicit call sites keep their exact values | **PASS** | All 12 files' explicit stamping lines compared **line-by-line against `HEAD`** — identical. Functionally: `lib/pattern-library.setPatternElection`'s stated tenant survives an ambient scope; an explicit stamp with no scope lands as stated. |
| 8 | Full sweep, then `tenant-stamp-audit` exits **0**; `platform/verify` passes | **PASS** | Fresh reset (drop/create/`migrate deploy` through 48/`seed.ts`/`seed-staging.ts`) → `npm run build` → **23 gates** run one at a time with the null count read after each (all 0) → `tenant-stamp audit: PASS — zero null-tenant rows across all scoped tables`, **exit 0**. Then `audits/platform/verify.ts`: `✓ zero null-tenant rows across every scoped table — 79 tables checked` · `ALL CHECKS PASS`, exit 0. Audit re-run after it: still 0. Sweep first, audit after, as C24 did. |
| 9 | Nested-stamp gate at full count; `c12x-verify` still 23 passed | **PASS** | `NESTED-STAMP VERIFY PASS — 43/43`; `prisma/fixtures/c12x-verify.ts` → `23 passed · 0 failed`. New gate `TENANT-SCOPE VERIFY PASS — 48/48`, run twice, self-cleaning both times (`residual = {}`). |
| 10 | Settings i18n: both locales, same wording, identical key sets | **PASS** | `audits/settings-i18n-verify.ts` **10/10** against the built app: key sets identical (85/85, diff none); **all 85 English strings matched against `HEAD:app/practitioner/settings/page.tsx`**; EN page 200 and ES page (`?lang=es`) 200 with every unconditional string present in each (62 each; the 23 conditional ones — flash messages, tool rows, deletion rows, the proportionality warning — are **named** in the gate, not silently skipped); the two renders are different documents; no English section heading leaks into the ES render. |
| 11 | Referral gate writes its own VERIFY-LOG.md with its real result | **PASS** | Ran it: `REFERRAL VERIFY PASS — 68/68`, and `audits/referral/VERIFY-LOG.md` now exists, written by the gate, ending in that summary. |
| 12 | Regression list | **PASS** | `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean · `npm run build` ✓ Compiled successfully · `smoke` PASS · `smoke:writes` PASS · signup **37/37** · capture **59/59** · referral **68/68** · engage **172/172** · platform phase2 **16/16**, phase3 **11/11**, phase5 **17/17** · c21 **58/58** · c20 **28/28** · v31 **32/32** · c12x **23 passed · 0 failed** · onboarding complete **16/16**, stage1 **17/17**, update **7/7**, ui **10/10**, discovery **19/19** · password-reset **ALL CHECKS PASS** · nested-stamp **43/43**. Plus, beyond the list: amd06 **ALL CHECKS PASS** (and now null-clean), platform/verify **ALL CHECKS PASS**, tenant-scope **48/48**, settings-i18n **10/10**. Every gate's null count read individually: **0 after every one**. |

Not run, per environment constraints and not in the regression list: `pipeline/p12`,
`fixtures/values-verify`, `audits/c12x-ai-pass/*`, and `remarkable-recording` **as a gate** (see A4;
run only as a diagnostic). `audits/billing/b1-verify` and `platform/phase1-switch` also fail here
for unrelated environment reasons (checked anyway: neither produces null rows). The 16-screen visual
baseline was not recaptured or committed (ruling 11); this build touches no `/space` or `/login`
chrome — `/practitioner/settings` is a practitioner surface, and its English wording is proven
unchanged.

---

## Discrepancies & decisions needed

### ARCHITECT-REQUEST 1 — `audits/c12x-ai-pass/run{,2-fixes,3-patch01}.ts`: three unresolved candidates of the same shape

**Context.** Assumption 3 was false in two directions. `amd06` I found, ran and fixed. These three
one-off "AI pass" evidence scripts import the scoped client, run from the CLI, and create scoped
rows (`logEntry`, `recordItem`, `lensResult`, `clientProfile` updates) without stating a tenant.
They need a **real** `ANTHROPIC_API_KEY`, so I cannot run them and cannot prove they produce null
rows — the static shape says they would.

**The ambiguity.** §3 authorised the mechanical one-line wrap for exactly **one** unrunnable
harness. Ruling 27 says a gate that cannot be run must not be edited on faith. These are not gates
in any standing set (not in `package.json`, not in any regression list) — they are historical
evidence runs.

**Options.**
1. **Wrap all three the same way** (3 lines total). Consistent with §3's treatment, closes the
   class completely, and the risk is bounded: if they are never run again the change is inert; if
   they are, they stamp instead of leaving nulls.
2. **Leave them, keep the guard.** The new gate's scanner already names them as UNRESOLVED and will
   fail if anyone adds a *new* unwrapped CLI writer, so the exposure is visible rather than silent.
   Filed as task #80.
3. Delete them as spent one-off artifacts (out of scope for me to propose seriously).

**Recommendation: option 1**, and I did not do it because the spec named one file, not a class of
them. **Blocked until answered:** whether "the class is closed" is literally true, or true except
for three files nobody expects to run again.

### ARCHITECT-REQUEST 2 — a pre-existing tenancy defect, found by this build, not introduced by it: **no non-default tenant can write a `PracticeSetting`**

**Context.** The scoped client's fail-closed ownership pre-check on unique writes
(`update`/`delete`/`upsert`) runs `findFirst({ …, select: { id: true } })`. **`PracticeSetting` is
the one scoped model with no `id` column** (its primary key is `key`), so that pre-check throws a
Prisma **validation** error before it can check anything. Observed both from a CLI scope and — the
part that matters — **inside a real request on a non-default tenant's host**. The default tenant is
unaffected because it skips the pre-check entirely, which is why nothing has ever noticed.

**Why it matters now.** `prisma.practiceSetting.upsert` appears in ~10 product paths (settings,
messages/away note, schedule, notes inbox, patterns, design, agreements signature, Square). Since
C23-SIGNUP a real second practice can exist. For that practice, every one of those saves throws.
It fails in the **safe** direction — nothing crosses a tenant boundary — but it is a functional
wall, not a cosmetic one.

**Options.**
1. **Make the pre-check select the model's real primary key** (from the DMMF, like the stamper does)
   instead of hardcoding `id`. Smallest correct fix; touches the most security-critical line in the
   codebase, so it wants its own spec and its own gate.
2. **Give `PracticeSetting` an `id`** and make `(tenantId, key)` the unique constraint. Bigger
   migration; arguably the right model shape for multi-tenant anyway, since `key` alone is globally
   unique today — which is a second, separate multi-tenant problem hiding in the same model.
3. Ship as-is and handle it in the multi-tenant conversion program.

**Recommendation: option 1 now, option 2 inside the multi-tenant program.** I did not touch it:
changing the fail-closed path is not in this spec's build order, and doing it unasked in this
subsystem is exactly the move I should not make. **Blocked until answered:** whether a second
practice can save practice settings. The evidence is a passing check in
`audits/tenant-scope-verify.ts` so it cannot be forgotten.

### 3 — adopting a NON-default scope changes `upsert`-of-a-new-row behaviour (informational)

Same pre-check, different consequence: under `withTenantScope(B, …)` an `upsert` whose target row
does not exist yet is **refused** (`tenant-scope: course.upsert target not found in tenant scope`),
where before the wrap it passed through and succeeded. Pre-existing request-path behaviour, now
also reachable from a CLI scope. It does not affect this build's adoptions (all default-tenant), but
the first harness wrapped in a non-default scope will hit it. Asserted in the gate so it is a known
property, not a surprise.

### 4 — the `getTenant()` call sites will need the scope at multi-tenant (informational)

See A5. ~12 files resolve their own tenant via `getTenant()`, which outside a request returns the
**default** tenant regardless of any ambient scope, and explicit wins. Correct today, wrong the day
a script must run as practice #2.

### 5 — one scanner exclusion widened, disclosed (informational)

`PROBE_HARNESSES` in `audits/nested-stamp-verify.ts` — see the note at the end of Built. No check
was weakened; the exclusion list went from one acceptance harness to two.

---

## Cost / ops notes

- **No new migration.** Nothing schema-touching in this build. Migration 48 remains the one pending
  deploy (unchanged from C24's report, including the `_TenantStampBackfill48` / never-`migrate dev`
  note, ruling 26).
- **No new env vars, no new dependencies, no vendors touched.** No API key was used; the placeholder
  `ANTHROPIC_API_KEY` in the scratch environment produced a 403 and nothing else.
- **New gates to add to the standing set:** `audits/tenant-scope-verify.ts` **48/48** and
  `audits/settings-i18n-verify.ts` **10/10** (the latter needs `npm run build` first — it drives the
  built app on :3131). `audits/referral/verify.ts` now writes its own log, so the referral gate's
  evidence no longer lives only in a build report.
- **Migrations run this session:** two full resets → `migrate deploy` through 48 → `prisma/seed.ts`
  → `SEED_ENV=staging prisma/fixtures/seed-staging.ts`. `prisma db push` and `prisma migrate dev`
  never used.
- **VERIFY-LOG.md files changed as an artifact of running the sweep** (ruling 17: the gates write
  them): `audits/amd06/`, `audits/engage/`, `audits/password-reset/`, `audits/nested-stamp/`, plus
  the new `audits/tenant-scope/`, `audits/settings-i18n/` and `audits/referral/`.
- **`audits/tenant-scope-verify.ts` depends on the same Next internal as C24's gate**
  (`next/dist/client/components/request-async-storage.external.js`) to simulate a request, and
  asserts the simulation works before trusting anything built on it — so a Next upgrade that moves
  the internal fails the gate loudly rather than turning its request-path checks into no-ops. Known
  maintenance cost, not hidden.
- **Nothing was committed or pushed.**
