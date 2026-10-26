# INCIDENT REPORT — the root URL (2026-09-15)

**Status: CLOSED (Architect, 2026-09-16).** Both environments fixed and verified
(steps 1-2, Jacob-authorized, recorded below); 36-entry sweep green; ports/rulings
merged. Rulings 60-62, 66-70. The sections below are the record in the order the
incident unfolded.

## What broke, when, why

Since **f988a68 (2026-09-14 ~16:35Z)** and through four subsequent deploys, production
and staging served a baked `NEXT_REDIRECT;replace;/unavailable;307;` error shell at
`GET /`. Cause: Railway's BUILD phase cannot reach `DATABASE_URL` (the private-domain
value), so C26's build-time tenant resolution fails with nothing cached → unresolved →
the (public) layout's redirect is baked into the static root. Blast radius: the static
root ONLY — every dynamic route resolves at runtime and stayed 200 throughout. Not
caught because every deploy check probed `/api/health`, `/login`, `/api/tenant-kind`
and never `/` (rulings 61/62 close that).

## P1–P3 — the remedy proven locally before touching anything

- **P1** (build with DATABASE_URL at the unreachable `postgres.railway.internal`):
  build **exits 0** — silently — and the artifact appears:
  > `.next/server/app/index.html` and `index.rsc` contain `NEXT_REDIRECT;replace;/unavailable;307;`
- **P2** (build with the DB reachable): `digest in prerendered root: 0`, then served:
  > `HTTP/1.1 200 OK` · `<title>Rewrite Your Subconscious Mind, Transform Your Life.</title>` · `digest occurrences in served body: 0`
- **P3**: both behaved exactly as predicted → option 1 proven, proceeded.

## S1–S4 — staging, authorized and done

- **S1**: staging's before-state recorded: **no custom buildCommand** (Railpack
  default) — the rollback is clearing the field. Set staging-only Build Command:
  `DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`.
- **Operational lesson (recorded in ruling 60)**: Railway **redeploy REUSES the prior
  build** — the first redeploy came back with the root still baked (caught by reading
  the LAST HTTP status line; the proxy's "200 Connection Established" CONNECT line is
  not the origin status — ruling 61's second instance). The `accept-deploy` API timed
  out three times with the patch still STAGED; the Railway agent then committed staged
  patch `09141add` and triggered a fresh FROM-SOURCE deployment
  (`3f74c8fc`, SUCCESS 22:53Z). Staging only throughout; production untouched.
- **S2, on the serving staging tip**, each quoted separately:
  > origin status line: `HTTP/2 200`
  > title: `<title>Rewrite Your Subconscious Mind, Transform Your Life.</title>`
  > NEXT_REDIRECT digest occurrences in body: `0` (and `__next_error__`: 0)
- **S3**: /book /join /signup /privacy /login /api/health /api/tenant-kind — **all
  200**. Nothing traded away.
- **A2 (runtime untouched)**: no `set-variables` call was ever made; staging's
  variable NAMES are byte-identical before and after (quoted lists match); the only
  changed thing is the environment's Build Command string. Runtime keeps the private
  `DATABASE_URL` by construction, and the 200s on every dynamic surface confirm
  runtime DB health.
- **A1 (DATABASE_PUBLIC_URL reachable from the build container)**: CONFIRMED — the
  fresh build produced a digest-free 200 root, which is only possible if the build
  resolved the default tenant against a reachable DB.
- **A3**: the resolving root renders the DEFAULT tenant's marketing page (title
  quoted). The C29 middleware redirect ahead of it is gate-proven per-request
  (event-chrome V4, demo-path) but is INERT live while PLATFORM_DOMAIN is unset —
  see Q1–Q3.

## PRODUCTION — the one-action move for Jacob (DO NOT run without his go)

- **Change**: set the production service's Build Command to
  `DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`
  and trigger a fresh FROM-SOURCE deployment (not a redeploy — a redeploy reuses the
  old build and changes nothing).
- **Verify (ruling 62)**: on the serving tip, `GET https://valentinavelez.com/` —
  LAST HTTP status line 200, her title present, zero `NEXT_REDIRECT` in the body;
  then the seven-surface sweep (all 200).
- **Rollback**: clear the Build Command (production's before-state, like staging's,
  is the Railpack default) and redeploy fresh — one action back.
- **Tradeoff accepted by ruling**: builds now require a live, reachable DB — already
  the local contract; the honest decoupling is brand-web's after Sept 23.

## Q1–Q3 — PLATFORM_DOMAIN (escalated to Jacob; NOTHING changed)

- **Q1 — exact value shape**: the BARE APEX, no leading dot, no port. Quoted from
  `lib/tenancy/index.ts` (slugFromHost): `const clean = host.split(":")[0].toLowerCase();
  if (clean === platformDomain || !clean.endsWith(`.${platformDomain}`)) return DEFAULT_TENANT_SLUG;`
  — i.e. `PLATFORM_DOMAIN=psychefolio.com`. One label only (a dotted sub returns the
  default), case-insensitive, port stripped.
- **Q2 — what else must be true, and what exists TODAY**: wildcard DNS and a wildcard
  domain on the Railway service. **Both already exist and work**: production's custom
  domains are `valentinavelez.com` and **`*.psychefolio.com`** (quoted from Railway),
  and a live probe of `https://test.psychefolio.com/api/tenant-kind` answered
  **200 `{"kind":"tenant","isDefault":true}`** — DNS resolves, TLS terminates, Railway
  routes to the app, and the app resolves the DEFAULT slug exactly as expected while
  the variable is unset. Setting `PLATFORM_DOMAIN` is the last switch.
- **Q3 — what the gates prove**: every gate asserts subdomain resolution PER-REQUEST
  IN-PROCESS (x-forwarded-host headers against localhost). None asserts it against a
  real deployed host. **The gates prove the logic, not the deployment** — the
  test.psychefolio.com probe above is the first live half-proof, and it can only
  become a full proof after Jacob sets the variable.

## Also in this change set (approved earlier, checkpointed to claude/ports-wip, NOT on the deploy branch)

- Rulings 58–62 recorded. Ruling 55's reason (b) struck per ruling 58.
- **Port fix per ruling 59**: v31 3123→3125, c21 3124→3126 (the earlier gate in the
  sweep keeps its port; both gates re-run green: 32/32, 58/58).
- **`audits/port-uniqueness-verify.ts`** wired into the standing set before
  stamp-audit (**35 → 36 entries, the addition named**). Its FIRST run found two MORE
  collisions the manual survey had missed (the survey read only each file's first
  PORT constant): billing/b1's MOCK_PORT shared **3131 with settings-i18n — a
  standing-set gate** — and billing/b2's MOCK_PORT shared 3132 with pipeline/p12.
  Moved to 3181/3182 (out-of-set gates move; named). Demonstrated failing (v31
  temporarily reverted to 3123 → `✗ port 3123: audits/agreements/v31-verify.ts AND
  audits/signup/verify.ts`, exit 1; restored → PASS, 32 declarations, 32 distinct).
  Fourth confirmation that a scanner beats a list — on day one.
- The full 36-entry sweep and the deploy-branch merge WAIT until the production root
  incident is closed, per the incident dispatch.

---

# Q1a–Q1c — the PLATFORM_DOMAIN safety trace (rulings 66/67 recorded)

All traces assume `PLATFORM_DOMAIN=psychefolio.com` SET. The function
(lib/tenancy/index.ts, slugFromHost):
> `const clean = host.split(":")[0].toLowerCase();`
> `if (clean === platformDomain || !clean.endsWith(`.${platformDomain}`)) return DEFAULT_TENANT_SLUG;`
> `const sub = clean.slice(0, -(platformDomain.length + 1));`
> `return sub.includes(".") ? DEFAULT_TENANT_SLUG : sub || DEFAULT_TENANT_SLUG;`

**Q1a — valentinavelez.com: SAFE.**
`"valentinavelez.com".endsWith(".psychefolio.com")` is false → the second branch
returns `DEFAULT_TENANT_SLUG` — the EXPLICIT non-match branch, not a fallthrough.
`resolveTenant` then does `tenantBySlugChecked("valentina")` → the default row →
`{kind:"tenant", tenant: default}` — byte-for-byte the resolution her site gets today
(today EVERY host takes the `!platformDomain` first branch to the same slug). The
three C26 outcomes, for the record: `tenant`(default) = her live site, unchanged;
`unknown-slug` = default-host content (ruling 43); `unresolved` = the neutral 503 —
and `unresolved` arises ONLY from a failed DB lookup with nothing cached
(resolveTenant's `!r.ok` branch), a code path this variable cannot reach. The
middleware root redirect also stays off her host: its own guard
(`!clean.endsWith(".psychefolio.com")` → false) exits before any lookup.

**Q1b — psychefolio.com and www.psychefolio.com: SAFE (with one live fact).**
Bare apex: `clean === platformDomain` → default slug → her site in code — but the
apex DOES NOT ROUTE to the app today at all: it is not among the service's Railway
domains (`valentinavelez.com`, `*.psychefolio.com` — a wildcard does not cover the
apex) and a live probe was UNREACHABLE (curl exit 000, no route). Nothing changes for
anyone. www: sub `"www"` (single label) → slug `"www"` → `tenantBySlugChecked` finds
no row — and never can, `"www"` is in RESERVED_SLUGS — → `unknown-slug` → default-host
content. Live probe today: www.psychefolio.com answers 200 through the wildcard. Her
site is not affected; the platform's www showing HER brand is the documented
brand-web class (F2 copy half), not a new break.

**Q1c — valentina.psychefolio.com: SAFE; yes, the default tenant goes live on a
second host, and nothing breaks or leaks across them.**
sub `"valentina"` = the default slug → the default row → her site served there.
- **Auth**: works on any host — `trustHost: true` is HARDCODED
  (auth.config.ts:6, with the comment "Railway terminates TLS at a proxy"); the
  absence of AUTH_TRUST_HOST from the production env is irrelevant.
- **Cookies**: Auth.js defaults, NO custom cookie/domain config anywhere in
  auth.config.ts/auth.ts → host-only cookies → a session on valentinavelez.com is
  neither valid on nor visible to valentina.psychefolio.com, and vice versa. No leak;
  the benign consequence is that logins do not transfer between the two hosts.
- **Absolute links**: getBaseUrl() builds the origin from the request's
  x-forwarded-host → links follow whichever host the visitor is on.
  getBaseUrlSafe() prefers PUBLIC_APP_URL — UNSET in production — then the request,
  then hardcoded `https://valentinavelez.com` (cron/email contexts, which are hers).
- **Email links**: portalHostFor(slug) mints `slug.psychefolio.com` for NEW practices'
  welcome mail — the variable's intended purpose; her own flows use the request host
  or her domain.

**The test.psychefolio.com clarification, stated for the record:** today's
`200 {"kind":"tenant","isDefault":true}` proves ROUTING AND TLS ONLY. It resolves the
default tenant precisely BECAUSE the variable is unset (first branch of slugFromHost).
With the variable set, that host becomes `kind:"unknown-slug"` (still default-host
content; the middleware redirect requires kind "tenant" AND !isDefault, so no
redirect). It is NOT evidence the demo path works end to end — that requires the
variable set plus a real minted tenant on a real subdomain.

# The 3131 exposure answer (ruling-58 test applied)

**settings-i18n's greens stand.** The gate that shares 3131 — audits/billing/b1-verify
(its MOCK_PORT) — appears in ZERO relied-on sweeps: `grep -c "b1\|billing"
scripts/regress.sh` → **0**, and the session transcript contains no `PASS b1`/`FAIL b1`
line at all — b1 has never been RUN on this container, so there was never an earlier
gate on 3131 to crash. settings-i18n itself: `PASS settings-i18n :: 10/10` in all
three of today's sweeps (quoted from their output files) and in the Sept-14 C29
pre-merge sweep. Full disclosure of the only FAIL lines in history: the transcript
holds two `FAIL settings-i18n (exit 1)` lines from a C25-era sweep (datable by
`engage :: 172/172` on the same output — before C26 moved engage to 173) — that was
settings-i18n's OWN loud red (its pre-pass reference, fixed in 43045eb "pin
settings-i18n's pre-pass reference; full regression green"), predates every relied-on
sweep, and cannot be a 3131 ghost because nothing had ever listened on 3131.

# PRODUCTION — prepared single action (NOT run; awaiting Jacob)

1. Set production Build Command to exactly:
   `DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`
2. Trigger a FRESH FROM-SOURCE deployment (ruling 67 — NOT a redeploy, which reuses
   the broken build).
3. Verify per rulings 61/62, each quoted separately: LAST HTTP status line on
   `GET https://valentinavelez.com/` = 200 · title present · NEXT_REDIRECT digest
   count 0 · then /book /join /signup /privacy /login /api/health /api/tenant-kind
   all 200.
4. Rollback: clear the Build Command (before-state = unset/Railpack default, same as
   staging's was) and run another fresh from-source deployment.

**Expected downtime: NONE.** Railway keeps the old deployment serving until the new
one reaches SUCCESS, then removes it — observed on this service today: production's
21:17:52Z deployment reached SUCCESS at 21:20:01Z and the PRIOR deployment was only
REMOVED at 21:20:05+Z, after the new one was serving; same pattern on staging. The
root's current 307 keeps serving during the ~2–3 minute build, then flips to the
healthy 200 atomically with the traffic switch. Her booking funnel (/book, dynamic)
is unaffected before, during, and after.

---

# STEPS 1 AND 2 — EXECUTED WITH JACOB'S GO (2026-09-15/16). Rulings 68/69 recorded.

## Step 1 — production root fix (build command)

- **1a before-state, quoted**: production build config was
  `{"builder":"RAILPACK","buildEnvironment":"V3"}` — NO custom Build Command (Railpack
  default), nothing staged. Rollback: clear the field, fresh from-source deploy.
- **1b**: Build Command set to `DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`
  (`updatedFields: ["buildCommand"]`, production only).
- **1c**: fresh FROM-SOURCE deployment via the Railway agent's deployServiceTool (the
  path that worked on staging; accept-deploy not retried, no redeploy — ruling 67).
  Deployment `d13b8518-7125-4f9d-853e-c99b3490e43d`, reason `deploy`, created
  23:21:59Z → SUCCESS 23:23:50Z.
- **1d real build proven from the build log**: Railpack plan step
  `▸ build $ DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`; buildkit vertex for
  that exact command `started 23:22:18Z … completed 23:23:04Z` — a 46-second real
  build, not a reused image.
- **1e, each quoted**: status lines `HTTP/1.1 200 Connection Established` (proxy
  CONNECT) then **`HTTP/2 200`** (origin, read last per ruling 61) · title
  `<title>Rewrite Your Subconscious Mind, Transform Your Life.</title>` ·
  NEXT_REDIRECT count **0** · __next_error__ count **0** · seven surfaces all 200.
- **1f**: /book polled during the build (23:22:11, 23:22:32, 23:22:52) and after
  (23:28:44) — all 200. Zero observed downtime.
- Root restored at 23:23:50Z, ~31 hours after f988a68 baked it.

## Step 2 — PLATFORM_DOMAIN (separately, per ruling 68)

- **BEFORE-state**: `PLATFORM_DOMAIN` ABSENT (not empty-string) from BOTH
  environments' variable lists (both quoted in session). Absent-vs-empty: both are
  falsy in slugFromHost's `!platformDomain` guard, so the CODE treats them
  identically; the rollback of record is nonetheless DELETION of the variable.
- **2b, stated before acting**: the variable is read at RUNTIME per-request
  (process.env in slugFromHost), so a deployment is required; per instruction it was
  a FRESH FROM-SOURCE deploy, with the variable set `skipDeploys: true` so exactly
  one deliberate deployment carried it. (Build output unaffected either way — at
  build time there is no request host and `!host` short-circuits first.)
- **2a/2c production**: variable set; fresh from-source deployment
  `e005d116-1ae2-4b49-b9aa-05e1f041d459`, SUCCESS 23:53:43Z. Verified, each quoted:
  - THE ONE THAT MATTERS — valentinavelez.com `/`: origin `HTTP/2 200`, her title,
    NEXT_REDIRECT count 0; /book 200, /login 200. NO degradation → no rollback.
  - **THE PREDICTED FLIP**: `test.psychefolio.com/api/tenant-kind` →
    `{"kind":"unknown-slug","isDefault":true}` — kind flipped from "tenant" to
    "unknown-slug"; isDefault true is CORRECT (the served tenant is the default row).
    The variable demonstrably took effect (ruling 69's scope discipline in action).
  - www.psychefolio.com: `HTTP/2 200`, default content (her title), per Q1b.
- **2f**: all seven valentinavelez.com surfaces re-verified: /book /join /signup
  /privacy /login /api/health /api/tenant-kind — all 200.
- **2g — the bare apex, on the record**: `https://psychefolio.com/` remains
  UNREACHABLE (curl exit 000 — no route to the app; the apex is not a Railway domain
  and the `*.psychefolio.com` wildcard does not cover it). Unchanged by the variable,
  exactly as Q1b traced. A BRAND-WEB item for the before-freeze list, not a bug:
  someone typing the domain without a subdomain on the 23rd reaches nothing.
- **2d staging**: variable set (skipDeploys), fresh from-source deployment
  `f568e1e4-d1b8-4746-8e43-d815f9d161e2`, SUCCESS 2026-09-16 15:50:09Z. Verified:
  root origin `HTTP/2 200`, her title, NEXT_REDIRECT count 0; seven surfaces all 200.
  Environments no longer diverge.
- **Rollback for both**: DELETE the variable (not empty string), fresh from-source
  deploy per environment.

**The incident is resolved in both environments.** Step 3 (36-entry sweep, the
ports/rulings merge with its ruling-48 check, incident-closed ledger timeline, the
before-freeze list) awaits the Architect's go.
