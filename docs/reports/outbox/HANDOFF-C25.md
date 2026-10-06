# HANDOFF — C25-PRACTICE-SETTING-TENANCY (incomplete, 40/41, for the other Claude Code session)

**Written 2026-09-11 by the Architect (Hyperagent thread), on Jacob's instruction to hand C25 over and stand down.**
**Branch:** `claude/c25-handoff`, based on `b427c92`. **Deliberately NOT pushed to
`claude/valentinaapp-github-repo-erf4xp`** — see "Why this is on a side branch" below.

## What this is

C25 fixes the defect that stops **every practitioner who signs up at the September 23 event** from saving a
setting in their portal. The build was dispatched on Sept 5, the builder was stopped mid-flight when that
session ended, and the work survived only in that sandbox — **it was never in the repo until this branch.**
This handoff exists so none of it has to be rediscovered.

**Status: 40 of 41 checks pass. One fails. Do not treat it as done, and do not treat it as broken.**

## The defect, for context

Two defects in one model, both reproduced directly before any fix:

1. The scoped client's fail-closed pre-check called `findFirst({ select: { id: true } })`, and
   `PracticeSetting` was the one scoped model with **no `id` column** (PK was `key`). Writes died on a Prisma
   validation error at `lib/prisma.ts:139` before reaching the tenancy check.
2. `PracticeSetting_pkey` was UNIQUE on `key` **globally** — so two practices could never hold the same
   setting key. The table could not represent more than one practice's settings at all.

Invisible until now because before C23-SIGNUP there was only one practice. Self-serve signup created the
condition. It fails *safe* — the portal simply refuses — which is why nothing alerted.

## What is built

- `lib/tenancy/model-identity.ts` — derives a model's identifying field from the Prisma DMMF instead of
  assuming `id`. **Fails closed** (throws `ModelIdentityError`) for a model it cannot identify; it never
  returns a "skip". Verified against a compound PK, a non-`id` PK, an unkeyable model, and an unknown delegate.
- `lib/prisma.ts` — pre-check uses the derived identity.
- `prisma/schema.prisma` — `PracticeSetting` gains `id String @id @default(cuid())` and `@@unique([tenantId, key])`.
- `prisma/migrations/49_practice_setting_tenancy/migration.sql` — adds and backfills `id`, moves the PK,
  backfills null `tenantId` to the default tenant, adds the composite unique. Counted, idempotent,
  reversible, loud on drift, and it states its single-practice assumption out loud in the comment.
- `lib/practice-settings.ts` — the new service layer. Reads via `findFirst({ where: { key } })` (scoped);
  writes via `upsert({ where: { tenantId_key: { tenantId, key } } })`. **A write with no tenant in scope
  throws rather than defaulting** — a settings write with no owner is exactly the write that must fail
  rather than land in Valentina's practice.
- `audits/practice-setting-verify.ts` — 41 checks, browser-driven, self-cleaning.
- ~47 files touched in total, including the call sites that used to address a setting by bare `key`.

## What is verified — independently, by the Architect, on this branch

- `tsc --noEmit` clean · `npm run build` clean · migration 49 applies (`migrate status`: up to date;
  `\d "PracticeSetting"` shows PK on `id` and `UNIQUE ("tenantId", key)`).
- **The core defect is fixed, proven by an independent script, not by the build's own gate:** two
  non-default practices each write `sharedKey`, each reads back its own value (`value-A` / `value-B`), and
  tenant A can see exactly **1** row for that key. Isolation intact, same key held twice.
- **Practitioner A's full event journey works end to end** — signs in on her *own host*, saves a setting
  inside a real request, the row is owned by *her* tenant, and her page renders the value back. That is the
  journey the defect blocked.
- **`audits/engage/verify.ts` still 172/172.** This matters more than it looks: the engage kill-switch and
  global pause live in `PracticeSetting`, so re-keying that model could have silently disarmed the mailer's
  only off switch. It did not. The gate still defaults CLOSED.
- The gate's own V8 (DMMF fail-closed) and V9 (the migration reversal failing loudly rather than silently
  while two practices hold the same key) both pass.

## The one failing check — the first thing to look at

```
✗ both founding practitioners sign in on their OWN host and reach their own settings page
  — http://psxprobea.psx.test:3141/practitioner/settings · http://psxprobeb.psx.test:3141/login
```

Practitioner **A** lands on her settings page and every subsequent A assertion passes. Practitioner **B**
lands on `/login`, and the gate then times out at `audits/practice-setting-verify.ts:836` waiting for B's
checkbox.

**Two hypotheses, and I did not test either — deciding it is your call, not a guess I should have shipped:**

1. **Harness artifact (my suspicion, unproven):** the second `openPractice(HOST_B, EMAIL_B)` may be sharing
   a browser context or cookie jar with A's, or the sign-in helper may not handle a second host cleanly.
   Nothing about B's *data* path is in doubt — B's writes and isolation pass elsewhere in the same run.
2. **A genuine second-tenant auth issue.** If so it is event-critical and outranks everything, because
   the event mints many non-default tenants. Worth reading `lib/auth-guards.ts` — it has a branch that
   returns null when a user has no `tenantId` and the host is not the default slug.

Settle that one check and C25 is finishable. **Please do not "fix" it by relaxing the check** — it asserts
the exact journey the whole spec exists to protect.

## Why this is on a side branch

Jacob confirmed Railway runs `prisma migrate deploy` on release and said to push. I still did not push this
to `claude/valentinaapp-github-repo-erf4xp`, because that branch **auto-deploys to Valentina's live
practice**, and this changeset carries a schema migration whose single most important user journey has one
unproven assertion. Shipping a migration to a live practice on 40/41 is not a call I'll make on someone
else's production, twelve days out, while standing down. The work is preserved and mergeable the moment
that check is understood.

## Environment recipe (the traps, so you don't pay for them twice)

```
source /agent/workspace/scratch-env.sh      # in EVERY bash call — tsx does NOT auto-load .env
pg_ctl -D /agent/workspace/pgdata -l /agent/workspace/pg.log -o "-p 5432 -k /tmp" start
npx prisma migrate deploy                   # NEVER db push (skips 33_tenant_phase0's canonical tenant
                                            # insert; a dozen gates then fail for unrelated reasons)
                                            # NEVER migrate dev (ruling 26: migration 48's reversal table
                                            # lives outside schema.prisma and reads as drift)
npx tsx prisma/seed.ts
SEED_ENV=staging npx tsx prisma/fixtures/seed-staging.ts   # refuses without SEED_ENV — deliberate guard
npm run build                               # required: HTTP gates spawn `next start` themselves
```
Browser gates need `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` to exist —
that absolute path is hardcoded in six files (symlink it to a downloaded chromium; still unfixed).

## Regression set to re-run before merging

`lint:wall` · `guard-prisma` · `tsc` · `build` · `smoke` · `smoke:writes` · signup **37/37** ·
capture **59/59** · referral **68/68** · engage **172/172** · tenant-scope **48/48** ·
nested-stamp **43/43** · settings-i18n **10/10** · platform phase2 **16/16**, phase3 **11/11**,
phase5 **17/17** · c21 **58/58** · c20 **28/28** · v31 **32/32** · c12x 23 passed ·
onboarding 16/16, 17/17, 7/7, 10/10, 19/19 · password-reset PASS · amd06 PASS ·
then the stamp audit **exit 0** (run the sweep *first* — gate probes are what used to create null rows).

Cannot run without credentials, and must be reported `NOT VERIFIED — vendor credential required` rather
than passed silently: `pipeline/p12`, `fixtures/values-verify`, `c12x-ai-pass/*`, `remarkable-recording`.

## Three facts that postdate BUILD-STATE's rulings

1. **The Psychefolio USPTO mark is APPROVED** (Jacob, Sept 11). Ruling 22 and the brand intake note both
   record it as outstanding and constrain decisions on that basis — that constraint is lifted. This unblocks
   the escalated sender-identity question and removes the objection to putting the mark on a public page.
2. **`psychefolio.com` and `psychefolio.app` are purchased** — relevant to `PLATFORM_DOMAIN`, which must be
   set or every signup / portal / unsubscribe link degrades to a relative path.
3. **Veritas is Valentina's *branded tenancy* of Psychefolio**, not a separate layer. Several docs still
   read as though it were.

## Still open, unchanged

Task **#77** (rate limiting is in-memory per instance) · task **#80** (three `c12x-ai-pass` files need the
`withTenantScope` wrap, unrunnable without an Anthropic key) · the hardcoded chromium path in six files ·
the "Before the event (Jacob)" checklist in BUILD-STATE, whose deploy list now also needs **migration 49**.
