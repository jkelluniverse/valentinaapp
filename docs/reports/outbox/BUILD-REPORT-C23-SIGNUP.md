# BUILD-REPORT — C23-SIGNUP

- **Spec:** C23-SIGNUP — the front door · **Status: VERIFIED** (37/37 on the new gate; every regression number held)
- Built 2026-09-05 against the scratch DB (`valentina_scratch`, migrated + staging-seeded). Working tree left dirty for Architect review; nothing committed, nothing pushed.

## Built

**§1 — model + migration**
- `prisma/migrations/45_practitioner_prospect/migration.sql` — `PractitionerProspect` + `ProspectStatus` enum (`LEAD | SIGNED_UP | DECLINED`).
- `prisma/schema.prisma` — model with `id, name, email(@unique, lowercased), phone?, practiceName?, note?, status, source?, referredByCode?, referralCode(@unique), tenantId?, convertedAt?, createdAt, updatedAt` + `@@index([status, createdAt])`.
- **Decision recorded (spec asked us to decide and write it down):** the model is **platform-level, NOT practice-scoped**. It is deliberately absent from `SCOPED_MODELS` (`lib/tenancy/scope.ts` untouched), exactly like `Tenant`/`TenantModule`/`WebhookEvent`. Its `tenantId` is *the tenant the prospect came to own*, not a scope column. Consequences, both confirmed by running the gates: `guard-prisma` stays clean, and the null-tenant stamp audit never sees the table (it iterates `SCOPED_MODELS`), so a prospect row can never trip it.

**§2 — `provisionTenant()` accepts a chosen password (additive)**
- `lib/provisioning.ts` — `TenantConfigFile.practitioner.password?`. Present → `bcrypt` cost 12 (as `prisma/seed.ts`), `mustChangePassword: false`, and `tempPassword` returns `""` (nothing is echoed back). Absent → byte-identical old behavior (random temp password, cost 10, forced change). `ProvisionOutcome.ok` gained `chosePassword: boolean` so `""` can never be mistaken for a temp password.

**§3/§4/§5 — the front door**
- `app/(public)/signup/page.tsx` — one screen, phone-first, Warm Stone, bilingual, `?ref=` captured, live slug feedback, refusal banner. `noindex`.
- `app/(public)/signup/SignupForm.tsx` — client form: slug prefilled by slugifying the practice name (editable), debounced availability, honeypot + render-timestamp trap.
- `app/(public)/signup/actions.ts` — the server action; first line `// wall-allow: signup provisions a tenant + practitioner; writes no client data`. Rate-limits by **IP (5/h) and email (3/h)**, counting every attempt.
- `app/(public)/signup/welcome/page.tsx` — confirmation screen naming the portal address, the sign-in email, and the referral code. Sufficient on its own; no email dependency.
- `app/api/signup/slug/route.ts` — availability probe; returns one word (`ok|taken|reserved|invalid`) and nothing else.
- `lib/signup.ts` — the service: validate → reserved/taken slug → global email check → prospect upsert (+ referral code) → `provisionTenant({seed:"EMPTY", billingPlan:"FOUNDING_COMP", layoutKey:"journey-v1", skinKey:"warm-clay", 3 modules, chosen password})` → mark `SIGNED_UP` + `tenantId` + `convertedAt` → `AuditEvent` → optional welcome email. Full **rollback** on any provisioning failure.
- `lib/signup-config.ts` — pure config (no DB in the module graph, so a public page can never drag the data layer behind it): `SLUG_RE`, `PASSWORD_MIN`, `STANDARD_MODULES`, `RESERVED_SLUGS` (95 entries), `slugify`, `portalHostFor`.
- `lib/signup-copy.ts` — bilingual catalog loader + `?lang=`/`Accept-Language` resolution.
- `messages/en/signup.json` + `messages/es/signup.json` — every new string, both locales (screen, refusals, confirmation, welcome email).
- `components/public/PublicChrome.tsx` — footer link "For practitioners" → `/signup`. Footer only; her header/hero funnel untouched; the 16-screen byte baseline covers the practitioner/client portals, not the marketing site, so it is unaffected.
- `scripts/guard-prisma.ts` + `docs/PRISMA-ALLOWLIST.md` — two allowlist entries added with justifications (`lib/signup.ts`, `audits/signup/verify.ts`). **See ARCHITECT-REQUEST 2** — additions only, no rule weakened.
- `audits/signup/verify.ts` — the new gate, house style, browser-driven, self-cleaning.

**Reserved slug list (decided here, written down in `lib/signup-config.ts`):** 95 slugs in three families — ours (`valentina`, `psychefolio`, `veritas`, `platform`, `www`, `app`, `staging`, `demo`, …), infrastructure (`api`, `cdn`, `mail`, `smtp`, `ns1`, `webhook`, `status`, …), product paths/roles (`admin`, `root`, `login`, `signup`, `billing`, `checkout`, `practitioner`, `space`, `privacy`, …) — plus, dynamically, **every existing tenant slug** and the `demo-` prefix.

## Verification

Gate: `npm run build && DATABASE_URL=<scratch> npx tsx audits/signup/verify.ts` → **`SIGNUP VERIFY PASS — 37/37`**.

| # | Spec verify item | Result | Evidence |
|---|---|---|---|
| 1 | `/signup` 200 in both locales; no price/"free"/figure | **PASS** | `✓ /signup renders 200 in en — status 200` · `✓ /signup renders 200 in es — status 200` · `✓ en/es screen carries no price, no "free", no figure` · `✓ messages/{en,es}/signup.json carries no price language`. Scanner strips `<script>`/`<style>` first (React's flight payload legitimately contains `"$10"` chunk refs — that was the only hit before the fix, confirmed by inspecting the raw HTML). |
| 2 | Happy path provisions a complete tenant | **PASS** | `✓ Tenant created ACTIVE on the chosen slug — status ACTIVE` · `✓ three TenantModule rows — 3 rows` · `✓ TenantBilling FOUNDING_COMP / ACTIVE` · `✓ zero Stripe objects — cus=null sub=null` · `✓ practitioner NOT forced to change password — flag false` · `✓ practitioner signs in with the CHOSEN password` (real `/api/auth/callback/credentials` POST on `signupprobe.platform.test`, session cookie issued) · `✓ a wrong password is still refused` |
| 3 | Portal serves on their slug wearing their own wordmark | **PASS** | `✓ portal serves on their slug wearing their own wordmark — status 200` (GET `/practitioner` with `x-forwarded-host: signupprobe.platform.test` contains "Signup Probe Practice") · `✓ their practice is not a DEMO` |
| 4 | Duplicate slug + duplicate email refused; no orphan tenant or `SIGNED_UP` prospect | **PASS** | `✓ duplicate slug refused with a specific message — …&error=slug-taken` (page renders "already taken") · `✓ duplicate email refused with a specific message — …&error=email-taken` ("already has an account") · `✓ no orphan tenant from either refusal — 2 vs 2` · `✓ refused slug left no tenant` · `✓ refused prospect never claims SIGNED_UP` |
| 5 | Every reserved slug refused, `valentina` + `admin` included | **PASS** | `✓ valentina + admin (and the rest of the sample) are on the reserved list — all present` · `✓ every reserved slug refused (incl. valentina + admin) — 7/7` (7 full browser submissions, a distinct IP **and** email each so the rate limiter cannot masquerade as a reservation) · `✓ the whole reserved list is refused server-side (unit) — 95 slugs` · `✓ no tenant was created by any reserved attempt` |
| 6 | `?ref=ABC123` → `referredByCode`; unique `referralCode` per prospect | **PASS** | `✓ ?ref=ABC123 landed in referredByCode — ABC123` · `✓ referralCode issued — J7VH63DR` · `✓ the confirmation screen shows the referral code` · `✓ every prospect's referralCode is unique and non-empty — 2 prospects` |
| 7 | Sub-floor password refused server-side with the client check bypassed | **PASS** | `✓ weak password refused server-side with the client check bypassed — …&error=password`. The harness strips `required`/`minlength`/`pattern`/`type=email` and sets `novalidate` via `page.evaluate` before submitting `"short1"`. · `✓ weak attempt created no tenant` |
| 8 | Rate limit trips on repeated attempts | **PASS** | `✓ rate limit trips on repeated attempts — refused at attempt 4` (per-email cap of 3 bites first; the per-IP cap of 5 is the same mechanism) |
| 9 | `AuditEvent` written, no password material | **PASS** | `✓ AuditEvent written, attributed to the new practitioner` (`action: "practitioner-signup"`, `actorId` = the new practitioner's user id, `tenantId` = the new tenant) · `✓ AuditEvent contains no password material` (row JSON asserted free of the plaintext, of any `$2a/$2b/$2y` hash, and of any `password":"` key) |
| 10 | Regression, non-negotiable | **PASS** | `lint:wall` → `✓ public wall intact` · `guard-prisma` → `tenant-scope guard: clean` · `tsc --noEmit` → clean, no output · `npm run build` → `✓ Compiled successfully` (`/signup`, `/signup/welcome`, `/api/signup/slug` all in the route table) · `npm run smoke` → `SMOKE PASS — every page rendered` · `npm run smoke:writes` → `WRITE SMOKE PASS` · `platform/phase5-verify` → `PHASE 5 VERIFY PASS — 17/17` · `c21-verify` → `58/58` · `c20-verify` → `28/28` · `v31-verify` → `32/32` · `b3-verify` → `24/24` |

**Pre-existing, not mine:** `audits/tenant-stamp-audit.ts` reports 2 null-tenant rows (`handwrittenNote: 1`, `appointment: 1`) — gate-probe drift from the C20/C21 harnesses, BUILD-STATE task #75. Not touched, not worsened; `PractitionerProspect` cannot contribute to it by construction (see §1 decision).

**Not attempted (no credentials in this environment, per standing note):** `pipeline-p12`, `fixtures/values-verify`, `remarkable-recording`. Not in the spec's regression list.

## Discrepancies & decisions needed

1. **`messages/en.json` / `messages/es.json` do not exist.** The repo uses namespaced catalogs (`messages/{locale}/{ns}.json`, loaded in `i18n/request.ts`). I read the spec's file names as naming the *catalogs*, not the paths, and shipped `messages/en/signup.json` + `messages/es/signup.json`. No English-only string exists. Flagging only so the convention is confirmed, not blocked.
2. **`branding.portalTitle` is set to the practice name.** §4.4 lists the provisioning args and does not mention branding, but verify #3 requires "their own wordmark" — and the portal shells fall back to `"veritas"` when `branding.portalTitle` is unset, which would have put *our* internal product name on their portal. I set `portalTitle = practiceName` (and `displayName = practiceName`). Confirm.
3. **"The three standard modules" = `body-graph`, `archetypal-keys`, `values-spiral`**, with default labels. Reasoning: that is the platform's structured-content launch trio and precisely the set `provisioning/demo-journey.json` (the journey-v1 + warm-clay config) carries. Confirm if a different trio was meant.
4. **Password strength floor = 8 characters**, matching the only existing floor in the codebase (`app/must-change/actions.ts`). §4.1 says "password strength floor" without a number, and I refused to invent a stricter rule. See ARCHITECT-REQUEST 3.
5. **Signup screens are `noindex`.** Not specified either way. §5 asks that the front door be *reachable*, which the footer link does; letting a pre-launch practitioner-acquisition screen into search results felt like a decision above my level, so I kept it out of the index. Reverting is one line.
6. **`ProvisionOutcome` shape changed (additively).** `ok` now carries `chosePassword`, and `tempPassword` is `""` on the chosen-password path. No existing caller reads the new field; the CLI and `/admin/tenants/new` are unaffected (phase5-verify 17/17 proves it). Flagging because it is a public type.
7. **`STRUCTURE.md` not updated** with the new routes/libs. Outside the spec's build order, so I left it; it is now slightly stale.

## ARCHITECT-REQUEST 1 — the public surface has no locale mechanism at all

**Context.** Bilingual parity is law, but every existing public page is English-only static copy (`content/site-content.ts`), and the portal's next-intl config resolves locale from the *signed-in user's* row — it imports `@/auth` + `@/lib/prisma`, which the wall forbids outright (no pragma available for `@/auth`). A signed-out prospect has no row to read.

**The ambiguity.** The spec says the screen must render "in both locales" but does not say how a visitor selects one, and the repo comment in `i18n/request.ts` explicitly defers public `/es` routing to "a separate, later phase (SEO wants the locale in the URL there)."

**What I did (minimum viable, reversible):** `/signup?lang=es`, falling back to `Accept-Language`, reading the same message files directly via `lib/signup-copy.ts` — no `@/auth`, no wall breach, both catalogs shipping together. A small EN/ES toggle sits in the screen's top-right. The footer link that reaches it is English-only, because the footer is her monolingual marketing chrome.

**Options.**
- **(a) Keep `?lang=` for now** (my recommendation) — zero new routing, zero SEO decisions, no change to her marketing site, and it is what the gate now proves. Revisit when a `/es` public tree is specced.
- **(b) Add `/es/signup` route segment** — better SEO, but it forces a decision about the whole public tree and touches her site's routing shape.
- **(c) Detect only from `Accept-Language`, no override** — fewer moving parts, but a prospect on a borrowed phone cannot switch, which at a bilingual event is the actual failure mode.

**Blocked until answered:** nothing — the build ships on (a). The answer decides whether the footer link and the rest of the public surface get the same treatment.

## ARCHITECT-REQUEST 2 — `lib/signup.ts` uses the raw prisma client (allowlist extension)

**Context.** `@/lib/prisma` scopes every read/write on a scoped model to the *request's* tenant. The signup request arrives on the marketing host, which resolves to the **default tenant** — while the row it is creating belongs to a brand-new one.

**The conflict.** Three things then cannot be done through the scoped client: (i) the global `User.email` uniqueness check — `email` is `@unique` platform-wide, so a request-scoped read cannot see another practice's owner and a duplicate would surface as a mid-provision `P2002`, leaving a half-built practice (exactly what verify #4 forbids); (ii) the failure rollback — `tenantBilling.deleteMany`/`user.deleteMany` scoped to the default tenant delete nothing belonging to the new one; (iii) the `AuditEvent` for the new tenant. This is structurally identical to `lib/payments/webhook.ts` and `lib/billing/lifecycle.ts`, both already allowlisted as "cross-tenant by nature."

**What I did.** Added two entries to `scripts/guard-prisma.ts` and `docs/PRISMA-ALLOWLIST.md` (`lib/signup.ts`, `audits/signup/verify.ts`) with written justifications. **No rule was weakened, nothing was skipped, no existing entry changed** — this is the documented extension path ("Extending the list is a reviewed decision"). The guard still passes on its own terms.

**Options.**
- **(a) Ratify the allowlist entry** (my recommendation) — signup is genuinely tenant-creation ingress, and the alternative is a service that can only half-check itself.
- **(b) Reject it and make `provisionTenant()`'s own email check global instead** — arguably more correct, but it changes the *existing* in-request behavior of `/admin/tenants/new`, which §2 forbids me from doing.
- **(c) Reject it and accept the weaker path** — scoped pre-check plus a prospect-ledger check plus best-effort cleanup. I do not recommend this: cross-tenant duplicate emails would still reach `user.create` and could leave a dangling `TenantBilling` row.

**Related latent issue, not caused by this build and not fixed by it:** `/admin/tenants/new` calls `provisionTenant()` inside a request, so *its* duplicate-email check is likewise default-tenant-only today. It is reachable only by the `PLATFORM_ADMIN_EMAILS` allowlist, so the blast radius is Jacob typing an email that already exists in another practice. Want that as its own ticket?

**Blocked until answered:** nothing — the build ships on (a), and reverting to (b) or (c) is a contained change to `lib/signup.ts`.

## ARCHITECT-REQUEST 3 — the password strength floor is unspecified

**Context.** §4.1 requires a "password strength floor"; verify #7 requires it to be enforced server-side. No number is given, and the only floor that exists in the codebase is 8 characters (`app/must-change/actions.ts`).

**Options.**
- **(a) 8 characters, matching the house floor** (my recommendation, and what shipped) — consistent with every other password path in the product; one constant, `PASSWORD_MIN` in `lib/signup-config.ts`.
- **(b) A higher floor for practice owners (e.g. 12)** — defensible: this account owns a whole practice's data. But it then differs from the floor the same person meets at `/must-change`, which is the kind of inconsistency that gets noticed at an event.
- **(c) Composition rules (mixed case/digit/symbol) or a breach-list check** — I did not build this; it is a real product decision with real friction on a phone, and inventing it would be spec invention.

**Blocked until answered:** nothing — a one-constant change if you want a different number.

## Cost/ops notes

- **Migration run:** `45_practitioner_prospect` (scratch DB, `prisma migrate deploy`). One new table, one new enum. No data backfill, no destructive change. **Needs deploying to staging/production the usual manual way.**
- **New env vars:** none. `PLATFORM_DOMAIN` (already in use) is what turns a slug into the portal address the confirmation screen names; unset, the screen names the bare slug rather than inventing a host.
- **Vendors touched:** none. `FOUNDING_COMP` creates **zero Stripe objects** by design (proved). Resend is used only if already configured, and the flow is proved to complete with it absent (this environment has no key — the 37/37 run had no email available at all).
- **New attack surface:** `/signup` creates tenants and `/api/signup/slug` is an unauthenticated availability probe (slug enumeration is inherent to any availability check; it returns one word and no counts, names, or client data). Signup is guarded by honeypot + time-trap + IP cap (5/h) + email cap (3/h). The caps are **in-memory per instance**, like the C18 booking limiter — on a multi-instance deploy the effective cap multiplies by the instance count. Flagging as a known limit rather than pretending it is a fortress.
- **New gate to add to the standing rotation:** `audits/signup/verify.ts` (37 checks, ~3 min, self-cleaning, needs `npm run build` first). No npm script added — none of the sibling verifies have one.
