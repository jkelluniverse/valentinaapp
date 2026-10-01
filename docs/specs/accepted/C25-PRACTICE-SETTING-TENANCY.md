# C25-PRACTICE-SETTING-TENANCY — the founding practitioner's portal must actually work

**Spec:** C25-PRACTICE-SETTING-TENANCY · **Depends-on:** C23-SIGNUP (creates non-default tenants self-serve), C24 / C24.1 (the stamping and scope work), PLATFORM Phases 0–5
**Priority:** **HIGHEST IN THE PROGRAM.** This is the only known defect that breaks the September 23 demo for the people it was built to impress.
**Architect:** decided 2026-09-05, implementing ruling 32.

## Why this exists

**No non-default tenant can write a `PracticeSetting`.** Reproduced directly by the Architect: create a
tenant, write a setting inside its scope, and it throws in the fail-closed pre-check at `lib/prisma.ts:139`
— `findFirst({ select: { id: true } })` on a model whose primary key is `key`, with no `id` column at all.
It never reaches the tenancy check; it dies on a Prisma validation error first.

The same reproduction surfaced a second defect in the same model: `PracticeSetting_pkey` is a UNIQUE index
on `key` **globally**. So even with the pre-check fixed, two practices could never hold the same setting key
— which is to say the model cannot represent more than one practice's settings at all.

**Why this is urgent rather than architectural.** Before C23-SIGNUP, the only practice was the default
tenant, so nothing exercised this path. Now practitioners create ACTIVE non-default tenants *themselves, at
the event*. Every founding practitioner who signs up on September 23 is a non-default tenant;
`practiceSetting.upsert` appears in roughly ten product paths. A practitioner who signs up in the room and
then cannot save a setting is the demo failing in front of exactly the audience it exists to convince.

It fails safe — nothing crosses tenants, the portal simply refuses — which is precisely why it went unnoticed.

## Assumptions to verify, not trust

*(Ruling 18. The Architect's beliefs, not facts. C24 and C24.1 each disproved one; both times that was the
most valuable thing in the report. Do the same here.)*

1. The pre-check at `lib/prisma.ts:139` hardcodes `id` as the selected key, and `PracticeSetting` is the
   **only** scoped model without an `id` column. **Verify across all 79 scoped models** — if there is a
   second such model, the blast radius is larger than this spec assumes and you should say so.
2. `PracticeSetting`'s primary key is `key`, and that PK is the only uniqueness constraint on the table.
3. Roughly ten product paths call `practiceSetting` writes, and they use `where: { key }`.
4. The **engage kill-switch and global pause live in `PracticeSetting`** (`engageEnabled` / `engagePaused`,
   ruling 19). Any change here therefore changes the safety mechanism of the mailer — so it must keep working
   exactly as it does today, and that is a Verify item rather than a hope.
5. The default-tenant path works today, and Valentina's production rows must survive any migration
   untouched and readable.

## Standing laws this build must honor

- **Server-side enforcement (law #5)** — the fix belongs in the data layer and the schema, not in call-site
  discipline.
- **Attributable audit (law #6)** — no narrowing of what any audit checks.
- **Fail closed** — if a change here is wrong, it must refuse rather than leak. The pre-check exists because
  a scoped write with no verifiable target is a potential cross-tenant write; keep that property.
- **Money integrity (law #9)** — some settings are fee-adjacent (the policy engine is config-driven). Do not
  alter any value's meaning while moving its storage.
- **Kill-switches (law #10)** — see assumption 4. The engage switches must not be weakened, and must not
  silently change default.

## Build order

### 1. Fix the pre-check properly

In `lib/prisma.ts`, derive the model's identifying field from the Prisma DMMF rather than assuming `id`.
The pre-check must keep doing what it does today — verify the target row is inside the request's tenant
before a write — for every scoped model, including ones whose PK is not `id`.

If the DMMF-derived approach has a case it cannot serve, **fail closed and say so** rather than skipping the
check for that model. A model that silently bypasses the pre-check would be a hole in the tenancy wall
wearing this fix's clothes.

### 2. Rescope `PracticeSetting` uniqueness to the practice

Give the model a tenant-scoped identity: `(tenantId, key)` unique, so each practice holds its own settings.
The Architect's expectation is an `id` primary key plus a `@@unique([tenantId, key])`, matching how every
other scoped model in this schema is shaped — but if the codebase's own conventions or the scoped client's
`upsert` handling make a different shape cleaner, **raise an ARCHITECT-REQUEST with your recommendation
rather than forcing the expected one.**

Migration `49_practice_setting_tenancy`:
- Backfills existing rows to the default tenant, following the `36_stamp_null_tenants` and
  `48_stamp_null_tenants_nested` precedents.
- **Reversible**, reports its row counts, fails loudly on schema drift.
- States its single-practice assumption out loud in the comment, as migration 48 does.

Then update every call site that identifies a setting by `key` alone. Values and meanings do not change —
only how a row is addressed.

### 3. Prove the practitioner path end to end

A founding practitioner created the way C23-SIGNUP creates one must be able to write and read their own
settings, and must not see or affect anyone else's.

## Verify (this list is the gate — evidence required per item)

Write `audits/practice-setting-verify.ts` in house style, self-cleaning:

1. Each of the five assumptions confirmed or corrected in writing, with evidence — including the sweep of
   all 79 scoped models for a missing `id`.
2. **The reproduction, before and after.** Show the failure this spec exists to fix (state how you
   demonstrated the pre-fix behavior), then the same write succeeding.
3. A non-default tenant writes a `PracticeSetting` **inside a real request on its own host** and reads it
   back — not only through `withTenantScope`, because the request path is what a practitioner actually uses.
4. **Two practices hold the same key independently:** tenant A and tenant B both set `foo`, each reads its
   own value, and neither can read or overwrite the other's. This is the defect that made the model
   single-practice; prove it is gone.
5. A practitioner created through the real signup service can write and read their own settings.
6. **The engage kill-switch and pause still behave exactly as ruling 19 requires:** the gate still defaults
   CLOSED, a closed gate still records `SKIPPED`, and pause still beats gate. Run the engage gate itself.
7. Valentina's default-tenant settings survive the migration readable and unchanged — assert specific
   pre-existing rows before and after.
8. The pre-check still refuses a cross-tenant write on `PracticeSetting` (fail-closed preserved, not traded
   away for the fix) and on a normal `id`-keyed model.
9. Migration reports counts, is idempotent, and the documented reversal restores the prior state.
10. Full sweep, then `audits/tenant-stamp-audit.ts` exits **0**; `audits/platform/verify.ts` passes.
11. Regression, non-negotiable: `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean ·
    `npm run build` succeeds · `smoke` + `smoke:writes` PASS · `signup` **37/37** · `capture` **59/59** ·
    `referral` **68/68** · `engage` **172/172** · `tenant-scope` **48/48** · `nested-stamp` **43/43** ·
    `settings-i18n` **10/10** · `platform` phase2 **16/16**, phase3 **11/11**, phase5 **17/17** ·
    `c21` **58/58** · `c20` **28/28** · `v31` **32/32** · `c12x` 23 passed · `onboarding` 16/16, 17/17,
    7/7, 10/10, 19/19 · `password-reset` PASS · `amd06` PASS. Any movement means not done.

## Out of scope (do not build)

The multi-tenant conversion program · changing any setting's meaning or default value · new product
surfaces · task #77 (shared rate-limit store) or #80 (`c12x-ai-pass` wraps) · touching Valentina's
client-visible chrome · recapturing the visual baseline.
