# C23-SIGNUP — the front door

**Spec:** C23-SIGNUP · **Depends-on:** PLATFORM Phases 0–5 (provisioning), BILLING B3 (tenant billing), C18 (public surface + wall)
**Priority:** highest — this is the surface a prospective tenant touches at the September 23 practitioner training event.
**Architect:** decided 2026-09-05.

## Why this exists

`provisionTenant()` already builds a complete practice: tenant row, modules with labels, subdomain slug,
practitioner user, comped founding billing, forced password change. It is verified (PLATFORM Phase 5, 17/17)
and reachable two ways — the CLI and `/admin/tenants/new`. Both require *us* to run them.

There is no way for a practitioner to sign themselves up. At the event that is the whole difference between
"we'll set you up later" and "you have a portal, right now, on your phone." This spec builds only the front
door; it does not redesign what is behind it.

## Standing laws this build must honor

- **The public wall (C18 §2).** `app/(public)/**` may not import `@/lib/prisma`, `@/auth`, `@/lib/auth-guards`,
  or `next-auth`. The one sanctioned pattern is a narrow server action whose FIRST line is
  `// wall-allow: <reason>`, writing only its own narrow models. Follow the C18 booking action precedent
  exactly. `npm run lint:wall` must stay clean.
- **Bilingual parity (law #7).** Every string ships in `messages/en.json` and `messages/es.json`. No
  English-only screen. Not translation-later.
- **No unratified price on any screen.** §7 pricing is PROPOSED. Signups are `FOUNDING_COMP` ("Founding
  partner"), which by design creates **no Stripe objects**. The word "free," a dollar figure, or a promised
  future rate must not appear. Say what they get, not what it will cost.
- **Attributable audit (law #6).** Every signup writes an `AuditEvent`. Metadata only — never a password.
- **No minors** (law #3): the pathway stays blocked; this form is for practitioners, and nothing here opens it.
- **Server-side enforcement** of every check. A hidden field is not a validation.

## Build order

### 1. `PractitionerProspect` model + migration `45_practitioner_prospect`

The event's people ledger. Deliberately separate from C18 `Lead`, which means "a prospective *client* of
Valentina's practice" and owns the invite-as-client conversion bridge. Overloading it would quietly corrupt
that bridge. Fields:

- `id`, `name`, `email` (lowercased, indexed), `phone?`, `practiceName?`, `note?`
- `status`: `LEAD | SIGNED_UP | DECLINED` (default `LEAD`)
- `source?` — free text, e.g. `event-sept23`, `web`, UTM
- `referredByCode?` — the raw code as captured; attribution logic is C23-REFERRAL's job, not this build's
- `referralCode` — **unique**, issued to every prospect at creation so the code exists before the program does
- `tenantId?` — set when they convert (the tenant they now own), plus `convertedAt?`
- `createdAt`, `updatedAt`

This model is **platform-level, not practice-scoped** — a prospect belongs to the platform, not to a practice.
Mirror how `Tenant`/`TenantModule` sit outside `SCOPED_MODEL_SET`, and confirm `guard-prisma` and the
tenant-stamp audit both stay clean given that choice (a wrongly-scoped model here would either leak or trip
the null-tenant audit — decide it deliberately and write down which you chose).

### 2. `provisionTenant()` accepts a chosen password

Extend `TenantConfigFile.practitioner` with optional `password`. When present: hash it (bcrypt, cost 12, as
`prisma/seed.ts` does), and do **not** set the forced-change flag — they chose it themselves. When absent:
current behavior is unchanged, temp password and forced change intact.

This is additive by requirement. The CLI, `/admin/tenants/new`, and the Phase 5 gate must behave identically
to today. If honoring that proves impossible, stop and raise an ARCHITECT-REQUEST rather than changing the
existing path.

### 3. `app/(public)/signup` — the form

One screen, phone-first, works one-handed on bad conference wifi. Collects: name, practice name, email,
password, and a slug (prefilled by slugifying the practice name, editable, with live availability feedback).
Captures `?ref=` from the URL into a hidden field and carries it through.

Copy sells a finished portal, not a discount: they are joining as a **founding partner**. Warm Stone design
system, matching the existing public surface — this screen is the product's first impression, so it should
look like the rest of the platform, not like a form bolted on.

### 4. The server action

First line `// wall-allow: signup provisions a tenant + practitioner; writes no client data`.

Order of operations, all server-side:
1. Validate: email shape, password strength floor, slug against the existing `SLUG_RE`
   (`/^[a-z0-9][a-z0-9-]{1,30}$/`), required fields.
2. Reject reserved slugs — at minimum `valentina`, `www`, `app`, `admin`, `api`, `staging`, `demo`, plus any
   existing tenant slug. Decide the full list and write it down; a practitioner claiming `admin` is a real
   problem, and `valentina` is Jacob's production host.
3. Upsert the `PractitionerProspect` by email, issuing a `referralCode`.
4. Call `provisionTenant()` with `seed: "EMPTY"`, `billingPlan: "FOUNDING_COMP"`, `layoutKey: "journey-v1"`,
   `skinKey: "warm-clay"`, the three standard modules, and the chosen password. Status lands `ACTIVE` — not
   `DEMO`, so no DEMO banner: this is their real practice.
5. On success: mark the prospect `SIGNED_UP` with `tenantId` + `convertedAt`, write the `AuditEvent`, and send
   them to a confirmation screen naming their portal address and their referral code. If Resend is configured,
   email a welcome; if not, the screen alone must be sufficient — **the flow may not depend on email.**
6. On refusal (slug taken, email already has an account), return the specific reason in-language. Never a
   partial tenant: if provisioning fails, the prospect row must not claim `SIGNED_UP`.

Rate-limit by IP and email. This endpoint creates tenants — treat it as abusable, because it is.

### 5. Reachability

Link signup from the public site so a prospect who types the domain finds it without being told a URL.
Do not disturb Valentina's client-facing chrome: her portal is byte-baselined and client-visible changes
require Jacob's explicit acceptance.

## Verify (this list is the gate — evidence required per item)

Write `audits/signup/verify.ts` in house style: spawn `next start` on an unused fixed port, run against the
scratch DB, self-cleaning. Prove:

1. GET `/(public)/signup` renders 200 in **both** locales; no price, no "free", no dollar figure in either.
2. Happy path provisions a complete tenant: `Tenant` ACTIVE with the chosen slug, three `TenantModule` rows,
   practitioner `User` who can **actually sign in with the chosen password** and is *not* forced to change it,
   `TenantBilling` `FOUNDING_COMP`/`ACTIVE`, and **zero Stripe objects**.
3. The new practitioner's portal serves on their slug wearing their own wordmark.
4. Duplicate slug refused with a specific message; duplicate email refused; **no orphan tenant or
   `SIGNED_UP` prospect left behind** by either refusal.
5. Every reserved slug is refused, `valentina` and `admin` included.
6. `?ref=ABC123` lands in `referredByCode`; every prospect gets a unique `referralCode`.
7. Password below the strength floor refused server-side even when the client check is bypassed.
8. Rate limit trips on repeated attempts.
9. `AuditEvent` written, containing no password material.
10. Regression, non-negotiable: `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean ·
    `npm run build` succeeds · `smoke` + `smoke:writes` PASS · `platform/phase5-verify` still **17/17** ·
    `c21-verify` still **58/58** · `c20-verify` **28/28** · `v31-verify` **32/32** · `b3-verify` **24/24**.
    A signup build that moves any of those numbers is not done.

## Out of scope (do not build)

Referral attribution and rewards (C23-REFERRAL) · event lead-capture form (C23-CAPTURE) · follow-up sequences
(C23-ENGAGE) · pricing pages or checkout · any change to Valentina's client-visible chrome.
