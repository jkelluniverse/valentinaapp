# C26-FAIL-CLOSED-TENANCY — a host that cannot be resolved is not Valentina's

**Spec:** C26-FAIL-CLOSED-TENANCY (task #81) · **Depends-on:** ruling 33's cache fix, C25, PLATFORM Phases 0–5
**Priority:** high. Not a Sept 23 blocker — the event mints tenants, it does not stress them — but it should not survive long past it, and the reproduction is sitting in the repo waiting to become an acceptance gate.
**Architect:** decided 2026-09-11, on the confirmed reproduction in `audits/t81-booking-tenant-repro.ts`.

## Why this exists

Task #81 is no longer a hypothesis. Under an injected resolution failure — the server running with `SELECT`
revoked on `Tenant` only, so every tenant lookup fails while all other reads and writes succeed — a real
booking on **practice B's own host**, through the real `/book` form, completed end to end and landed its
`Lead` in `tnt_valentina_000000001`. Correctly stamped, so the tenant-stamp audit and platform verify would
never blink. The healthy control on the same host stamped tenant B, so the flow is normally tenant-correct.

Two aggravations found in the same run, and they change what kind of defect this is:

- Practice B's `/book` page **renders Valentina's availability** to B's visitor.
- The booking notification **emails Valentina's practice**.

So this is not merely misattribution. One practice's business data is displayed on another's domain, and a
prospective client's name, email and "what brings you?" are delivered to a practitioner who has no
relationship with them. That is a confidentiality failure on a public surface, and it is silent by
construction — every row involved is correctly stamped for the tenant the request *thought* it was.

**Why it fails this way.** There are three layers of silent defaulting in `lib/tenancy/index.ts`, and each
one is individually defensible:

1. `tenantBySlug` returns `null` on a query error (post-ruling-33 it no longer caches that null — good).
2. `getTenant` does `(await tenantBySlug(slug)) ?? (await tenantBySlug(DEFAULT_TENANT_SLUG))` — so a
   *failed* lookup for practice B falls through to the default practice.
3. If even that returns null, a hardcoded `tnt_valentina_000000001` literal is returned.

The result: **when the database cannot answer "whose host is this?", every host in the system answers
"Valentina's."** The root cause is that the code cannot distinguish *"unknown slug, legitimately the
default"* from *"known host, resolution failed."* Layer 3's comment names its real purpose — a fresh
database before seeding — which is a genuine need conflated with an error state.

## The line this build does not cross

**`getTenant()` must keep never throwing.** The root layout calls it on every request; making it throw would
turn a config hiccup into a blank site, which is the failure the literal was written to prevent. The fix is
not "throw more" — it is to stop *lying about identity* while continuing to render something safe.

Equally: **do not change what an unknown slug does.** `someone-elses-subdomain.psychefolio.com` resolving to
the default host is documented, intentional behavior. This spec is about the error path only.

## Assumptions to verify, not trust

*(Ruling 18. My beliefs, not facts — three specs in this program asserted such claims and two were wrong.)*

1. `getTenant()`'s never-throw property is load-bearing: the root layout and other chrome call it on every
   request, including for signed-out visitors. **Find its actual callers** before changing its contract.
2. The authenticated cross-tenant door in `lib/auth-guards.ts`
   (`if (userTenantId && userTenantId !== tenant.id) return null`) means signed-in surfaces already fail
   closed under a resolution failure — the practitioner is locked out, not shown another practice's data.
   Confirm this, because it decides whether this spec's scope is public-only or wider.
3. The public write paths that can attribute to the wrong practice are C18's booking action (`Lead` +
   `Appointment`). `PractitionerProspect` and `ProspectMessage` are platform-level and therefore unaffected.
   **Enumerate the scoped writes reachable from unauthenticated surfaces** rather than trusting this list.
4. After ruling 33, the resolver already has the information to distinguish an error from a not-found — the
   two are separate branches. The mechanism is therefore small; the design weight is in what a public page
   shows when it fails closed.
5. The literal fallback exists for a fresh, unseeded database, not for a database that is up but erroring.

## Standing laws this build must honor

- **Server-side enforcement (law #5)** and **fail closed** — a scoped write with an unverified owner must
  refuse. This is the same principle as C25's `writePracticeSetting`, which throws rather than defaulting.
- **Bilingual parity (law #7)** — any new visitor-facing page ships EN and ES.
- **Honest data posture (law #8)** — an error page must not imply a practitioner is unavailable, deleted, or
  at fault. It is our failure; say so plainly.
- **Attributable audit (law #6)** — a refused request should leave a trace an operator can find. Metadata only.

## Build order

### 1. Make the resolution honest

Give the resolver a discriminated result — `tenant` / `unknown-slug` / `unresolved` — so callers can tell
the three apart. `unresolved` means the lookup errored: we do not know whose host this is.

`getTenant()` keeps its signature and its never-throw contract, built on top. Its one behavior change: on
`unresolved` it must **not** return another practice's identity. Return a neutral, practice-less shell —
platform-shaped, no practice name, no practice branding, no borrowed wordmark. Rendering Valentina's
identity on someone else's domain is the bug, not the fallback.

Keep layer 3's literal **only** for its stated purpose: a lookup that *succeeded* and found nothing on the
default slug (a fresh database). Never for an error.

### 2. Fail closed in the data layer — this is the invariant that actually protects

Under `unresolved`, **no tenant-scoped read or write may proceed.** Not a default-tenant fallback, not a
best guess: a refusal. Put it where C25 put its equivalent — in the scope resolution the Prisma client
consults — so it holds for every scoped model without any call site remembering.

This alone would have prevented every symptom in the reproduction: the availability read, the `Lead` write,
and the misdirected email.

### 3. What a public page shows when it fails closed

A neutral, bilingual "temporarily unavailable" page, HTTP **503** with an appropriate `Retry-After`. No
practice name, no practice branding, no logo belonging to anyone. Since ruling 33 stopped the cache from
poisoning, the next request usually succeeds, so this is a brief interruption rather than an outage — but
it must be honest while it lasts, and it must not offer a form that cannot be safely submitted.

### 4. Promote the reproduction to an acceptance gate

`audits/t81-booking-tenant-repro.ts` already does the hard part: a real second practice from the real signup
service, the real built app, genuine `Host` headers, and deterministic failure injection via a DB role with
`SELECT` revoked on `Tenant` alone. Turn it into the gate. If the role-creation and server-killing make it
unsuitable as a standing gate, say so and keep it manual — but then the standing gate must cover the same
invariant by another route, and the report must state exactly what is no longer continuously enforced.

## Verify (this list is the gate — evidence required per item)

1. Each of the five assumptions confirmed or corrected in writing, with evidence.
2. **The reproduction now fails to reproduce:** same injected failure, same host, same form — and no `Lead`
   or `Appointment` is created **in any tenant**. Assert the absence globally, not just in tenant B.
3. Under the same failure, practice B's public pages render **neither Valentina's availability nor her
   branding, name, or wordmark** — assert those strings absent from the HTML.
4. No notification email is sent to any practice under the failure — assert at the transport boundary.
5. **The healthy control still works:** same host, same form, no injected failure → the booking completes
   and the `Lead` is stamped tenant B. The fix must not cost a working booking.
6. Recovery is immediate: once the failure is lifted, the next request resolves correctly with no restart
   and no wait.
7. An unknown slug still behaves exactly as it does today — this spec changed the error path only.
8. A fresh/unseeded database still renders rather than erroring (layer 3's real purpose, preserved).
9. Signed-in surfaces: the authenticated cross-tenant door still holds under a resolution failure, and a
   practitioner is locked out rather than shown another practice's data.
10. The 503 page renders in both locales and names no practice.
11. Regression, non-negotiable: `lint:wall` · `guard-prisma` · `tsc` · `build` · `smoke` · `smoke:writes` ·
    signup **37/37** · capture **59/59** · referral **68/68** · engage **172/172** · tenant-scope **48/48** ·
    nested-stamp **43/43** · settings-i18n **10/10** · practice-setting **47/47** · platform phase2 **16/16**,
    phase3 **11/11**, phase5 **17/17** + verify · c21 **58/58** · c20 **28/28** · v31 **32/32** · c12x ·
    onboarding 16/16, 17/17, 7/7, 10/10, 19/19 · password-reset · amd06 · then the stamp audit **exit 0**,
    run last. The credential-gated four stay `NOT VERIFIED — vendor credential required`.

## Out of scope (do not build)

Changing unknown-slug behavior · a retry/backoff layer in the resolver (a separate concern; say so if you
think it is needed) · the multi-tenant conversion program · touching Valentina's client-visible chrome ·
any change to `SCOPED_MODEL_SET` · recapturing the visual baseline.
