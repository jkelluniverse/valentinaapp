# P5 — VALENTINA BECOMES AN ORDINARY TENANT. The platform split closes.

**Sweep 44/44, `SWEEP EXIT: 0`, stamp-audit last. Pushed `2de7bd6..e52517b`.
Production deploy `be380781` SUCCESS 23:29Z.**

## RULING 160'S LINE, VERBATIM, BECAUSE IT IS THE HONEST ONE

> Resolution and data scoping are hers no longer; presentation still is, because
> the marketing bytes still are.

Five `DEFAULT_TENANT_ID` comparisons remain in `app/` under task #15, retired by
brand-web. **P5 is NOT "no default-tenant reference left in production code" and
must never be reported as such.**

---

## WHAT SHIPPED

**Item 1** — all five global-by-intent email reads go through
`lib/user-identity.ts`'s `emailInUse()`, which returns a **boolean, never a row**.
Pinned by counts, because five inline queries spotted by eye is exactly what made
A4 miscount.

**Item 2** — **DEFERRED TO BRAND-WEB** (ruling 159/160). `/api/tenant-kind`'s
contract change is ratified as designed and ships there; its three proven facts
are carried forward verbatim in `P5-ITEM2-CHROME-DESIGN.md` §2.

**Item 3** — the ownership pre-check exemption is gone. Her tenant is checked
like every other.

**Central 1** — `scopeFilter`'s NULL-equals-default equivalence is gone.
`lib/tenancy/scope.ts` reads `(tenantId) => ({ tenantId })`. **A row belonging to
nobody now belongs to nobody.**

**Central 2** — the NULL-tenant sign-in branch is gone, **replaced by a refusal
rather than deleted**, and the difference is the whole point. Dropping the line
would fail OPEN: with no branch examining a null tenant, the guard above it is
skipped and such a user resolves on EVERY host instead of one. Dead code that
fails open when it comes back to life is worse than the branch it replaced.

---

## V7 — LOOKING BEFORE REMOVING, AND WHY IT WAS NOT ENOUGH

V7 found **one** load-bearing gate: `audits/platform/verify.ts` nulled a row and
asserted HER DAL could still see it — `scopeFilter`'s default branch restated as
a test. **Inverted, not relaxed**: a null-tenant row is now visible to nobody,
plus a new positive control so "invisible" cannot pass because the row vanished.

**Then the sweep found two more that V7 could not have.** `onboarding-ui` and
`onboarding-discovery` mention neither `scopeFilter` nor `tenantId: null`. They
leaned on the equivalence **by behaviour**, through a lib function three calls
deep. **A grep for a privilege's name cannot find an apparatus that depends on
its effect.** (Proposed for a ruling number; recorded as a finding meanwhile.)

The first hypothesis — a null-tenant fixture user broken by the auth removal —
was **wrong, and was tested rather than acted on**: all 19 fixture users carry a
real tenantId, and for a non-null user the new auth logic is identical to the
old. The real cause was two unstamped fixture writes, and it was **isolated**:
stamping the consent grant alone took discovery from four red to 19/19.

**Counts named (ruling 38), both gates stronger, no assertion relaxed:**
platform-verify 19 → 20 checks; fail-closed-tenancy 18/18 → 19/19.

---

## V1–V3 LIVE, AGAINST `be380781`

**V1 — her practice.** Seven surfaces 200. Root 200, `37295` bytes, her title,
`NEXT_REDIRECT` 0, `__next_error__` 0, ruling-44 counts **35/6** — the pinned
baseline, unmoved across every deploy tonight. `/book` returns her booking page:
**a real scoped read through the changed `scopeFilter`**. Logs:
`[tenant-scope] host=valentinavelez.com tenantId=tnt_valentina_000000001`.

**V2 — `psf-rehearsal`.** `/` → 307 → its own `/book`;
`{"kind":"tenant","isDefault":false}`; `/book` 200 with **zero** "valentina".
Logs put the proof at the data layer:
`[tenant-scope] host=psf-rehearsal.psychefolio.com tenantId=cmu4m1p160003x6aemtexsxeu
via=host-pattern-slug` — **its own tenant id, not hers.**

**V3 — both non-tenant outcomes, each with its control.**
`psychefolio.com` logs `UNRESOLVED` and its four front doors are 200 (`/` → 307
→ `/platform`). The unowned subdomain answers `unknown-slug` and diverges:

| `nosuchtenant.psychefolio.com` | |
|---|---|
| `/`, `/privacy` (static) | 200, her bytes (35/6) |
| `/login` (chrome only) | 200, valentina=**0** |
| `/book` (**reads data**) | **500 — refused** |
| CONTROL: `/book` on **her** host | **200** |

Named in the log: `[tenant-scope] refusing scoped access: host slug
"nosuchtenant" matches no tenant row`.

---

## WHAT IS **NOT** PROVEN — V1 AND V2'S WRITE HALVES

**Both need Jacob, and I am saying so rather than declaring it proven.**

The tick at 23:30Z reported all zeros again, so no write has run in her tenant on
this build. Every write path in both tenants is behind a sign-in. `scopeFilter`
governs reads **and** writes, and while the reads above exercise it live, the
write half does not follow from them.

**Two sixty-second renames close it:**
1. Signed in as Valentina on `valentinavelez.com` — rename something, rename it
   back. Same exercise as last time; this time it tests the equivalence removal.
2. The same in `psf-rehearsal`.

The save is its own positive control. A failure would read `tenant-scope:
<model>.update target not found in tenant scope` in the Railway deploy log —
that line alone closes it, no database needed.

---

## TWO OBSERVATIONS, FLAGGED NOT FIXED

1. **`emitEvent` declares a `tenantId` parameter and never uses it**
   (`lib/intake/engine.ts:64`). `startFlow` passes `tenant.id`; the create
   ignores it and relies on the scoped client stamping. Harmless in production,
   where the request scope stamps correctly — but a **misleading signature**:
   anyone reading it would believe it controls attribution. A trap for whoever
   touches attribution next. Found because the builder's own probe used it and
   left a null-tenant row that two gates correctly objected to.
2. **The unknown-slug refusal surfaces as a raw 500**, not C26's neutral 503,
   because the `(public)` layout redirects only on `kind === "unresolved"`. A
   face, not a leak. P3.3-era, not P5's.

---

## ASKED

- **Ruling 166** has no text on this side. Left deliberately blank rather than
  invented.
- **A number for the V7 finding**, if you want it in the sequence.
