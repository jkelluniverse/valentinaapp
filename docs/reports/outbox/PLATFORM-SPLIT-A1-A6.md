# PLATFORM SPLIT — A1–A6 ANSWERED WITH EVIDENCE (pre-P1 hold honored)

Rollback point: **remote branch `known-good-pre-platform-split` = 7f55bc7**, verified
present on origin. DISCLOSED SUBSTITUTION: the remote refuses tag pushes (403,
deterministic, retried) — this session's git credential is branch-scoped — so the
pointer is a branch, not a tag; a local tag of the same name also exists. Same
one-action rollback either way: deploy 7f55bc7.

## A1 — the fallback's reach: CONFIRMED BIGGER THAN NAMED. 48 references, 16 app
## files — plus four sites outside the named set.

The named set (slugFromHost, resolveTenant, middleware, getBaseUrl, sendEmail
identity, AUTH_URL) is real, but the full census adds sites that change P3/P5's
shape:

**Resolver core** — lib/tenancy/index.ts: DEFAULT_TENANT_SLUG defined (15);
slugFromHost falls back to it on no-host, no-PLATFORM_DOMAIN, non-suffix host, and
dotted/empty sub (37/40/43); `FRESH_DB_SHELL` (100–110) is a SYNTHETIC Valentina
TenantConfig — her id, display name, "veritas" portalTitle — served when a healthy
DB has no default row; the unknown-slug path resolves THROUGH the default row
(140). lib/tenancy/scope.ts: DEFAULT_TENANT_ID + DEFAULT_TENANT_SLUG defined
(6/9); **scopeFilter treats the default tenant as equivalent to tenantId=NULL
legacy rows (45) — the fallback exists in the DATA LAYER, not only in host
resolution.** lib/prisma.ts: slug→id shortcut (97), "unknown slug behaves like the
default host" (107), and two write-guard special-cases (221, 276).

**Auth** — lib/auth-guards.ts:52: a User row with NULL tenantId may sign in ONLY on
the default host — sign-in itself has a default-tenant branch. AUTH_URL: zero code
references; consumed by Auth.js from env only (see A6).

**Identity & mail** — lib/notify.ts:130: identity resolution maps tenantId NULL *or*
DEFAULT to the "default" identity (NOTIFY_FROM_EMAIL = Valentina's). lib/engage.ts
413/471: engage stamps its audit rows with DEFAULT_TENANT_ID — platform marketing
recorded as Valentina's tenant data.

**Money & legal** — lib/payments/account.ts:41: a legacy payment token is honored
only for the default tenant. lib/agreements/index.ts:279: default/legacy branch.

**Chrome** — app/api/tenant-kind (isDefault), app/(public)/book ×2,
app/(public)/layout ×2: "is this the default tenant" branches. middleware.ts:44:
the "valentina" string literal (documented duplication).

**OUTSIDE THE NAMED SET (the four that would have been missed):**
1. lib/base-url.ts `getBaseUrlSafe()` — catch-fallback hardcodes
   `https://valentinavelez.com`; used by payment/agreement emails. 26 files import
   getBaseUrl/getBaseUrlSafe.
2. content/site-content.ts:15 — site url = NEXT_PUBLIC_SITE_URL ??
   `https://valentinavelez.com` (her marketing metadata).
3. lib/signup-config.ts RESERVED_SLUGS — "valentina", "psychefolio", "veritas",
   "www" reserved (GOOD: keeps the target architecture's names unclaimable; stays).
4. prisma/fixtures/kfloor-verify.ts + c12x-verify.ts — fixtures write
   DEFAULT_TENANT_ID rows directly.

PUBLIC_APP_URL (getBaseUrlSafe's env override) is NOT set in production — the
hardcoded fallback is one caught exception away from live payment mail.

## A2 — CONFIRMED: no mapping exists. Recommend a TenantDomain TABLE (many per
## tenant), not a column.

The Tenant model (schema.prisma:999–1010) has slug/displayName/status/layout/skin/
branding/flags — nothing else; "domain" appears nowhere in the schema. Recommended
shape: `TenantDomain { id, host String @unique, tenantId FK onDelete Cascade,
createdAt }`. Why the table over Tenant.customDomain: (a) her practice will
plausibly need ≥2 hosts (valentinavelez.com + www.valentinavelez.com; later apex
aliases for other practices), and a column forces a second migration the day that
happens; (b) `host @unique` machine-enforces I4 — the schema itself forbids one
host reaching two practices; (c) the resolver does one indexed exact-host lookup;
(d) P1 leaves the Tenant row byte-untouched. Migration inserts one row:
valentinavelez.com → the valentina tenant.

## A3 — CONFIRMED, and it is SIX migrations, not one, plus 15 test files.

Migration 33_tenant_phase0 creates 'valentina'/'tnt_valentina_000000001' + her
module rows; 34, 36, 48, 49 stamp NULL-tenant rows to her id; 35 renames her
modules. Migrations are immutable history and should NOT be rewritten — the
consequence to design around: **every fresh database (including every gate's
scratch DB) is BORN with a valentina tenant** because the replay creates it. P5
therefore means "no code path REQUIRES the default tenant," not "no such row can
exist." Test apparatus: 15 audit/script files reference DEFAULT_TENANT
(tenant-scope-verify.ts deepest at 44 refs), 5 gate files carry 'valentina'
literals, 4 seed/fixture files depend on her row (prisma/seed.ts, fixtures/map.ts,
seed-staging.ts, c12x/kfloor fixtures). Real but mechanical: each gets an explicit
fixture tenant in P5.

## A4 — PARTIALLY CONFIRMED; the send-test is NOT EXECUTABLE TODAY, and that is a
## finding.

All five PLATFORM_* variables exist by name in production (variable list read via
connector; values correctly redacted). But the ONLY code path that sends with
platformIdentity() is lib/engage.ts:369 — and the engage gate is CLOSED. **No
production surface can send a platform-identity email today**, so "configured"
cannot be distinguished from "working" from here, and Resend domain verification
for the platform's from-domain is unknowable without a send. Two ways to close it,
recommend BOTH: (1) Jacob checks the Resend platform account's dashboard — domains
list + verification status, zero code; (2) a JOBS_SECRET-guarded one-shot route
that sends exactly one platform-identity email to jkelluniverse+platform@gmail.com
(the authorized +tag), which the builder reads back via Gmail — shipped as its own
tiny pre-P1 commit, revertible, and it makes A4 an observed fact before the design
bets on it. Awaiting the word before shipping anything.

## A5 — CONFIRMED: her domain reaches her ONLY via the fallback.

slugFromHost: valentinavelez.com does not end with `.psychefolio.com` → explicit
branch returns DEFAULT_TENANT_SLUG. No data mapping exists (A2). Live now:
`GET https://valentinavelez.com/api/tenant-kind` → `{"kind":"tenant","isDefault":true}`.
Also live: `www.psychefolio.com/api/tenant-kind` → `{"kind":"unknown-slug",
"isDefault":true}` — i.e. the platform's own www currently renders VALENTINA's
content via the unknown-slug→default path; P2/P3 change exactly this.

## A6 — CONFIRMED from the installed @auth/core source, with one caveat.

node_modules/@auth/core/lib/utils/env.js `createActionURL`: `envObject.AUTH_URL ??
envObject.NEXTAUTH_URL` takes ABSOLUTE precedence; only when absent does it build
from `x-forwarded-host` + `x-forwarded-proto` per request. So unpinning AUTH_URL
makes auth per-host, and the edge delivers the right x-forwarded-host on inbound
requests (proven live by C32's V12 Location). W7 already showed cookies are
host-only and sessions work on tenant hosts even while pinned — only redirect
resolution is wrong today. CAVEAT: the same file derives `trustHost` from
AUTH_URL's PRESENCE when not explicitly set — ours IS explicit
(auth.config.ts:6 `trustHost: true`) and MUST STAY when the var is removed.

## Phasing implications (differences from the dispatch's sketch, none structural)

- P3 is wider than "remove the resolver fallback": it must also retire
  FRESH_DB_SHELL, the unknown-slug→default-content path (becomes platform page or
  fail-closed), getBaseUrlSafe's hardcoded valentinavelez.com, and
  site-content.ts's url fallback. The middleware "valentina" literal dies with the
  fallback (the decision becomes data-driven end to end).
- P5 must decide the DATA-LAYER equivalences separately: scopeFilter's
  default≡NULL (scope.ts:45), auth-guards' NULL-tenant sign-in branch, payments'
  legacy token, agreements' legacy branch. Each needs a null-tenant census across
  ALL scoped models first (read-only SQL for Jacob; Block 1's seven tables showed
  0, but scopeFilter covers the full scoped set).
- P4 design question to settle at ratification: engage stamps its audit rows
  DEFAULT_TENANT_ID — under the target architecture platform marketing is not
  Valentina's tenant data; those writes need a home (platform scope or NULL with a
  new meaning).
- P2 operational risk, flagged early (ruling 85 vs ruling 71): the apex must route
  WITHOUT a CNAME (Zoho MX shadowing — ruling 71 stands). Whether the DNS provider
  supports ALIAS/ANAME-to-Railway for the apex, or the apex needs A records /
  Cloudflare proxying, must be confirmed against the actual DNS provider before P2
  is scheduled. www.psychefolio.com already routes.

## State

HOLDING before P1 per the dispatch. psf-rehearsal STANDS (reference tenant).
Block 1.5 / Block 2 / Block 3 unchanged, teardown moved after P5. Nothing built.
