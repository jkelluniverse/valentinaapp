# P3 PRE-CENSUS — what depends on the fallback TODAY (read-only; nothing built)

**Headline, and it changes P3's shape: there are TWO tenant resolvers, and P1 only
fixed one of them.** `lib/prisma.ts`'s `scopeTenantId()` — the DATA layer — calls
`slugFromHost()` directly and **never consults `TenantDomain`** (verified by grep:
no reference to the mapping anywhere in `lib/prisma.ts`, `scope.ts` or `db.ts`).
So valentinavelez.com reaches HER DATA today **only** through the host-pattern
fallback. Removing that fallback without first teaching the data layer the mapping
does not degrade her site — it severs her practice from its own database.

## Q1 — the census re-run against current code: NOTHING was retired

49 references across 17 files, against A1's 48 across 16. The delta is **one comment**
in the new `lib/platform-host.ts`. Every call site A1 listed is still present, at the
same counts (line numbers shifted where P2 edited files).

That is not a failure of P1/P2 — it is what "net behavior change zero" meant. What P1
actually changed is narrower than it looked: it added a mapping consulted by
`resolveTenant()` (chrome, metadata, `/api/tenant-kind`), so **for her host the
chrome path no longer reaches the fallback**. The data path still does, on every
request.

**Hosts that still land on the default tenant through the fallback:** `localhost`
(dev + every gate), the staging `*.up.railway.app` domain, `psychefolio.com` and
`www` for every path except `/` (P2 only intercepts the root — `psychefolio.com/book`
resolves HER data), any unknown subdomain (unknown-slug → default content), any host
at all when `PLATFORM_DOMAIN` is unset, and **every out-of-request context** (jobs,
ticks, CLI) via `getTenantResolution()`'s `headers()` catch → `host = null` →
`slugFromHost(null)` → her slug.

## Q2 — classification of each remaining site under fallback removal

### (c) FAIL OPEN — none found
No site was found where removing the fallback grants access that should be denied.
The data layer's failure mode is `TenantUnresolvedError` (throw) or `null`
(unscoped passthrough) — see the null-tenant caveat under `ambientTenantId` below,
which is the one place worth watching.

### (b) FAIL CLOSED **WRONGLY** — breaks something that should work. Five, and the
### first is a P3 blocker.

1. **`lib/prisma.ts:97` — `scopeTenantId()` → the whole data layer.** `slugFromHost()`
   returns the default slug for her domain today; that is the only reason
   `valentinavelez.com` reads and writes her rows. Remove the fallback and her
   requests raise `TenantUnresolvedError` — **her live practice loses its data**.
   MUST be fixed before, not during, fallback removal: the data layer needs the same
   `TenantDomain` lookup the chrome path got in P1.
2. **`lib/prisma.ts:107` — unknown slug → `DEFAULT_TENANT_ID`.** A successful lookup
   that finds no tenant currently reads HER data. Under P3 this must refuse, not
   default. (This one is (b) only in the sense that something depends on it today;
   correcting it is the point of P3.)
3. **`lib/auth-guards.ts:52` — `!userTenantId && tenant.slug !== DEFAULT_TENANT_SLUG`
   → sign-in refused.** A NULL-tenantId user can sign in only where the host resolves
   to the default slug. **Risk is NOT realized in production:** migration 34 ran
   `UPDATE "User" SET "tenantId" = 'tnt_valentina_000000001'`, and Block 1 measured
   null-tenant rows = 0. So this branch is dead against today's data — but it is dead
   by DATA, not by CODE, which is exactly why Q5's census must cover every model
   before the branch is removed.
4. **`lib/payments/account.ts:41` — `tenantId === DEFAULT_TENANT_ID && legacyToken`.**
   This is how Valentina takes money today. It keys off the tenant ID, not the host,
   so it survives P3 **provided** blocker 1 is fixed first (she must still resolve to
   `DEFAULT_TENANT_ID`). If blocker 1 is missed, payments fail with everything else.
   P6 owns retiring it.
5. **`lib/agreements/index.ts:279` and `lib/notify.ts:130` — `tid === null || tid ===
   DEFAULT_TENANT_ID` → fall back to env-configured practice email / "default"
   identity.** Same shape: keyed on tenant id, survives P3 if blocker 1 is fixed. The
   `tid === null` half fires in out-of-request contexts and is the reason a job can
   still send as her — P4's business.

### (a) FAIL CLOSED **CORRECTLY** — the intended effect of P3
- `lib/tenancy/index.ts:38,41,44` — `slugFromHost`'s three fallback returns. The
  fallback itself.
- `lib/tenancy/index.ts:196,202` — unknown-slug resolving THROUGH the default row to
  serve default content (and `FRESH_DB_SHELL`, Q3).
- `app/api/tenant-kind`, `app/(public)/book` ×4, `app/(public)/layout` ×4 — these are
  `isDefault` CHROME comparisons. They do not need the fallback; once no host
  resolves to the default tenant by accident, they simply stop matching. Cheap.
- `middleware.ts:45` — the duplicated `"valentina"` literal dies with the fallback.

### Out of P3's scope by ruling 86 — the DATA-OWNERSHIP equivalence (P5)
- **`lib/tenancy/scope.ts:45` — `scopeFilter`: `tenantId === DEFAULT_TENANT_ID ?
  {OR:[{tenantId},{tenantId: null}]}`.** Null-tenant rows are read as HERS. This is
  not host resolution and P3 must not touch it; it is P5's, gated on Q5.
- `lib/prisma.ts:221,276` — unique-write pre-checks skipped for the default tenant.
- `lib/engage.ts:413,471` — engage stamps audit rows with `DEFAULT_TENANT_ID` (P4).
- `prisma/fixtures/*` — test apparatus (P5).

## Q3 — FRESH_DB_SHELL

**Exactly one invocation:** `lib/tenancy/index.ts:202`, the last line of
`resolveTenant` — `return { kind: "unknown-slug", tenant: d.tenant ?? FRESH_DB_SHELL }`.
It is reached only when the slug is unknown AND the default-tenant row itself does not
exist (a fresh, unseeded database). It synthesizes a Valentina who is not in the
database: her id, her display name, `portalTitle: "veritas"`.

**After P3 it is unreachable by construction** — nothing resolves "through" the
default row any more, so the `d.tenant ?? …` expression disappears with the branch
that contains it. **Designed removal:** delete the constant with that branch in the
same commit; a healthy DB with no default row then yields the honest answer the
unknown-slug path will give every other unmapped host (platform or fail-closed),
rather than inventing a practice. Nothing else references it — grep-verified.

## Q4 — `getBaseUrlSafe()`'s hardcoded `https://valentinavelez.com`

`PUBLIC_APP_URL` is **not set in production** (verified against the live variable
list), so the env branch never fires and every call falls to `getBaseUrl()`, which
reads request headers. The hardcoded domain is emitted **only when `headers()`
throws — i.e. outside a request scope**. Reachable paths, enumerated (14 call sites,
9 files):

- **`app/api/jobs/tick/route.ts:275`** — the cron tick. **This is the live one**: it
  runs outside any request, so `getBaseUrl()` throws and every link the tick emails
  carries `valentinavelez.com`. For her clients that is correct today and wrong for
  every other practice the moment one has scheduled mail.
- `lib/appointments.ts:445` (payment link), `lib/capture.ts:69`, `lib/agreements/index.ts:356`
  (signing link) — these run inside requests when user-triggered, but are also
  reachable from the tick's code paths; each needs checking per call, not per file.
- Request-scoped and therefore correct today: `app/forgot/actions.ts:44`,
  `app/practitioner/**` (agreements, billing ×3, clients ×2, payments ×2, settings).

**Conclusion for P3:** the hardcoded domain is not a host-resolution dependency and
does not block P3 — but it IS a second "everything unattributed becomes hers" site,
and its live path is the tick. It belongs with P4 (identity follows host).

## Q5 — the null-tenant census across EVERY scoped model

`docs/reports/outbox/P3-NULL-TENANT-CENSUS.sql` — **generated from the Prisma DMMF,
not hand-written**: all 79 entries of `SCOPED_MODELS`, every one confirmed to carry a
`tenantId` column, zero problems. Read-only `count(*)` per table, ordered so any
non-zero sorts to the top. Jacob runs it in the Railway Query tab (rulings 73/75).

Every row must read 0. Any non-zero row is a row that `scopeFilter` currently serves
to Valentina as if it were hers, and it must be resolved before P5 removes that
equivalence — and, for `User`, before auth-guards' branch is removed.

## What I did NOT do

No code changed. The ruling-105 scanner is not built — it is a build, and this
dispatch was read-only. Recommended shape when ratified: extend
`audits/gate-hygiene-verify.ts` or add `audits/nexturl-origin-verify.ts` failing on
`nextUrl` used to construct a cross-host target (`new URL(..., req.nextUrl)`,
`nextUrl.origin` in a URL constructor), allowlisting same-path uses like
`req.nextUrl.clone()`. Standing set would go 37 → 38, named.
