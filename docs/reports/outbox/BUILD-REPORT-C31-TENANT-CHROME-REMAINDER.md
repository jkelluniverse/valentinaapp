# BUILD REPORT — C31-TENANT-CHROME-REMAINDER (2026-09-15)

**Status: COMPLETE.** The demo's happy path no longer ends on another practitioner's
brand: a provisioned practice's /book — header, footer, tab title, metadata — and its
signed-in portal tab are the PRACTICE's, with **ZERO** "veritas"/"valentina" anywhere
visible (head included). The C30 quarantine pins are **RETIRED, not lowered** — every
identity assertion on the practice's surfaces is now exact-zero. The default tenant is
**byte-identical throughout**: event-chrome 17/17 against the f07a035 fixture (raw
cannot-hide counts included) and the 16-screen baseline MATCH. Copy untouched.

## What shipped (chrome only, per ruling 54)

- **Root layout tab identity resolves per tenant** (`app/layout.tsx` metadata →
  `generateMetadata`): title/application-name/apple-web-app-title from
  `branding.portalTitle` — the default's "veritas" capitalizes to the exact "Veritas"
  the layout always emitted; a practice's tab says the practice; `unresolved` carries
  NO identity (C29's principle — description/manifest/icons, generic, merge through).
- **The public layout's metadata resolves per tenant** (`app/(public)/layout.tsx`):
  HER metadata (name — credential title, og/twitter/canonical to valentinavelez.com)
  renders only where the request resolves her tenant; a practice gets its own title +
  template (`%s · <practice>`) and robots — **no og/twitter/canonical is invented for
  a practice** (that content is brand-web's to design). The resolved template
  cascades: every public page's tab suffix is the practice's (thanks, welcome,
  confirmed included, for free).
- **The public chrome resolves per tenant** (`components/public/PublicChrome.tsx`):
  header and footer wordmark, aria-label, and the © line. The practice's name renders
  in the logo's EXISTING text-fallback style — no logo asset or design invented. Her
  credential line renders only for her. The identity arrives as a plain string prop
  from the layout, so `components/public` keeps zero data imports (the wall stands;
  `lint:wall` green in the sweep).
- **/book's description** (which names her) renders only for her; the page keeps the
  SAME title copy on every host, with the tab suffix resolved by the template.
- **Both portal layouts** (`app/practitioner/layout.tsx`, `app/space/layout.tsx`)
  gained `generateMetadata` reusing C29's `tenantAuthMetadata` + their existing
  noindex — the tab a founding practitioner reads inside their own portal is now
  their practice's (C30 finding 1 closed; ruling 53's gap).

## The five assumptions

**A1 CONFIRMED** — the same expression the portal shells and C29's auth metadata use
(`(branding ?? {}).portalTitle || "veritas"`, capitalized; `displayName` for public
chrome) resolves everything; chrome change only, zero copy edits (diff is metadata,
chrome components, and the two portal-layout metadata functions).

**A2 CONFIRMED** — default byte-identical: event-chrome **17/17** (the four auth
screens, "/", and /book byte-identical to the pinned f07a035 fixture; the RULING-44
raw-count companion green with only the one ratified /login delta) and the 16-screen
baseline **MATCH, all 16** (captured pre-change this session per ruling 11; committed
`docs/baseline/` restored from git before commit).

**A3 CONFIRMED WITH EVIDENCE, not reasoning** — the complete pre/post build route
tables were extracted and diffed: **IDENTICAL** ("ROUTE TABLE IDENTICAL — zero
rendering-mode changes"). `/` stays ○ static at the same 375 B; /book, /join,
/signup, /privacy were ALREADY dynamic before C31 (the public layout has resolved the
tenant per-request since C26 — C31 added no new dynamic API usage that wasn't
already in the tree).

**A4 RE-DERIVED, counts confirmed** — the C30 gate's own failing-then-passing runs
re-measured them: /book 8 head + 6 body "valentina", 2 head "veritas", portal 3 head
"veritas". After C31 every one reads 0 (quoted in the gate notes:
"valentina=0, veritas=0 (visible incl. head)").

**A5 CONFIRMED — no copy changed.** Named leftovers that are CONTENT, not chrome,
left and reported: /book/confirmed's body sentence "Valentina looks forward to
speaking with you" and the AddToCalendar/ICS event title "Discovery call · Valentina
Vélez" (calendar-event content — not in ruling 54's chrome list); /book's static
intro copy remains her voice on every host (the copy half of F2, brand-web's per
ruling 54). The /book page's "free discovery call" title text is likewise copy,
untouched — only its tab SUFFIX resolves.

## Verification

- **V1** — above, each with evidence.
- **V2** — event-chrome **17/17** (default byte-identical on /book, "/", and the four
  auth pages; the portal shell's default tab strings are the same "Veritas" bytes the
  root always emitted, proven by the byte-identical /login fixture comparison plus
  the baseline).
- **V3** — 16-screen baseline **MATCH — her portal is unchanged**.
- **V4** — demo-path re-run **34/34** with the pins REMOVED: tenant B's /book and
  portal show ZERO veritas/valentina occurrences, head and body, both legs, and the
  tab titles carry the practice ("title suffix present: true").
- **V5** — demonstrated able to fail: the header resolution was reverted
  (`practice={null}`), rebuilt, run, restored, rebuilt:
  > ✗ EN — …/book is the PRACTICE's page … — valentina=4, veritas=0 (visible incl. head)
  > ✗ ES — …/book is the PRACTICE's page … — valentina=4, veritas=0 (visible incl. head)
  > 32/34 checks passed · DEMO-PATH VERIFY FAILED
  Restored: **34/34 · DEMO-PATH VERIFY PASS**.
- **V6** — full standing sweep in the merge commit: 35 entries (count unchanged from
  C30 — no gate added; C31 changed product chrome and retired pins inside demo-path),
  stamp-audit LAST, exit 0.
- **V7 (the entity-footer verify item)** — C31 does NOT touch platform mail chrome,
  so per the item's own wording it TRANSFERS to the next build that does. The honest
  limit stands: local gates inject test entities by design; the verbatim
  "Kell Systems Consulting, LLC" footer assertion needs an environment where the real
  value is set.

## Engineering notes (disclosed)

- **A build-environment trap found and named**: since C26, the (public) layout
  resolves the tenant AT BUILD TIME too — `npm run build` without a reachable
  DATABASE_URL bakes the static "/" as an UNRESOLVED redirect to /unavailable
  (found when a DB-less build turned event-chrome red: "/" veritas 6→0/valentina
  35→0 — the cannot-hide check catching a build artifact exactly as designed).
  Not new to C31 and not a code defect — the standing sweep always builds with the
  scratch DB — but recorded here because a Railway build without the DB would ship a
  dead marketing home. Railway runs migrations at release with DATABASE_URL present,
  so production builds resolve; flagged for awareness, no change made.
- **Ruling 52 applied to C31**: no new gate was added; demo-path (already port-check
  compliant) carries the retired-pin assertions.
- The V5 demo used the same pattern as C29/C30: temporary edit, quoted failure,
  restore, quoted green — `git diff` clean of the demo afterward.
