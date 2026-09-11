# C25-PRACTICE-SETTING-TENANCY — acceptance log

Run: 2026-09-11T17:51:25.341Z · `npx tsx audits/practice-setting-verify.ts`
Database: postgresql://postgres:***@localhost:5432/veritas_scratch

Verify 3 and 5 run in a REAL BROWSER against the BUILT app, on each
practice's own host, for practices provisioned by the real signup service.
Verify 7 and 9 reverse migration 49 and re-apply it against the live
database, comparing every row before and after.

# C25-PRACTICE-SETTING-TENANCY verify — 2026-09-11T17:51:04.332Z

## Verify 1 — the five assumptions, confirmed or corrected
- ✓ A1 — the 79-model sweep: no scoped model lacks an `id` column, and none is keyed by anything else — 79 models swept · no-id: none · pk≠id: none
- ✓ A1 — CONFIRMED at HEAD too: `PracticeSetting` was the ONLY scoped model with no `id` column, so the blast radius was exactly as the spec assumed — HEAD scoped models with no id column: PracticeSetting
- ✓ A1 — and the pre-check no longer hardcodes a key: HEAD selected `{ id: true }`, the current file derives it from the DMMF and cannot skip the check — HEAD: `select: { id: true }` present · now: identitySelect(model), which THROWS when it cannot derive one
- ✓ A2 — CONFIRMED: at HEAD `key` was the primary key AND the only uniqueness constraint on the table (no @unique, no @@unique, no @@id) — HEAD constraint annotations on PracticeSetting: @id
- ✓ A2 — and it is now (tenantId, key): primary key on `id`, one unique index on (tenantId, key) — pk=(id) · indexes: PracticeSetting_pkey | PracticeSetting_tenantId_key_key
- ✓ A3 — CORRECTED, and upward: the spec's "roughly ten" write paths is right for `upsert` alone, but the unique-key surface is larger — at HEAD: 21 `upsert` sites and 42 unique-key call sites in total (upsert/update/delete/findUnique) across 32 files — every one of them addressed the row by `key` alone
- ✓ A3 — and NO product code addresses a setting by unique key any more: lib/practice-settings.ts is the only place that does — 0 remaining sites under app/ and lib/ · 5 CLI harness site(s) remain, each on its own client
- ✓ A3 — and nothing anywhere addresses a setting by `key` ALONE: every remaining CLI site names the tenant-qualified (tenantId, key) — audits/agreements/c21-verify.ts:upsert, audits/agreements/v31-verify.ts:upsert, audits/agreements/v31-verify.ts:upsert, audits/engage/verify.ts:upsert, prisma/fixtures/kfloor-verify.ts:upsert
- ✓ A4 — CONFIRMED: the engage kill-switch and pause are `PracticeSetting` rows, read by `findFirst({ where: { key } })`, and lib/engage.ts is BYTE-IDENTICAL to HEAD — both switches read through a filter-form findFirst, which the scoped client already scopes — so this build changed zero lines of lib/engage.ts
- ✓ A5 — CONFIRMED: the default tenant's settings are readable, and after migration 49 none of them is a null-tenant row — 1 default-tenant row(s) · 0 null-tenant row(s)

## Verify 2 — the reproduction, before and after
- ✓ BEFORE — both ingredients of the failure are documented at HEAD: a hardcoded `{ id: true }` select, and a model with no `id` column — reproduced live at HEAD before any edit: `PrismaClientValidationError: Invalid d.findFirst() invocation in lib/prisma.ts:139` — quoted in full in the build report
- ✓ BEFORE — and the failure mode is live, not asserted: selecting a column the model does not have is a PrismaClientValidationError, thrown before any tenancy check can run — error class: PrismaClientValidationError

## Verify 5 (first, because 3 and 4 build on it) — two practices created by the REAL signup service
- ✓ two ACTIVE non-default practices exist, provisioned by lib/signup.ts exactly as a founding practitioner creates one — cmtx95rde0001xp6qq9ext0o9 (ACTIVE) · cmtx95rnr0009xp6qz9nn9a9y (ACTIVE)

## Verify 2 (after) + 4 — the write succeeds, and two practices hold the same key independently
- ✓ AFTER — the exact write this spec exists to fix now SUCCEEDS for a non-default tenant, and is stamped to that tenant — 3 rows for the one key: cmtx95rde0001xp6qq9ext0o9=A-value · cmtx95rnr0009xp6qz9nn9a9y=B-value · tnt_valentina_000000001=default-value
- ✓ V4 — THREE practices hold the SAME key with DIFFERENT values (the model was structurally single-practice before this build) — A-value, B-value, default-value
- ✓ V4 — each practice reads its OWN value and only its own — A=A-value · B=B-value · default=default-value
- ✓ V4 — a practice cannot READ a key only another practice holds — A reading B's psxProbeSecondKey: nothing
- ✓ V4 — a practice cannot OVERWRITE another practice's value for the same key: it gets its own row — B=B-only (untouched) · A=A-own (its own row)
- ✓ V4 — naming another practice's row EXPLICITLY is refused by the pre-check, and that practice's value is unchanged — tenant-scope: practiceSetting.update target not found in tenant scope

## Verify 8 — fail-closed preserved, on PracticeSetting AND on a normal id-keyed model
- ✓ V8 — an UPSERT aimed at another practice's existing PracticeSetting row is REFUSED (the fix did not trade fail-closed away) — tenant-scope: practiceSetting.upsert target belongs to another tenant
- ✓ V8 — a DELETE aimed at another practice's PracticeSetting row is REFUSED and the row survives — tenant-scope: practiceSetting.delete target not found in tenant scope
- ✓ V8 — on a normal `id`-keyed model the pre-check still refuses a cross-tenant unique write, and the target row is untouched — tenant-scope: patternArchetype.upsert target belongs to another tenant · target still b/cmtx95rnr0009xp6qz9nn9a9y
- ✓ V8 — and an UPDATE by another tenant's primary key is still refused — tenant-scope: patternArchetype.update target not found in tenant scope
- ✓ V8 — the DMMF derivation serves a compound PK and a non-`id` PK, and FAILS CLOSED (throws) for a model it cannot identify — it never returns a skip — compound={"a":true,"b":true} · non-id pk={"key":true} · unkeyable throws ModelIdentityError · unknown delegate throws ModelIdentityError
- ✓ V8 — and the derivation covers every one of the 79 scoped models, so no write reaches the fail-closed branch unidentified — 79/79 scoped delegates resolve to a non-empty identity select

## Verify 6 — the engage kill-switch and pause (ruling 19), unchanged
- ✓ V6 — with NO rows and no env override the gate is CLOSED and nothing is paused (an absent row still means closed) — gateOpen=false paused=false
- ✓ V6 — a deliberate row OPENS the gate, and the pause then BEATS the gate (both stored in the model this build changed) — after engageEnabled=on: open=true/paused=false · after engagePaused=on: open=true/paused=true
- ✓ V6 — back to CLOSED by default, and a closed gate still records SKIPPED for every due step (never SENT) — gateOpen=false · 2 due step(s), planned: SKIPPED

## Verify 7 + 9 — Valentina's rows through the migration, and the migration itself
- ✓ V9 — the reversal FAILS LOUDLY (never silently) while two practices hold the same key, exactly as the migration's comment states — ERROR:  could not create unique index "PracticeSetting_pkey" · all 3 rows still present
- ✓ V7 — Valentina's specific default-tenant rows asserted BEFORE the migration is touched — psxProbeAssistNotify="off" · psxProbeMethodText="Hold the tension between belonging and sovereignty." · psxProbeAwayNote="Back Monday. Urgent matters: call the office."
- ✓ V9 — the documented REVERSAL restores the prior schema exactly: primary key back on (key), no `id` column, no unique (tenantId, key) — pk=(key) · id column present: 0 rows
- ✓ V9 — and restores the prior DATA exactly: the stamped legacy row is null again, and Valentina's rows are untouched — psxProbeAssistNotify=off@tnt_valentina_000000001 | psxProbeAwayNote=Back Monday. Urgent matters: call the office.@tnt_valentina_000000001 | psxProbeLegacyNull=legacy-value@<null> | psxProbeMethodText=Hold the tension between belonging and sovereignty.@tnt_valentina_000000001
- ✓ V9 — the migration REPORTS ITS COUNTS on the run that does the work — · id column added; 5 existing row(s) given an id | · primary key moved from (key) to (id) | · 1: null-tenant row(s) stamped to the default tenant | · unique index (tenantId, key) created | 49_practice_setting_tenancy: 5 row(s) in "PracticeSetting" — 5 given an id, 1 stamped to the default tenant, 0 values changed
- ✓ V9 — and the second run is IDEMPOTENT: 0 ids, 0 stamps, 0 values changed, nothing to move, nothing to add — · id column already present — nothing to add (idempotent re-run) | · primary key is already (id) — nothing to move (idempotent re-run) | · 0 null-tenant rows to stamp (migrations 36/48 already converged them) | · unique (tenantId, key) already present — nothing to add (idempotent re-run) | 49_practice_setting_tenancy: 5 row(s) in "PracticeSetting" — 0 given an id, 0 stamped to the default tenant, 0 values changed
- ✓ V7 — Valentina's rows survive the round trip READABLE and UNCHANGED: same keys, same values, same owner — psxProbeAssistNotify="off"@tnt_valentina_000000001 · psxProbeMethodText="Hold the tension between belonging and sovereignty."@tnt_valentina_000000001 · psxProbeAwayNote="Back Monday. Urgent matters: call the office."@tnt_valentina_000000001
- ✓ V7 — and EVERY OTHER ROW in the table is byte-identical across the reversal + re-application — key, value and owner, for every practice, not just the sampled ones — 4 rows fingerprinted, identical before and after
- ✓ V9 — the reversal ledger records exactly the rows whose tenantId the migration stamped, and nothing else — _PracticeSettingTenancy49: psxProbeLegacyNull

## Verify 3 — a founding practitioner writes and reads a setting INSIDE A REAL REQUEST on their own host
- ✓ both founding practitioners sign in on their OWN host and reach their own settings page (the surface the defect blocked) — http://psxprobea.psx.test:3141/practitioner/settings · http://psxprobeb.psx.test:3141/practitioner/settings
- ✓ …and the request really carries her own host, so this is the request path a practitioner uses, not a simulation — Host: psxprobea.psx.test:3141
- ✓ V3 — the setting is WRITTEN inside a real request on her own host, owned by HER practice — rows before=0 · after: value=off tenantId=cmtx95rde0001xp6qq9ext0o9 · url /practitioner/settings?saved=assist
- ✓ V3 — and READ BACK inside a real request: her page renders the value she just saved — assistNotify checkbox rendered checked=false (she turned it off)
- ✓ V3/V4 — the OTHER practice's identical page is untouched by her save: no row of its own, default state, and Valentina's practice unaffected — B checkbox=true · B rows=0 · default-tenant rows=0
- ✓ V3/V4 — both practices now hold `assistNotifyEmail` independently, each written through its own real request — cmtx95rde0001xp6qq9ext0o9=off · cmtx95rnr0009xp6qz9nn9a9y=off
- ✓ V3 — saving the same key again UPDATES her one row (no duplicate), and the other practice's value is still its own — A: 1 row(s) = on · B still off
~ probe practices, probe settings and probe archetypes removed
- ✓ SELF-CLEANING: this harness leaves zero null-tenant rows behind — {}
- ✓ SELF-CLEANING: no probe settings left in the table — 0 rows
- ✓ the audit still covers every scoped table (79 tables, nothing narrowed) — 79 tables

PRACTICE-SETTING VERIFY PASS — 47/47
