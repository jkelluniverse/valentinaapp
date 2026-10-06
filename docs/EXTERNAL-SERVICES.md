# EXTERNAL SERVICES — live production dependencies outside Railway and GitHub

> ## ⛔ THE SCHEDULER IS NOT OURS AND IS NOT IN ANY REPO (ruling 126)
> Nothing in this codebase, in Railway's config, or in GitHub Actions causes the
> every-15-minute tick. It is a **third-party cron service**. Two separate searches of
> Railway and GitHub correctly found nothing and were wrongly read as "there is no
> scheduler". A dependency you cannot grep for is still a dependency: **this file is
> where it is written down.**

This file exists because `docs/DNS-AND-DOMAINS.md` answers "who resolves the name" and
nothing answered "who calls us, and what silently breaks them". Add a service here the
moment it is confirmed from a dashboard, not when it is inferred from code.

---

## 1. cron-job.org — the scheduler (CONFIRMED from the dashboard, 2026-09-19)

| Field | Value |
| --- | --- |
| Provider | **cron-job.org** (free third-party cron service) |
| Job id | **8110930** |
| Title | `ValentinaApp_Scheduler` |
| State | **enabled** |
| Schedule | **every 15 minutes** |
| Timezone | America/New_York |
| Calls | `GET https://valentinavelez.com/api/jobs/tick?secret=<JOBS_SECRET>` |
| Observed source IP | `116.203.134.67` |
| Observed user-agent | `Mozilla/4.0 (compatible; cron-job.org; http://cron-job.org/abuse/)` |
| Traffic attributed | **673 requests** — all of the tick's production traffic |

**It calls Valentina's host, not the platform's.** That is the fact with architectural
weight, and it is recorded under §1.3 below.

### 1.1 What silently breaks it FROM OUR SIDE

The app never initiates contact, so every failure mode below is invisible unless
someone reads logs or the cron-job.org dashboard. None of them raises an alert today.

1. **Rotating `JOBS_SECRET` without updating job 8110930.** `authorized()` in
   `app/api/jobs/tick/route.ts` returns 401 and the route does nothing. cron-job.org
   records a failed run; the app records a 401 nobody is watching. Scheduled work —
   appointment auto-completion, session reminders, payment reminders, receipts,
   billing sweep, engage — simply stops. **There is no alarm.**
2. **Changing the tick's HOST.** The job's URL is hardcoded at cron-job.org. If
   `valentinavelez.com` stops resolving to tenant #1 — for example if its
   `TenantDomain` row were removed — the tick's tenancy resolution fails. Since P3.3
   that is a hard refusal (503), not a quiet zero-work run; see §1.4.
3. **Disabling or deleting the job.** Nothing in the app notices. The only symptom is
   work that stops happening.

### 1.2 Rotating JOBS_SECRET — what does and does not need to change

Verified by reading the code, 2026-09-19:

- **Nothing in this repository needs changing for a rotation.** `authorized()` reads
  `process.env.JOBS_SECRET` **inside the function**, at request time. No value is baked
  into the build.
- **No gate or fixture hardcodes the production secret.** Every reference in tracked
  source is one of: the commented placeholder at `.env.example:74`; the env-var *name*
  in comments and docs; or `audits/engage/verify.ts:50`, which defines its own
  gate-local literal (`"engage-verify-jobs-secret"`) and injects it into the env of the
  server that gate spawns. That gate is self-consistent and **cannot be reddened by a
  production rotation**.
- **Order of operations matters.** Any window where the Railway variable and the
  cron-job.org job disagree is a window of 401s, one every 15 minutes, with no alert.
  Set the new value in Railway (which redeploys), confirm the tick answers, then update
  job 8110930 — or accept one missed window and update both back to back.
- **If `JOBS_SECRET` is unset entirely, `authorized()` returns false** — the tick 401s
  rather than running unguarded. That is the right failure direction, and it means a
  blanked variable looks exactly like a wrong one.

### 1.3 A secret in a query string — FUTURE SCOPE, NOT BUILT

`?secret=…` appears in access logs, browser history, referer headers and the
third-party dashboard, which is how it came to be in a screenshot at all.

**The header path already exists and needs no code:** `authorized()` checks
`Authorization: Bearer <secret>` **first**, falling back to the query parameter. Moving
job 8110930 to a Bearer header is a cron-job.org dashboard change with zero repo
change. Removing the query-parameter fallback *is* a code change and is deliberately
not made here — doing so before the job is moved would take the tick down.

### 1.4 One scheduler, one practice's host — the design consequence (ruling 127)

The scheduler calls **her** domain, so the tick resolves to **her** tenant on every run,
by host. Today that is correct and, since P1, data-driven: `valentinavelez.com` has a
`TenantDomain` row, so P3.3's removal of the host-pattern fallback does not break it.
P3.3 asserts this explicitly rather than assuming it.

But it means **the platform's own scheduled work currently runs inside her tenant
scope** — the same class of defect as engage stamping audit rows with the default
tenant id. When a second practice exists, one cron hitting one practice's domain cannot
serve both.

**Recorded, not built (ruling 127):** scheduled work needs a tenant-neutral entry point
or a per-tenant invocation model. This belongs with P4's identity work.

---

## 2. Square — payments (CONFIRMED from the dashboard, 2026-09-18)

| Field | Value |
| --- | --- |
| Inbound callback | `POST /api/square/webhook`, observed UA `Square Connect v2`, source IPs `34.202.99.168` / `54.245.1.154` |
| Host called | `valentinavelez.com` |
| Webhook subscriptions | **EMPTY** in the Square dashboard (ruling 117) |
| Second endpoint | `/api/webhooks/square` exists in code and receives **zero** requests |

An unsubscribed callback is an **unbuilt** integration, not a buggy one (ruling 117).
Neither endpoint is to be deleted or merged unilaterally — money.

---

## 3. NOT YET ENUMERATED — dashboards still outstanding

Listed so their absence is a known gap rather than an assumption of absence
(ruling 118: a thing's absence is a finding of the same weight as its presence).

- **AssemblyAI** — transcription. Dashboard not yet read.
- **Recording provider** — dashboard not yet read.
- **Resend (inbound)** — outbound identity is proven by arrival (A4); inbound routing
  has not been enumerated. Note there are **two separate Resend accounts** (Jacob).
- **Zoom** — `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` are configured;
  no dashboard confirmation recorded.
- **Anthropic API** — `ANTHROPIC_API_KEY` is configured for the reading pipeline.
- **Web Push (VAPID)** — self-hosted keys, no third-party dashboard.

No secret value belongs in this file. Variable **names** only.
