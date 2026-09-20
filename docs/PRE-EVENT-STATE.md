# PRE-EVENT STATE — Psychefolio, as of 2026-09-20

**Written to be picked up cold.** If you are Jacob, a new Architect, or a new
builder, this is the whole picture: what is live, what is verified and by which
instrument, what is known-broken, and what happens after the 23rd.

> **FREEZE IN FORCE (ruling 40).** Nothing merges to the deploy branch except a
> fix for something that breaks the demo — **docs-only pushes included**, because
> every push to `claude/valentinaapp-github-repo-erf4xp` redeploys the site Jacob
> is about to present. Read-only work is fine.

---

## 1. WHAT IS LIVE

| | |
|---|---|
| Deploy branch | `claude/valentinaapp-github-repo-erf4xp` — **auto-deploys on every push** |
| Last verified commit | `93f6ed9` (deploy `be380781`, SUCCESS 2026-09-19 23:29Z) |
| Her practice | **valentinavelez.com** — tenant #1, `tnt_valentina_000000001` |
| The platform | **psychefolio.com** — resolves to NO practice, by design |
| Practice subdomains | `{slug}.psychefolio.com` (Railway wildcard) |
| Staging | `valentinaapp-staging.up.railway.app` |
| Scheduler | **cron-job.org job 8110930**, every 15 min → `/api/jobs/tick`. NOT in any repo — see `docs/EXTERNAL-SERVICES.md` |

**Tenant #1 is a live practice taking real money.** Treat every change to
`lib/prisma.ts`, `lib/tenancy/*` and `lib/auth-guards.ts` accordingly.

### The three hosts behave differently ON PURPOSE

| host | resolution | root | data access |
|---|---|---|---|
| `valentinavelez.com` | tenant #1 via `TenantDomain` | static marketing page | hers |
| `{practice}.psychefolio.com` | that practice via host pattern | **307 → `/book`** | that practice's |
| `psychefolio.com` | **unresolved** | **307 → `/platform`** | none |
| `{unknown}.psychefolio.com` | **unknown-slug** | her marketing bytes | **REFUSED** |

That last row is the deliberate chrome/data divergence (ruling 113): a subdomain
nobody owns renders a harmless marketing page and can reach **no rows at all**.

---

## 2. WHAT IS VERIFIED, AND BY WHICH INSTRUMENT

**The standing regression set is 44 entries, `scripts/regress.sh`, stamp-audit
LAST.** That committed script IS the enumeration — a sweep total is never
restated without it (rulings 38/48). Last run: **44/44, `SWEEP EXIT: 0`**.

Run it against a scratch database only; the gates refuse Railway URLs themselves.

```
DATABASE_URL=postgresql://…scratch PAYMENT_TOKEN_ENC_KEY=… scripts/regress.sh
```

### Verified live against production (2026-09-19/20)

| claim | instrument |
|---|---|
| Her seven surfaces 200 | direct HTTP: `/book /join /signup /privacy /login /api/health /api/tenant-kind` |
| Her root is unchanged | raw counts **valentina=35 / veritas=6**, `37295` bytes, zero `NEXT_REDIRECT`, zero `__next_error__` |
| Her data is reachable | `/book` renders her booking page — a real scoped read through `scopeFilter` |
| A second practice is isolated | `psf-rehearsal` → its OWN tenant id in the `[tenant-scope]` log, not hers |
| An unowned host reaches nothing | `refusing scoped access: host slug "nosuchtenant" matches no tenant row` |
| No live row has a null tenant | production census: **82 tables, every one zero** |
| Her write path survives the **ownership pre-check** (item 3) | **Jacob's rename**, 2026-09-19 — a `UNIQUE_WRITE` update, the save its own positive control (ruling 164) |

**NOT yet verified live, and named rather than papered over:** the write half of
P5's **central** items — `scopeFilter`'s NULL-equivalence removal and the auth
refusal. `scopeFilter` governs reads AND writes; the live reads above exercise
the read half only, and the tick has reported all zeros on every run since the
deploy, so no `update`/`delete`/`upsert` has run in either tenant on this build.
**Task #16 closes it** on two renames — one as Valentina, one in `psf-rehearsal`.
A failure would read `tenant-scope: <model>.update target not found in tenant
scope` in the Railway deploy log; that line alone settles it, no database needed.

### Verification law this project runs on

- **Ruling 110** — absence is evidence only with a positive control.
- **Ruling 125/153** — test the instrument. Every instrument failure here was
  caught by a control or an artifact read, never by reasoning.
- **Ruling 38** — name the moving count.
- **Ruling 157** — a gate referencing the default tenant gets an explicit
  fixture tenant, **never** a relaxed assertion.
- **Ruling 166** — an artifact commit is still a commit; read regenerated logs
  before committing them.
- **Ruling 168** — a grep for a privilege's name cannot find an apparatus that
  depends on its effect. A name search is the first instrument, never the only one.
- **Ruling 170** — measurement contaminates. Clean up after a probe.

---

## 3. WHAT IS KNOWN-BROKEN AND TRACKED

Nothing here breaks the demo. All of it is written down so nobody rediscovers it
at 2am.

| # | thing | impact | tracked |
|---|---|---|---|
| 1 | **Auth redirects are pinned per-environment.** The `/api/auth/*` route handler builds its redirect from `req.url`, never from `x-forwarded-host` — it isn't on the code path that reads headers. Production is pinned to her own host, so **her sign-in is correct today**. A SECOND practice signing in on its own subdomain would be redirected to hers. | post-event; blocks multi-practice sign-in | `ITEM4-AUTH-URL-MECHANISM.md`, task #12 |
| 2 | **`emitEvent` declares a `tenantId` parameter and never uses it** (`lib/intake/engine.ts:64`). Harmless in production, where the request scope stamps correctly. A **misleading signature** and a real trap for whoever touches attribution next. | none live | queued |
| 3 | **The unknown-slug refusal surfaces as a raw 500**, not C26's neutral 503, because the `(public)` layout redirects only on `kind === "unresolved"`. A face, not a leak. | cosmetic | queued |
| 4 | **The tick runs in her scope.** One external scheduler calls her host, so every scheduled step — including platform marketing — executes inside tenant #1's scope. P4 fixed what engage SENDS AS and STAMPS; it could not make the tick tenant-neutral. | none live | ruling 127 |
| 5 | **Engage send/state write are not atomic** (ruling 151) — one duplicate to one recipient after a crash mid-step. Not a loop. | bounded | do NOT fix before the 23rd |
| 6 | **Presentation still names her.** Five `DEFAULT_TENANT_ID` comparisons remain in `app/`. | by design until brand-web | task #15 |

### The engage gate is CLOSED and stays closed through the event.

---

## 4. POST-EVENT QUEUE, IN PRIORITY ORDER

1. **Rulings 150 + 146 as ONE change** (task #14) — they touch the same write.
   Deliberately deferred: a behaviour change to the engine days before its first
   real use was the wrong risk, and the audit noise was tolerable.
2. **Item 4 / the auth origin fix** (task #12) — mechanism now known, shape
   written, verification named (three hosts, not one). Blocks a second practice.
3. **BRAND-WEB — the presentation place** (task #15). Five chrome branches plus
   `/api/tenant-kind`'s wire field, all blocked on one prior decision: does `/`
   become dynamic and per-tenant, or is each practice's public site built
   separately? The contract change is ratified and ready in
   `P5-ITEM2-CHROME-DESIGN.md` §2.
4. **`emitEvent`'s dead parameter** — small, but do it before anyone else reads
   that signature and believes it.
5. **The unknown-slug 503** — cosmetic.
6. C33, C34, P6, the manifest "Veritas" leak, the apex decision.

---

## 5. STANDING SAFETY RULES — NON-NEGOTIABLE

- **Ruling 73 — a production database credential NEVER enters an agent session.**
  Jacob runs SQL from the Railway dashboard Query tab and pastes the output.
- **Ruling 116** — that Query tab accepts ONE statement and appends its own
  `LIMIT`. Mutations must be data-modifying CTEs ending in a `SELECT`; order
  results so anything non-zero sorts to the top.
- **Never `prisma migrate dev`.** The gates refuse Railway `DATABASE_URL`s.
- **Never echo a secret** — `JOBS_SECRET`, API keys, tokens.
- **PCI**: no PAN, CVV or bank capture.
- **Push = deploy.** There is no staging gate between a push and her live site.

---

## 6. THE ONE SENTENCE TO CARRY (ruling 160, verbatim)

> Resolution and data scoping are hers no longer; presentation still is, because
> the marketing bytes still are.

The platform split is **closed**. Psychefolio can host a second practice whose
data is fully isolated from hers, on its own host, with its own identity in
chrome and email. What it cannot yet do is give that practice its own marketing
page — that is brand-web, and it is scoped, not started.
