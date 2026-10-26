# BUILD REPORT — C32-MIDDLEWARE-ORIGIN (steps 1–3 complete; W6–W8 executed)

**Fixed and proven live.** A founding practitioner who types their own subdomain now
lands on their own booking page. `GET https://psf-rehearsal.psychefolio.com/` →
`HTTP/2 307` → `location: https://psf-rehearsal.psychefolio.com/book` → 200,
`<title>Book a free discovery call · PSF Rehearsal Studio</title>`, 16 "PSF
Rehearsal", **zero** "valentina". Deployed b5f66a0, production deploy e5570c00
SUCCESS 2026-09-16 23:00:36Z, staging 55cffadc SUCCESS 23:00:50Z.

## The fix (one expression, exactly as ratified)

middleware.ts: the self-fetch target changed from `req.nextUrl.origin` to
`http://127.0.0.1:${process.env.PORT || "3000"}`. Everything else — the 60s
kindCache, ruling-77 logging on every branch, C26 pass-through-on-failure, the
publicOrigin() redirect Location — is byte-unchanged from step 1.

## Verify items

- **V1 (A1–A4 answered with observed evidence).**
  A1 DISPROVED (ruling 79): the fetch does not fail — step 1's live log showed it
  succeeding against `target=https://valentinavelez.com`; the fetch crossed
  Railway's edge, which overwrote the hand-set x-forwarded-host, so tenant-kind
  truthfully answered about the default host. A2: options were stated, loopback
  recommended and RATIFIED. A3: asserted — see V4/V10. A4 CONFIRMED: only the root
  hop was broken; /book on the minted host was already tenant-correct in W5 and is
  again quoted above.
- **V2 (the actual error quoted).** There was no thrown error — that is the
  finding. The observed mechanism line (step 1, production):
  `[middleware] tenant-kind host=psf-rehearsal.psychefolio.com target=https://valentinavelez.com kind=tenant isDefault=true redirect=false`
- **V3 / V12 (the one that matters).** Quoted at the top, against the standing
  psf-rehearsal tenant. GREEN.
- **V4 (default byte-identical + 16-screen baseline).** event-chrome 17/17 in the
  sweep (baseline MATCH); her hosts short-circuit at the same guard line as before —
  the changed line is below it.
- **V5 (C26 green).** fail-closed-tenancy 18/18.
- **V6 (standing set).** Full 36-entry sweep green, all entries enumerated,
  stamp-audit LAST, exit 0.
- **V7 (the new log line).** Production, first root hit after deploy:
  `[middleware] tenant-kind host=psf-rehearsal.psychefolio.com target=http://127.0.0.1:8080 kind=tenant isDefault=false redirect=true`
  — loopback target, the visitor's host, and kind/isDefault match the direct answer
  (`GET /api/tenant-kind` on that host → `{"kind":"tenant","isDefault":false}`).
- **V8 (PORT confirmed, not assumed).** Production PORT is **8080**, read from the
  live log line's target. The `|| "3000"` fallback applies only when PORT is absent
  — 3000 is `next start`'s own default port in exactly that case. Every gate that
  can reach the self-fetch sets PORT in the spawned server's env (verified for all
  16 server-spawning gates; the ones that don't set it never request `/`, and most
  never set PLATFORM_DOMAIN, so the guard short-circuits before any fetch).
- **V9 (failure path unchanged).** The catch still logs name+message and returns
  false — pass through, never redirect-on-uncertainty. The diff touches only the
  target expression and comments; event-chrome's DB-failure server generation
  exercises pass-through in the sweep.
- **V10 (default tenant live).** valentinavelez.com root `HTTP/2 200`, her title,
  zero NEXT_REDIRECT digests, all seven surfaces 200 (/book /join /signup /privacy
  /login /api/health /api/tenant-kind). Same on staging. Before/after captures kept.
- **V11 (failing AND working demonstrated, both quoted).** The failing half was
  captured LIVE immediately before the merge, while production still served the
  pre-fix 59638d2: root `HTTP/2 200`, `<title>Rewrite Your Subconscious Mind,
  Transform Your Life.</title>`, 35 raw "valentina", while `/api/tenant-kind` on
  the same host said `{"kind":"tenant","isDefault":false}`. The working half is
  V12. DEVIATION FROM THE LETTER, disclosed: no post-fix revert was deployed — the
  pre-fix production capture IS the reverted configuration (a revert deploy would
  have re-broken the live demo path to reproduce evidence already in hand).
- **Build order 3.** demo-path's root-hop assertion now carries the honesty
  annotation: it proves the full logic chain over real HTTP (now the same loopback
  code path production runs), and it CANNOT prove the deployment seam — PORT set
  live, the edge delivering x-forwarded-host, PLATFORM_DOMAIN present. Those only
  the ruling-48 live check proves; W5 was green in-gate for 19 days while
  production never fired the redirect.

## W6 — /book and /login on the minted host (GREEN)

/book: 200, tab `<title>Book a free discovery call · PSF Rehearsal Studio</title>`,
16 "PSF Rehearsal", zero "valentina" anywhere in the HTML. /login: 200, tab
`<title>PSF Rehearsal Studio</title>`, 8 "PSF Rehearsal", zero "valentina".
"veritas" appears exactly twice in each page's RAW HTML — both are the theme
bootstrap's localStorage key `veritas-theme` (an internal identifier inside a
script tag), zero visible occurrences, consistent with the gates' visible-text
assertions. Named, not hidden.

## W7 — founder sign-in → portal (GREEN, with one finding)

Credentials sign-in on psf-rehearsal.psychefolio.com (csrf → callback): the session
cookie was set host-only on the minted host, and `GET /practitioner` with it
returned 200, tab `<title>PSF Rehearsal Studio</title>`, 11 "PSF Rehearsal", zero
"valentina". The portal is theirs, page AND tab.

**FINDING (report, not fix): the sign-in callback's 302 Location was
`https://valentinavelez.com`** — bare, no path, no error param. Cause: production
sets `AUTH_URL`, and Auth.js v5 pins redirect resolution to it on every tenant
host. Real browsers are unaffected — the login form uses client-side
`signIn(..., {redirect:false})` + `router.push("/")`, staying on the founder's own
host (and the middleware's signed-in bounce builds from publicOrigin, proven
correct in V12's Location). Exposure is no-JS/raw-POST sign-ins only. Same defect
family as the email button below: a base URL pinned to the default tenant's domain.

## W8 — the welcome email, read from the founder's inbox (delivered; two findings)

One thread. Subject **"Your practice portal is live"**, from
**hello@valentinavelez.com** (no reply-to exposed in the connector's payload),
received 21:26:16Z (during W2), UNREAD until now.

1. **On-file prediction CONFIRMED:** the email's ONLY link — the "Open your
   portal" button — points at **https://valentinavelez.com** (getBaseUrl() = the
   signup request's host; code: `input.baseUrl ?? https://${portalHost}` — the
   passed baseUrl overrides the portal-host fallback that would have been right).
   The paragraph text carries psf-rehearsal.psychefolio.com as PLAIN TEXT, not a
   link. A founder who clicks the button lands on Valentina's marketing site.
2. **The entire email is Valentina's identity**: header "Valentina Vélez ✦
   Neuropsychology Specialist & Psych-K® Consultant", signoff "With warmth,
   Valentina", footer "Valentina Vélez · Veritas Consulting · Orlando, Florida".
   EXPECTED PER CODE, not a malfunction: sendEmail without an explicit identity
   resolves from the REQUEST scope's tenant, and signup ran on valentinavelez.com.
   The platform identity (PLATFORM_FROM_EMAIL, PLATFORM_LEGAL_ENTITY = Kell
   Systems Consulting, LLC, etc.) exists in production env but this path never
   chooses it. Design gap for the Architect's priority call — same request-scope
   mechanics as the W1 audit-stamp, and arguably the signup welcome is a PLATFORM
   send. Nothing fixed.

## AuditEvent 0→6 (Block 1.5 — gates the teardown)

P-B was WRONG, corrected not smoothed: the walk writes TWO audit rows, not one —
the missed row is W1's `prospect-capture` (scoped client → stamped with the
REQUEST's tenant, i.e. VALENTINA's, by design). The remaining 4 are not
attributable from code; the two read-only queries for Jacob's Query tab are in
REHEARSAL-RUNBOOK.md §Block 1.5 (attribution by tenant slug + actor-as-user +
actor-as-prospect, and a rehearsal-caused flag per row). Block 2 is CORRECTED in
place: one added DELETE keyed to the rehearsal prospect ids (before the prospect
delete), because as written it provably left the capture row behind and Block 3
could not return to baseline. Final expected DELETE counts re-issue after Block
1.5's output; any organic rows STAY.

## State

psf-rehearsal STANDS (V12 passed against it — its purpose is served; teardown
awaits the Architect's Block 2 dispatch after Block 1.5). Deploy branch = wip =
b5f66a0, both environments serving it. Holding for the Architect.
