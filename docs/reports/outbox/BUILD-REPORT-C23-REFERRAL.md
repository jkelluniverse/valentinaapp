# BUILD-REPORT — C23-REFERRAL

- **Spec:** C23-REFERRAL — attribution and the reason to share · **Status: VERIFIED**
- Built 2026-09-05 against the scratch DB (migrations through `46_referral_index`), branch
  `claude/valentinaapp-github-repo-erf4xp`. Tree left dirty, uncommitted, per instruction.
- Own gate: `audits/referral/verify.ts` → **PASS 68/68**. Regression list (item 10) all at their
  pinned numbers.

## Built

**§1 — attribution, derived. No new model.**
- `prisma/schema.prisma` + `prisma/migrations/46_referral_index/migration.sql` — one index,
  `PractitionerProspect_referredByCode_idx`. No new table, no new column, no parallel ledger:
  counts are computed from `referredByCode` + `status` every time.
- `lib/referral-config.ts` (NEW, pure — no DB anywhere in its graph, so both the public surface and
  the write paths import it safely): `REFERRAL_CODE_RE`, `normalizeReferralCode`, `isSelfReferral`,
  `referralJoinUrl`, `firstNameOf`.
- `lib/referrals.ts` (NEW, data — the **scoped** client; `PractitionerProspect` is platform-level so
  it passes through, and no guard-prisma entry was needed for product code):
  `resolveReferralCode` (returns `{id, referralCode, status}` — **no name/email/practice, by
  construction**), `referralCodeResolves` (boolean, all the public surface may know),
  `referralCounts` (LEAD / SIGNED_UP / DECLINED split, case-insensitive on the stored code),
  `listReferred` (**first names only** — it selects `name/status/createdAt` and returns
  `firstName`), `ownProspect` (keyed on the signed-in session's tenant then email — there is no
  parameter to tamper with), `topReferrers`.
- Integrity rules, server-side, in both write paths:
  - **Self-referral refused** — `lib/prospect-capture.ts` and `lib/signup.ts` drop a submitted code
    equal to the prospect's own, and clear a self-referential value already on the row, so no
    self-referential row survives.
  - **Unknown/malformed code ignored, never an error** — stored verbatim, resolves to nobody.
  - **First touch immutable** — see discrepancy #1: this was *not* already true on `/signup`.

**§2 — public referral landing.** `app/(public)/join/page.tsx` and
`app/(public)/signup/page.tsx` now resolve the code server-side and render a single quiet line —
`capture.invitedBy` / `signup.invitedBy`, "Invited by a founding partner" / "Te invitó un socio
fundador" — **only when the code resolves**. Unresolvable → nothing at all. Both files carry the
established `// wall-allow:` pragma declaring what they reach (`lint:wall` clean).

**§3 — `app/practitioner/referrals/page.tsx` (NEW route).** Own code, one-tap share (plain
`mailto:`/`sms:` + the link printed in full — the `/join/thanks` pattern, no clipboard API, no
hydration), arrived/became-practices counts, founding-partner standing (from
`TenantBilling.plan === "FOUNDING_COMP"`, a scoped read), first names of referred prospects, honest
zero state. Bilingual via `lib/referral-copy.ts` + `messages/{en,es}/referral.json`. Linked from
`app/practitioner/settings/page.tsx` (one `LinkRow`) and from nowhere in the navigation — **nothing
on the practitioner dashboard or any of the 16 baselined screens was touched**.

**§4 — admin visibility.** `app/admin/prospects/page.tsx` gains a "Top referrers" section (code,
owner, owner email, prospects referred, conversions) behind the existing `PLATFORM_ADMIN_EMAILS`
gate, 404 for everyone else, no new role. `referredByCode` was already in the CSV.

**Gate + docs:** `audits/referral/verify.ts` (NEW), allowlisted in `scripts/guard-prisma.ts` and
`docs/PRISMA-ALLOWLIST.md` (harness only — it seeds two throwaway tenants, which cannot be done
from inside one tenant's scope).

**Not built, deliberately:** no reward, credit, discount, commission, bonus or tier mechanism; no
figure; no progress bar; no email sequence; no leaderboard; no parallel ledger.

## Verification — `audits/referral/verify.ts`, 68/68

Built app on `:3127`, Playwright 390×844, `PLATFORM_DOMAIN=platform.test`,
`PLATFORM_ADMIN_EMAILS=referral-admin@fixture.test`, scratch DB, self-cleaning (two throwaway
tenants `refprobea`/`refprobeb`, three tenants provisioned by real `/signup` submissions, all
probe prospects and their audit rows removed on exit — confirmed clean by the tenant-stamp audit
afterwards).

| # | Verify item | Result | Evidence |
|---|---|---|---|
| 1 | code resolves to owner; counts split LEAD vs SIGNED_UP over a ≥3 fan-out, one converted | **PASS** | `REFOWNRA → owner`; `total 3 / leads 2 / signedUp 1`; lowercase code also resolves; resolver's key set is exactly `id,referralCode,status`; unknown and malformed codes count to zero without error |
| 2 | invited-by line on `/join?ref=` and `/signup?ref=` in **both** locales, never the referrer's name/email/practice | **PASS** | 4/4 surfaces 200 with "Invited by a founding partner" / "Te invitó un socio fundador"; each asserted against 5 secrets (`Anneliese Kowalczyk-Dubois`, `referral-owner-a@fixture.test`, `Kowalczyk Dubois Wellness`, `Kowalczyk`, `Dubois`) — "nothing leaked" on all four |
| 3 | unknown + malformed code → no line, no error; a signup on an unresolvable code still completes | **PASS** | 8 checks (2 codes × 2 surfaces × line/alert): 200, no invited-by line, no `role="alert"` region; real `/signup?ref=ZZZZZZZZ` → `SIGNED_UP` + tenant created, code `stored ZZZZZZZZ, resolves to nobody` |
| 4 | self-referral refused at both `/join` and `/signup`; no self-referential row survives | **PASS** | `/join` reached `/join/thanks?code=SELFJOIN` and stored `referredByCode = null`; `/signup` completed `SIGNED_UP` with `referredByCode = null`; full-ledger sweep: `0 of 9 rows` self-referential |
| 5 | first touch immutable — a second `?ref=` never overwrites the first | **PASS** | `/join?ref=FIRSTTCH` stored, then `/signup?ref=SECONDTC` on the same email → `FIRSTTCH → FIRSTTCH`, signup still `SIGNED_UP` with a tenant. (This required a fix — discrepancy #1.) |
| 6 | `/practitioner/referrals`: own code + counts, first names only, honest zero, signed-out refused, cross-tenant isolation | **PASS** | 200 for A showing `REFOWNRA`, `3 Arrived on your code` / `1 Became practices`, `Fiona`/`Gustavo`/`Helena` present, `Featherstone-Marsh`/`Quintanilla`/`Vasquez-Ortiz` + all three emails absent ("nothing leaked"), `Founding partner` shown; Spanish page 200 with `Tu código de referencia` + `3 Llegaron con tu código`; zero state shows `Nobody yet` with no "progress"; signed-out → **307 → /login**; B sees `REFOWNRB` + `1 Arrived on your code` and neither A's code nor A's people; A sees neither B's code nor `Ignatius`/B's email; **A's cookie on B's host → 307 → /login, zero referral data** |
| 7 | no reward/price/earning language on new surfaces or catalogs | **PASS** | Scanner extended from `audits/capture/verify.ts` with `earn·reward·commission·bonus·discount·credit` **and** their Spanish forms (`gana(r/s/n)·recompensa·comisión·bono·descuento·crédito`), on top of the inherited `$n·USD·free·gratis·sin costo·per month·/mo·al mes`. Clean over 7 rendered surfaces (join en/es, signup en/es, referrals en/es/zero) and 6 catalogs (`referral`, `capture`, `signup` × en/es) |
| 8 | admin top-referrers renders for the allowlist, 404s otherwise, counts match the fan-out | **PASS** | 200 with `Top referrers` for the allowlisted email; regex-matched row `REFOWNRA Anneliese Kowalczyk-Dubois referral-owner-a@fixture.test 3 1`; B's row `… 1 0` listed separately; **404** for a signed-in non-allowlisted practitioner; `referredByCode` header + value present in the CSV |
| 9 | attribution `AuditEvent` is metadata-only | **PASS** | `prospect-capture` meta `referredByCode = FIRSTTCH`; `practitioner-signup` meta `referredByCode = FIRSTTCH`; serialized blob of both contains no email, no name, no password material. No new audit action and no new meta key were added (capture's exact meta key set is asserted by `capture/verify.ts`, which still passes 59/59) |
| 10 | regression | **PASS** | `lint:wall` ✓ clean · `guard-prisma` ✓ clean · `tsc --noEmit` ✓ clean · `npm run build` ✓ compiled · `smoke` **PASS** · `smoke:writes` **PASS** · `audits/signup/verify.ts` **37/37** · `audits/capture/verify.ts` **59/59** · `platform/phase5-verify` **17/17** · `c21-verify` **58/58** · `c20-verify` **28/28** · `v31-verify` **32/32** |

## Discrepancies & decisions needed

1. **`§1` says first touch "is already true" — on `/signup` it was not.** `lib/signup.ts`'s upsert
   `update` branch wrote `referredByCode` on *every* visit carrying a `?ref=`, so a prospect
   captured at `/join` on partner A's code and later signing up on partner B's link would have been
   silently reattributed to B. `lib/prospect-capture.ts` always got this right. I fixed the signup
   path (first touch preserved, self-referential values replaced) because Verify item 5 is
   unpassable otherwise. **Question:** confirm the fix is the intended reading, and note that any
   production rows created before it may carry a second-touch code (none exist yet — no production
   signups).
2. **A practitioner who was never a prospect has no code.** Valentina (tenant #1) and the demo
   tenants were provisioned directly, so `ownProspect` finds nothing. Options were (a) render an
   honest "no code on this account" state, (b) issue a code on first view. I built **(a)** — (b)
   would invent a prospect row and perform a write on a GET, and §3's own instruction is to be
   honest rather than fabricate. **Question:** ratify (a), or specify whether existing practices
   should be back-filled with codes as a separate deliberate act.
3. **Portal locale mechanism for the new route.** No practitioner page uses next-intl today, and
   `i18n/request.ts` resolves locale from the signed-in user. I added
   `resolvePortalLocale(?lang, User.locale)` — the saved preference wins, `?lang=` is an explicit
   override (which is also how the gate proves both locales without mutating a user row mid-run).
   **Question:** ratify, or should the portal surface be `User.locale` only?
4. **The settings link row is English inline.** `app/practitioner/settings/page.tsx` has no message
   catalog at all — every label on it is hardcoded English. I matched the file's convention rather
   than introducing a half-translated page. No new catalog string is involved, so bilingual parity
   is intact for everything this build added (`referral.json` en+es, `invitedBy` en+es). **Question:**
   accept, or is a practitioner-settings i18n pass wanted (a separate spec)?
5. **`capture.referredBy` / `signup.referredBy` ("Referred by {code}") are now unused.** §2 replaced
   that line with the resolve-gated `invitedBy` line. I left the old keys in place rather than churn
   shipped copy. **Question:** delete them, or keep?
6. **Top referrers is deliberately NOT filter-scoped**, unlike the counts above it (ruling 10) —
   "which founding partner is carrying the network" is a whole-ledger question, and the section says
   so on screen. Also: §4 lists the columns as "code, owner, prospects referred, conversions"; I
   added **owner email** as a fifth, because a name alone is not enough for Jacob to contact them.
   **Question:** ratify both, or drop the email column.

Nothing above blocked an item; all ten passed as built.

## Cost/ops notes

- **Migration run:** `46_referral_index` (one `CREATE INDEX`, no data change, no downtime). Applied
  with `prisma migrate deploy`. **This must be deployed before the new surfaces**, or referral
  counts do a sequential scan.
- **No new env vars. No new dependencies. No vendors touched** (no email, no Square/Stripe, no AI).
  `PLATFORM_DOMAIN` is read by the existing `referralJoinUrl` fallback exactly as `joinUrl` already
  does.
- **Allowlist:** one additive entry, `audits/referral/verify.ts` (harness only), justified in
  `scripts/guard-prisma.ts` and `docs/PRISMA-ALLOWLIST.md`. **No product code was allowlisted** —
  `lib/referrals.ts` uses the scoped client.
- **`audits/referral/VERIFY-LOG.md` was deliberately NOT written**, per this session's standing
  instruction not to hand-author `audits/*/VERIFY-LOG.md`. The full evidence is the table above and
  the harness's own stdout. Flagging it because every other audit directory carries one.
- **16-screen byte baseline:** not run as a differential gate this session. Ruling 11 makes it a
  *within-session* gate requiring a capture immediately after seeding and **before** any code
  change; no such pre-build capture was taken, so a `--diff` now would report the known
  cross-environment noise and prove nothing. Nothing was recaptured and no baseline image was
  committed. Scope evidence instead: this build touches no `/space` or `/login` surface, and its
  only edit inside `app/practitioner/**` outside its own new route is one `LinkRow` on
  `/practitioner/settings` — a screen that is **not** among the 16 (`login`,
  `practitioner-home{,-dusk,-mobile}`, `practitioner-clients`, `practitioner-billing`,
  `practitioner-schedule`, `portrait-{record,billing,map}`, `space-{home,journey,design,settings}`,
  `space-home-{dusk,mobile}`).
- **Pre-existing, unchanged:** `tenant-stamp-audit` still reports the same 2 null-tenant rows
  (`handwrittenNote: 1`, `appointment: 1`) from other harnesses' probes — BUILD-STATE task #75. Not
  worsened: this build adds no audit row of its own and `PractitionerProspect` is platform-level.
- **Rate limiting** is untouched and still the in-memory per-instance limiter of task #77.
- `STRUCTURE.md` remains stale on the new routes/libs (deferred by ruling 6; this build adds
  `/practitioner/referrals`, `lib/referral{s,-config,-copy}.ts`, `messages/*/referral.json`,
  `audits/referral/`).
