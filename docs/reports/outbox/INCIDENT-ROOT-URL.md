# INCIDENT REPORT — the root URL (2026-09-15)

**Status: STAGING FIXED AND VERIFIED · PRODUCTION HELD FOR JACOB (one action,
staging-proven, rollback recorded).** Ruling 60.

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
