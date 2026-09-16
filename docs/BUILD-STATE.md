# PSYCHEFOLIO BUILD STATE

## Active track: (none — C24.1-TENANT-SCOPE built and reported 2026-09-05, awaiting Architect
## review; C23-ENGAGE accepted by the Architect 2026-09-05.
## ALL FOUR C23 EVENT SURFACES ARE BUILT AND VERIFIED: signup 37/37 · capture 59/59 ·
## referral 68/68 · engage 172/172. Remaining work before Sept 23 is deployment + Jacob's
## decisions, not features — see "Before the event (Jacob)" below.
## THE TENANCY WALL: task #75 is CLOSED (withTenantScope landed; stamp audit exit 0 after a
## 23-gate sweep). C25 CLOSED 2026-09-11: non-default tenants can now write PracticeSettings
## (migration 49 must be in the production deploy — see the Jacob deploy list).
## 2026-09-11 facts: Psychefolio USPTO mark APPROVED (ruling 22 unblocked, engage gate still
## CLOSED pending Jacob's sender decision); psychefolio.com/.app purchased.)

## Queue (dependency order):
-2. (Architect review) C27-EMAIL-IDENTITY Phase 1 — BUILT 2026-09-12, dispatched by Jacob as
   Phase 1 only. Report in docs/reports/outbox/BUILD-REPORT-C27-EMAIL-IDENTITY-P1.md; five
   decisions for ratification; THREE footer blanks await the decision memo (see Jacob's env
   list below). **Phase 2 (per-practice identity) NOT BUILT — next dispatch candidate; spec
   says before any founding practitioner invites a client.**
-3. (Architect review) C26-FAIL-CLOSED-TENANCY — BUILT 2026-09-12 same day as its dispatch
   (ruling 39 item 1). Report in outbox; gate 18/18 standing; task #81 closed.
   **NEXT DISPATCH (ruling 39): C27 Phase 2** (per-practice identity, freeze deadline Sept 18);
   then C28-TENANT-CONSOLE (demoted, only if green by Sept 19).
-1.5. (in inbox, NOT dispatched) C28-TENANT-CONSOLE — demoted per ruling 39, builds only if
   green by Sept 19 (ruling 40 freeze).
-1. ~~(Architect review) C25-PRACTICE-SETTING-TENANCY~~ — **REVIEWED AND CLOSED 2026-09-11
   (rulings 33–35 below): all three flagged decisions RATIFIED.** Report in
   docs/reports/outbox/BUILD-REPORT-C25-PRACTICE-SETTING-TENANCY.md. One follow-up ticket
   filed from the review: task #81 (public-surface writes under failed tenant resolution —
   an untested hypothesis to REPRODUCE before any code changes; see Blocked list).
   Migration 49 is deployed in both environments.
0. (Architect review) C24.1-TENANT-SCOPE — report in docs/reports/outbox/BUILD-REPORT-C24.1-TENANT-SCOPE.md.
   Status PARTIAL. Ruling 24 implemented and gated (`withTenantScope`, tenant-scope-verify 48/48;
   stamp audit exit 0 after a 23-gate sweep). **Assumption 3 was FALSE:** `audits/amd06/verify.ts`
   was a SECOND live producer (+8 null rows / 5 tables per run), missed because it is in no
   regression list — found, wrapped, verified. Two ARCHITECT-REQUESTs open: the three
   `audits/c12x-ai-pass/run*.ts` scripts (same shape, unrunnable — task #80), and a PRE-EXISTING
   tenancy defect this build discovered: no non-default tenant can write a `PracticeSetting`.
   Task #75 recommended CLOSED (ruling 27's stated condition is met).
1. (Architect review) C24-NESTED-STAMP — report in docs/reports/outbox/BUILD-REPORT-C24-NESTED-STAMP.md.
   Status PARTIAL. **The spec's central diagnosis was FALSE** (ruling 12/18 pattern, third time):
   the null-tenant rows were never nested relation writes — they are the scoped client's
   deliberate OUT-OF-REQUEST passthrough, exercised by CLI gate harnesses. One ARCHITECT-REQUEST
   is blocking a clean close of task #75 for every gate rather than for the swept ones.
2. (Architect review) C23-ENGAGE — report in docs/reports/outbox/BUILD-REPORT-C23-ENGAGE.md;
   8 items for ratification, incl. a spec assertion that was false (see below).
3. (awaiting spec / Architect) whatever follows the four event surfaces. Standing candidates
   already filed under Blocked: PUBLIC-I18N, C19 pipeline Phase 3+, PLATFORM Phase 6.
4. (INTAKE 2026-09-08, awaiting Architect spec) **PSYCHEFOLIO-BRAND-WEB** — the
   Psychefolio-branded website. Jacob delivered the brand system v1.1; assets are SAVED
   (`/BRAND_HANDOFF.md` root, logo files in `/public/brand/`, eight reference renderings in
   `/docs/brand/renderings/`). Intake note with manifest, hard constraints, dependencies and
   suggested spec cuts: `docs/specs/inbox/PSYCHEFOLIO-BRAND-WEB.md`. HARD LAW from Jacob:
   **tenant #1's Veritas/Warm Stone design schemes are untouched** — this track brands the
   PLATFORM'S surfaces, never hers. Sequencing: C25 outranks it (and the white-label
   "powered by" whisper setting genuinely depends on C25's PracticeSetting fix — landed
   2026-09-11, so that dependency is now met); the Psychefolio USPTO mark is APPROVED
   (2026-09-11), so the ruling-22 objection to putting the mark on a public page is lifted.
   NOT tied to Sept 23.

## Built & verified: (list as completed)
- C31-TENANT-CHROME-REMAINDER — the demo's happy path no longer ends on another
  practitioner's brand (2026-09-15, dispatched in the C30 in-flight review; ruling 54's
  chrome half): root-layout tab identity, the public layout's metadata + title
  template, the public header/footer wordmark/©, /book's her-naming description, and
  BOTH portal layouts' tab metadata now resolve per tenant — a provisioned practice's
  /book and signed-in portal read ZERO "veritas"/"valentina" (head and body; C30's
  quarantine pins RETIRED to exact-zero, not lowered), while the default tenant is
  BYTE-IDENTICAL (event-chrome 17/17 vs f07a035 incl. raw counts; 16-screen baseline
  MATCH; route table diffed pre/post: IDENTICAL — zero rendering-mode changes, A3).
  Chrome only — copy untouched (named leftovers: /book/confirmed's sentence + ICS
  event title, /book's static intro — content, brand-web's). Demonstrated failing
  (header resolution reverted → demo-path 32/34, valentina=4; restored → 34/34).
  Report: docs/reports/outbox/BUILD-REPORT-C31-TENANT-CHROME-REMAINDER.md (incl. a
  named build-environment trap: a DB-less `npm run build` bakes "/" as the unresolved
  redirect — the sweep and Railway both build with the DB present).
- C30-DEMO-PATH — the path Jacob walks on Sept 23, as one gate (2026-09-15, dispatched
  in the C29 review, ruling 49): `audits/demo-path-verify.ts` **34/34** — the full
  event path over plain HTTP with JS disabled (multipart posts of the SSR forms'
  $ACTION_ID fields; no browser, no vendor call): /join → thanks screen's DISPLAYED
  code → /signup?ref → provisioned practice (ACTIVE + FOUNDING_COMP|NULL|NULL +
  journey-v1 + warm-clay + the three standard modules) → the practice's own host
  serving ITS identity (login wordmark+title, root 307→/book, empty state, signed-in
  portal). EN and ES legs (catalog-asserted); law 2 body-scoped scan (scope disclosed);
  law 10 asserted MECHANICALLY (credentials stripped + a local Resend sink counted 0
  hits); no null-tenant rows; idempotent (run twice, zero residue); demonstrated
  failing on a corrupted ref code (quoted in the report). A2 byte-equal CONFIRMED;
  A4 corrected (EIGHT chromium-path files, not six). **TWO FINDINGS reported, not
  fixed: (1) NEW — the signed-in practitioner portal's tab metadata says "Veritas"
  (root layout; C29 scoped its fix to the four auth screens) — awaiting dispatch;
  (2) the F2 remainder quantified — a new practice's /book is dressed as Valentina's
  site (her header+footer logo/name in the body 6×, her head metadata 8×, "free
  discovery call" title).** Both pinned by exact count in the gate so a NEW leak
  still fails. Standing set 34→35 (named); the set now has a committed definition,
  scripts/regress.sh. Report: docs/reports/outbox/BUILD-REPORT-C30-DEMO-PATH.md
  (two decisions for ratification: the two-slug fixture deviation — C26's ratified
  stale-resolution cache makes a single reused slug read leg 1's identity — and the
  committed runner).
- C29-EVENT-CHROME — a founding practitioner never sees someone else's brand
  (built 2026-09-14, dispatched same day on the escalated F2 finding; the merge was
  HELD when the final sweep went red on gate-hygiene, and completed 2026-09-15 under
  the C29 completion dispatch — ahead of the Sept 18 freeze; this entry originally
  claimed the merge a day early, corrected per R2/ruling 42's honesty standard):
  the four auth screens resolve wordmark AND tab metadata from the
  request's tenant (`components/AuthWordmark.tsx`, `lib/auth-metadata.ts`) — the default
  tenant renders BYTE-IDENTICAL (fixture pinned at `f07a035`, 15/15, plus the 16-screen
  screenshot baseline matching pre/post within-session per ruling 11, committed reference
  untouched); under C26's `unresolved` the brand line renders NOTHING (no fallback
  wordmark — the hole stays closed). A non-default tenant's public root 307s to its own
  /book via middleware + `/api/tenant-kind` (default slug zero-cost short-circuit;
  unknown slug unchanged; failures pass through). A5 answered-and-fixed: /book's empty
  state named Valentina on every host — now names the visiting practice, default copy
  byte-unchanged. LEFT deliberately (brand-web scope, documented): the platform apex's
  chrome, /book's static Valentina copy on foreign hosts, /login's EN-only convention.
  `audits/event-chrome-verify.ts` **17/17** (15 at build; +2 under the completion
  dispatch: /book byte-identity from an honest worktree capture of f07a035 per ruling 45,
  and the ruling-44 cannot-hide raw-count check, demonstrated failing by injection —
  one NAMED delta `/login veritas 9→10`, the wordmark's RSC flight-payload serialization,
  awaiting ratification); gate-hygiene exceptions 1→2 (event-chrome's capture-mode
  provenance label, comparison pinned to f07a035). MERGED 2026-09-15 (af315f4) after a
  full 34-entry green sweep, stamp-audit exit 0 last; both sites confirmed healthy on
  the new build (/api/tenant-kind live). Report:
  docs/reports/outbox/BUILD-REPORT-C29-EVENT-CHROME.md (five build decisions + the
  named delta for ratification, incl. two extra chrome surfaces the spec missed — tab
  metadata and the empty-state copy — both fixed with byte-identity held; R2 correction
  at top, COMPLETION ADDENDUM at end).
- C27-EMAIL-IDENTITY **Phase 2** — every practice's client hears from THAT practice
  (2026-09-14, dispatched with freeze deadline Sept 18; + F1 hardening): `sendEmail` with no
  explicit identity now RESOLVES the sender from the current scope's tenant, fresh per send —
  default tenant = the pre-C27 path byte-identical (item-3 fixture still green); a non-default
  practice sends as ITSELF (`emails/practice-envelope.ts`: its display name, its reply-to =
  per-practice `practiceEmail` setting, its footer = name · postal, platform sending domain +
  platform account key, no per-practice DKIM); an UNCONFIGURED practice sends as NO ONE
  (honest skip, logged — never a borrowed identity). Global `PRACTICE_EMAIL` retired:
  lib/agreements fills "[practice email address]" from the per-practice setting, env fallback
  reachable only for the default tenant. `/practitioner/settings` gains the Practice-contact
  section (email + postal, EN/ES, `practiceContact.*` catalog keys). **F1:** `RESEND_API_URL`
  is now IGNORED whenever `RAILWAY_ENVIRONMENT_NAME=production` — a stray override can never
  redirect credentialed mail (gate-asserted). `audits/email-identity-verify.ts` **28/28**
  (items 4/5/6 asserted at the wire incl. the A→B→A no-crossing run; item 3 byte-identity
  fixture unchanged at `8a3f960`); settings-i18n **10/10** (new keys carried in a named
  NEW_SINCE_PASS list — the pre-pass historical claim untouched). Report:
  docs/reports/outbox/BUILD-REPORT-C27-EMAIL-IDENTITY-P2.md.
- C26-FAIL-CLOSED-TENANCY — a host that cannot be resolved is not Valentina's (2026-09-12,
  dispatched by the Architect as the program's next-now item, ruling 39): discriminated
  resolution (`tenantBySlugChecked` → `resolveTenant`: tenant / unknown-slug / unresolved),
  `getTenant()` keeps never-throw but returns a NEUTRAL practice-less shell on unresolved
  (never Valentina's identity), the DATA LAYER refuses (`TenantUnresolvedError` in
  lib/prisma.ts — no scoped read/write proceeds under unresolved, every model, no call site
  involved), a neutral bilingual 503 (`/unavailable`, Retry-After 10, names no practice), and
  the layer-3 literal preserved ONLY for its fresh-database purpose. Unknown-slug behaviour
  unchanged; default slug short-circuits so Valentina's hosts cannot be affected.
  `audits/fail-closed-tenancy-verify.ts` **18/18** — PROMOTED from the task-#81 repro,
  STANDING (fitness argued in the report): the reproduction now fails to reproduce (no rows
  in ANY tenant, zero transport-sink emails), recovery on the very next request, healthy
  control still books and stamps tenant B. Report:
  docs/reports/outbox/BUILD-REPORT-C26-FAIL-CLOSED-TENANCY.md (five decisions for
  ratification, incl. the static front door's byte-identity invariant and the RESEND_API_URL
  sink affordance). Task #81 CLOSED by this build.
- C27-EMAIL-IDENTITY **Phase 1 only** — the platform sending identity (2026-09-12):
  `emails/platform-envelope.ts` (second envelope; signs as the display name of
  `PLATFORM_FROM_EMAIL`, footer = `PLATFORM_LEGAL_ENTITY · PLATFORM_POSTAL_ADDRESS`
  verbatim, no practice letterhead/credential/wordmark), `sendEmail` gains an explicit
  `identity` (no identity → byte-identical pre-C27 behaviour), engage gates on
  `platformEmailConfigured()` and every engage send carries the platform identity
  (re-read at the send moment; fail-closed to UNCONFIGURED — falling back to
  Valentina is structurally unreachable). Built against the CORRECTED spec: the
  Architect's assumption-4 correction (2026-09-12, mid-build) means psychefolio.com
  is a SEPARATE Resend account, so the identity carries its own
  `PLATFORM_RESEND_API_KEY` and the wire's Authorization is per-identity — no
  cross-account borrowing in either direction, asserted behaviorally.
  `audits/email-identity-verify.ts` **22/22**
  incl. the BLOCKING byte-identity of the default practice's booking emails against
  the fixture pinned at commit `8a3f960` (ruling 35). ENGAGE GATE STILL CLOSED,
  asserted. **THREE FOOTER BLANKS AWAIT THE DECISION MEMO (Jacob/Architect):**
  `PLATFORM_FROM_EMAIL` (sender name + address on the verified platform domain),
  `PLATFORM_LEGAL_ENTITY`, `PLATFORM_POSTAL_ADDRESS` — plus the credential
  `PLATFORM_RESEND_API_KEY` (the psychefolio.com Resend account) — until all four
  are set in production, engage records UNCONFIGURED and nothing sends. **Phase 2 NOT BUILT**
  (per-practice identity — urgent-after-event, before any founding practitioner
  invites a client). Report: docs/reports/outbox/BUILD-REPORT-C27-EMAIL-IDENTITY-P1.md
  (five decisions for ratification).
- C25-PRACTICE-SETTING-TENANCY — the event-critical defect (ruling 32) CLOSED: DMMF-derived
  model identity in the fail-closed pre-check (`lib/tenancy/model-identity.ts`, fail-closed,
  79/79 scoped models covered), `PracticeSetting` re-keyed to `id` PK + UNIQUE (tenantId, key)
  via migration `49_practice_setting_tenancy` (counted, idempotent, reversible via
  `_PracticeSettingTenancy49`), `lib/practice-settings.ts` service (a write with no tenant in
  scope THROWS), all bare-`key` call sites converted (2026-09-11) —
  `audits/practice-setting-verify.ts` **47/47**; report in docs/reports/outbox/.
  Built across two sessions: handed off at 40/41 (see HANDOFF-C25.md), finished here.
  THE 41st CHECK'S ROOT CAUSE, proven live and fixed: `tenantBySlug` cached a DB ERROR as
  "no such tenant" for its 60s TTL, so one transient blip resolved an existing practice's
  host to the default tenant and locked its practitioner out at /login. Errors no longer
  enter the cache (stale-if-available, else per-request null); the check was NOT relaxed.
  Also: the gate's five "BEFORE" archaeology checks pinned to the pre-fix commit `a6c8bd8`
  instead of HEAD (they were unpassable once the fix was committed; no assertion changed).
  Engage kill-switch verified intact (172/172; gate still defaults CLOSED).
Seeded 2026-09-05 from the repo's verify logs (audits/*/VERIFY-LOG.md) so the
PM starts with the true ledger, not an empty one.
- C1–C15, UI-1..3, P-1..3, AMD-05/06 — core product through messaging (2026-06/07)
- C12X intelligence layer + C12r reading + C13-PACKAGES/POLICY/BILLING-2/DASH
- C14-REMARKABLE R.1–R.5 · C19-RECORDING REC.1–REC.5 scaffold (consent-first, RecordingProvider adapter)
- SESSION-PIPELINE Phases 1–2 (AssemblyAI transcription, vendor-copy deletion, DRAFT extraction inbox) — 2026-07-22
- ONBOARDING v1.1 incl. §6 discovery layer — 2026-08-04
- PLATFORM Phases 0–5 (tenancy, scoping, guard, ReadingProvider, tools, provisioning + demo tenants) — 2026-08
- BILLING B1–B4 (Square OAuth, checkout links + webhook ledger, Stripe tenant subscriptions, hardening) — 2026-08
- C20-AGREEMENTS G.1–G.4 (send/sign/seal/keep) — 2026-08-04
- C20 v3.1 attorney master installed verbatim as DRAFT + engine gaps (initials, key-terms freeze, Addenda P/R/M wiring) — 2026-08-05
- C21 DOCSIGN (uploads, one-off email sends, direct sign links, stored practitioner signature, docx→fillable conversion, upload preview) — 2026-08-06/12
- C21.4/.5 payment authorization (es, card-free v2) — 2026-08-12
- C22/.1/.2 paper signing experience, drawn-signature-required, action-first desk — 2026-08-12
- C23-SIGNUP — the public front door: `PractitionerProspect` + migration 45, chosen-password
  provisioning, `app/(public)/signup` (bilingual, Warm Stone), wall-allowed server action with
  reserved-slug + rate limits + full rollback, confirmation screen, footer reachability
  (2026-09-05) — `audits/signup/verify.ts` **37/37**; report in docs/reports/outbox/.
  DECISIONS IN FORCE: `PractitionerProspect` is platform-level (outside SCOPED_MODEL_SET, outside
  the null-tenant audit); signups are ACTIVE + FOUNDING_COMP + journey-v1/warm-clay + the three
  standard modules (body-graph, archetypal-keys, values-spiral); reserved-slug list lives in
  `lib/signup-config.ts` (95 entries + `demo-` prefix + every existing tenant slug); password
  floor 8 (house floor); public locale via `?lang=`.

- C23-CAPTURE — the event floor: `app/(public)/join` (+ `/join/thanks`) as a ZERO-client-component
  bilingual form that submits with JS disabled, wall-allowed server action reusing signup's
  honeypot + time-trap + per-IP/per-email caps, `lib/prospect-capture.ts` upsert-by-email service
  (never downgrades `SIGNED_UP`, first `?ref=` wins, `referralCode` never reissued),
  `/admin/prospects` list + counts + filters + email search + RFC-4180 CSV export, and a
  server-rendered inline-SVG printable event QR (`qrcode`) — all three admin surfaces gated on the
  existing `PLATFORM_ADMIN_EMAILS` allowlist with 404 for everyone else, no new role
  (2026-09-05) — `audits/capture/verify.ts` **59/59**; report in docs/reports/outbox/.
  DECISIONS TAKEN (pending Architect ratification, see report): `/signup` now honours `?src=` so
  the /join→/signup handoff is not lossy (3 lines, signup still 37/37); capture's `AuditEvent`
  uses `actorId = prospect.id` with `action = "prospect-capture"` and metadata-only meta;
  capture uses the SCOPED prisma client (prospect ledger is platform-level, audit row is
  tenant-stamped) so product code needed NO guard-prisma allowlist entry — only the harness;
  admin counts are scoped to the current filter; rate caps IP 12/h + email 5/h; `qrcode` is the
  only new dependency. `lib/prospect-capture.ts` is named that way because `lib/capture.ts` is the
  SESSION pipeline's service — untouched by this build.

- C23-REFERRAL — attribution and the reason to share: NO new model (migration `46_referral_index`
  is one index on `referredByCode`; counts are derived from `referredByCode` + `status` so there is
  no parallel ledger to disagree with), `lib/referral-config.ts` (pure) + `lib/referrals.ts`
  (scoped client, privacy by construction: the public resolver returns a BOOLEAN, the owner's list
  returns FIRST NAMES only), the resolve-gated "invited by a founding partner" line on `/join` and
  `/signup` (nothing at all when a code does not resolve), the NEW `/practitioner/referrals` route
  (own code, `mailto:`/`sms:` share, arrived/became-practices counts, founding-partner standing,
  honest zero state, bilingual) linked only from practitioner settings, and a top-referrers section
  on `/admin/prospects` (2026-09-05) — `audits/referral/verify.ts` **68/68**; report in
  docs/reports/outbox/. NO reward/credit/discount/commission mechanism exists and the money-language
  scanner is extended with `earn·reward·commission·bonus·discount·credit` + Spanish forms.
  DECISIONS TAKEN (pending Architect ratification, see report): (a) `lib/signup.ts` DID overwrite
  `referredByCode` on every visit carrying `?ref=` — first touch was not in fact immutable on that
  path; fixed, since Verify item 5 is unpassable otherwise; (b) a practitioner who was never a
  prospect (Valentina, demo tenants) gets an honest "no code on this account" state — no row
  invented, no code issued on a GET; (c) new-route locale = `User.locale` with `?lang=` as an
  explicit override (`resolvePortalLocale`); (d) the settings link row is hardcoded English,
  matching that page's existing convention (no catalog exists for it); (e) `capture.referredBy` /
  `signup.referredBy` are now unused, left in place rather than churning shipped copy; (f) top
  referrers is unfiltered (unlike the filter-scoped counts of ruling 10) and carries an owner-email
  column beyond §4's literal list. `audits/referral/VERIFY-LOG.md` deliberately not written (session
  instruction not to hand-author verify logs) — evidence is in the report.

- C23-ENGAGE — what happens after the room empties: migration `47_prospect_message`
  (`ProspectMessage` send ledger, UNIQUE (prospectId, sequenceKey, stepKey) as the claim +
  `PractitionerProspect.unsubscribedAt`/`locale`; platform-level like the prospect ledger, so
  product code needed NO guard-prisma entry), `lib/engage-config.ts` (pure: locales, closed
  merge-field set, switch keys, URL builders, derived HMAC unsubscribe token — no DB in its
  graph, so the public wall holds), `lib/engage-sequences.ts` (the two sequences as DATA:
  `event-lead` +0/+3/+10 anchored on capture, `founding-welcome` +0/+7 anchored on conversion),
  `lib/engage-templates.ts` + `messages/{en,es}/engage.json` (5 templates × 2 locales, mandatory
  text part, unsubscribe appended STRUCTURALLY so no template can lose it), `lib/engage.ts`
  (plan / tick / switches / unsubscribe / history / queue), engage as step 6f of the EXISTING
  `/api/jobs/tick` under the existing JOBS_SECRET (no second scheduler; `asOf=` and `only=engage`
  added as testability affordances behind that secret), `app/(public)/unsubscribe/[token]`
  (one click, no login, bilingual, idempotent, forged tokens never 500), and `/admin/prospects`
  extended with the per-prospect ledger, a due-now/upcoming queue, the gate+pause+transport state
  and a write-nothing dry-run (2026-09-05) — `audits/engage/verify.ts` **172/172**, run twice,
  self-cleaning, **PASSING WITH NO RESEND_API_KEY** (the gate asserts that absence first); report
  in docs/reports/outbox/. VERIFY-LOG.md is written BY the gate (ruling 17).
  THE LOAD-BEARING BEHAVIOUR: `SENT`/`SUPPRESSED` are terminal; `UNCONFIGURED`/`SKIPPED` are
  RE-CONSIDERABLE, so a tick with no credential records every due step and leaves it re-sendable —
  proven by flipping a configured transport on at the same `asOf` and watching the SAME 7 rows
  send with no eighth row. Suppression is checked BEFORE the gate, the pause and the transport, and
  the no-send is asserted at the transport boundary (injected transport), not just on the row.
  DECISIONS TAKEN (pending Architect ratification, see report): (a) the spec asserted "capture
  records what they used" as FACT and it was FALSE — `/join` discarded the `lang` it already had
  and no locale column existed; wired minimally at three call-sites (capture 59/59, signup 37/37
  still); (b) the switches are `PracticeSetting.engageEnabled` + `engagePaused` with
  `ENGAGE_ENABLED`/`ENGAGE_PAUSED` env overrides, pause beats gate, re-read on EVERY step, and the
  **gate defaults CLOSED** (an automated mailer must not start sending because code shipped —
  matches the `autoPayReminders` opt-in precedent); no toggle UI was invented, §5 asks only that
  the state be shown; (c) `emails/envelope.ts` gained ONE optional `unsubscribe: {label,url}`
  field rendering a real `<a>` (a plain-text URL in an HTML part is not a working one-click
  unsubscribe) — additive, transactional mail renders byte-identically; (d) `only=engage` +
  `asOf=` on the existing tick, `asOf` consumed ONLY by the engage step; (e) every message is
  signed "Valentina" with her practice footer because the house Envelope hardcodes it — flagged,
  not changed; (f) one-click unsubscribe is genuinely one click, so a link-prefetching mail
  scanner can trigger it — spec-compliant (§6 forbids a confirmation step) and it fails in the
  safe direction. NO open/click tracking or per-recipient telemetry of any kind (out of scope).

- C24-NESTED-STAMP — the tenant-stamping data layer, and the end of a permanently-red gate:
  `lib/tenancy/stamp.ts` (nested `create`/`createMany`/`connectOrCreate`/nested `upsert`/creates
  inside a nested `update` all inherit the request tenant at ANY depth, schema-driven single-pass
  walk, copy-on-write, +0.036 µs on a flat create), wired into BOTH write paths of `lib/prisma.ts`
  (`runOp` and the array-form `$transaction` builder), migration `48_stamp_null_tenants_nested`
  (all 79 scoped tables, platform tables deliberately absent, per-table + total RAISE NOTICE
  counts, idempotent, REVERSIBLE via `_TenantStampBackfill48`), and `audits/nested-stamp-verify.ts`
  **43/43** (self-cleaning, writes its own VERIFY-LOG.md per ruling 17, runs the request-path checks
  through the REAL scoped client inside a simulated request scope) — 2026-09-05; report in
  docs/reports/outbox/. `audits/tenant-stamp-audit.ts` **exits 0 after a full 19-gate sweep on a
  freshly-seeded DB** — the condition that had never held; `audits/platform/verify.ts` likewise.
  THE FINDING THAT MATTERS: **the spec's diagnosis was false.** Nested writes were a real but
  LATENT hole — the schema-driven scan proves this repo contains ZERO nested relation writes on
  scoped models, and `connectOrCreate` appears nowhere. The rows came from the scoped client's
  documented OUT-OF-REQUEST passthrough: a CLI script importing `@/lib/prisma` and creating a
  scoped row without stating a tenantId writes a null one. Two violators, found by per-gate
  attribution: `prisma/fixtures/c12x-verify.ts` (+11 rows / 6 tables per run — FIXED: states
  DEFAULT_TENANT_ID, and self-cleans on the way out) and `audits/remarkable-recording/verify.ts`
  (+`handwrittenNote: 1` and `appointment: 1`, i.e. EXACTLY the signature the spec quotes — NOT
  fixed; unrunnable here and editing a gate I cannot run to green is the wrong move). No product
  path leaks: product code always runs inside a request. Nothing in the audit was narrowed,
  excluded or softened; its non-zero exit was re-proved live with an injected row.
  DECISIONS TAKEN (pending Architect ratification, see report): (a) `tenantId: undefined` now
  counts as ABSENT and gets stamped (previously it slipped through as a null row); (b) an explicit
  `tenantId: null` is PRESERVED, on the never-overwrite-an-explicit-value rule — so a deliberate
  null stays audit-visible; (c) a DIFFERENT tenant's explicit id survives untouched and remains
  findable, so a real cross-tenant write stays VISIBLE rather than being silently normalised;
  (d) three audit files' "likely cause: a nested relation write" hints corrected to name the real
  mechanism (no check changed) — they would have sent the next reader down the same wrong path;
  (e) `docs/PRISMA-ALLOWLIST.md`'s stale "all 66" corrected to 79 and its known-limits section
  rewritten. NO product code needed a guard-prisma entry; the new harness does.
  ARCHITECT-REQUEST filed: the CLASS of bug is unfixed — recommends `withTenantScope(tenantId, fn)`
  (opt-in AsyncLocalStorage; no existing behaviour changes) over implicitly stamping out-of-request
  creates, which would trade a loud defect for a quiet one.

- C24.1-TENANT-SCOPE — the CLI seam closed, and the class with it: `lib/tenancy/tenant-scope.ts`
  (`withTenantScope(tenantId, fn)` + `ambientTenantId()`, AsyncLocalStorage) consulted by
  `lib/prisma.ts` ONLY in the `headers()` catch — so the REQUEST'S TENANT ALWAYS WINS (proved four
  ways round, reads included) and ABSENCE is still plain passthrough, unstamped and LOUD to the
  audit (no implicit default stamping anywhere — ruling 24's rejected option, kept rejected by a
  gate check that watches the audit exit non-zero). Adopted one line each in
  `prisma/fixtures/c12x-verify.ts` · **`audits/amd06/verify.ts`** · `audits/password-reset/verify.ts`
  · `scripts/smoke-writes.ts` · `audits/remarkable-recording/verify.ts`.
  `audits/tenant-scope-verify.ts` **48/48** (self-cleaning, writes its own VERIFY-LOG.md, runs the
  request-path checks through the REAL scoped client inside a simulated request scope) — 2026-09-05;
  report in docs/reports/outbox/. `audits/tenant-stamp-audit.ts` **exit 0 after a 23-gate sweep**;
  `audits/platform/verify.ts` ALL CHECKS PASS (79 tables).
  THE FINDING THAT MATTERS: **assumption 3 was FALSE.** `audits/amd06/verify.ts` was a SECOND live
  producer — `+8 null rows across 5 tables every run` (package 1, priceBook 1, charge 2,
  assistGrant 2, auditEvent 2) — invisible to C24 because it is in NO regression list, so no
  per-gate attribution ever ran it. Now wrapped and null-clean. A static scan in the new gate
  enumerates all 11 CLI files that write scoped rows through the scoped client and FAILS if a
  future one is neither wrapped nor named with a reason.
  `audits/remarkable-recording/verify.ts` is **NOT VERIFIED — vendor credential required**: it dies
  at R.2 on a 403 from ANTHROPIC (the handwriting transcription; AssemblyAI is needed later still),
  so the spec's "needs AssemblyAI" was imprecise. Diagnostic evidence only, stated as such: the two
  rows it creates before dying (`handwrittenNote`, `appointment`) are now STAMPED, and the audit
  reads 0 after a run where it used to read +2.
  ALSO BUILT (§4 housekeeping): task #79 — `audits/referral/verify.ts` writes its own VERIFY-LOG.md
  (68/68, log written by the gate); task #78 — `/practitioner/settings` i18n via
  `messages/{en,es}/practitionerSettings.json` (85 keys each) + `lib/practitioner-settings-copy.ts`,
  with `audits/settings-i18n-verify.ts` **10/10** proving all 85 English strings are byte-identical
  to `HEAD:app/practitioner/settings/page.tsx` (an i18n MOVE, not a copy rewrite) and both locales
  rendering; `STRUCTURE.md` brought current on C23/C24/C24.1 + `lib/tenancy/*` + migrations to 48 +
  the audits/scripts/messages/docs trees (ruling 6 discharged).
  DECISIONS TAKEN (pending Architect ratification, see report): (a) §2 adoption extended beyond the
  two known violators to `amd06` (a proven producer) and to `password-reset` + `smoke-writes` (CLI
  scoped writers that only stay clean because they self-delete) — all four verified by running them;
  (b) the three `audits/c12x-ai-pass/run*.ts` scripts were NOT edited (unrunnable; ruling 27) and are
  filed as task #80 with a recommendation to wrap them; (c) `prisma/fixtures/seed-staging.ts` and the
  multi-tenant platform harnesses are named exceptions in the gate rather than wrapped — an ambient
  scope would break the cross-tenant reads they exist to make; (d) one scanner exclusion in
  `audits/nested-stamp-verify.ts` widened from one acceptance harness to two (both write nested
  payloads deliberately as positive controls) — disclosed, and the product-code claim still runs
  over the other ~465 files.
  ARCHITECT-REQUEST filed on a PRE-EXISTING defect found by this build: the scoped client's
  fail-closed pre-check selects `{ id: true }`, and `PracticeSetting` is the one scoped model whose
  PK is `key` — so for ANY non-default tenant every `practiceSetting` upsert/update/delete throws a
  Prisma validation error, IN A REQUEST, across ~10 product paths. Fails in the safe direction, but
  practice #2 cannot save a practice setting. Not fixed here (not in the build order; wrong subsystem
  to touch unasked).

## Architect rulings — 2026-09-05 (C23-SIGNUP review, gates independently re-run: signup 37/37,
## c21 58/58, phase5 17/17, smoke + write smoke PASS, wall/guard/tsc clean, build clean)
1. **Public locale = `?lang=` + `Accept-Language` fallback + on-screen EN/ES toggle. RATIFIED
   as shipped.** Locale-prefixed public routes (`/es/...`) are a whole-public-tree decision with
   SEO and marketing-site consequences; they do not belong inside a signup build eighteen days
   from the event. Bilingual parity is satisfied — both catalogs ship and the gate proves both
   render. A future PUBLIC-I18N spec may migrate the whole public surface; until then `?lang=`
   is the sanctioned mechanism and new public copy follows it.
2. **`lib/signup.ts` + `audits/signup/verify.ts` allowlist entries RATIFIED.** Tenant-creation
   ingress is cross-tenant by nature: the request arrives on one tenant's host and creates rows
   belonging to a tenant that does not exist yet. A scoped client cannot perform the global
   `User.email` pre-check (email is platform-unique, so a scoped read misses another practice's
   owner and the duplicate surfaces as a mid-provision P2002 — the half-built practice the spec
   forbids), cannot roll back rows it does not own, and cannot write the new tenant's audit row.
   Structurally identical to the already-allowlisted `lib/payments/webhook.ts` and
   `lib/billing/lifecycle.ts`. Additions only; no rule weakened; both entries carry justifications
   in `docs/PRISMA-ALLOWLIST.md`.
3. **Password floor stays 8, matching `/must-change`. RATIFIED.** One floor in one constant beats
   two defensible numbers. Raising it is a product decision with real friction on a phone at an
   event; composition rules and breach-list checks are deliberately not invented here.
4. Signup screens stay `noindex` until Jacob launches publicly — a pre-launch acquisition surface
   should not be indexed by accident. One line to revert when he wants it found.
5. `messages/{locale}/{ns}.json` namespacing confirmed as the house convention; `branding.portalTitle
   = practiceName` confirmed (unset falls back to our internal "veritas" wordmark, which a
   practitioner must never see); the three standard modules confirmed as body-graph,
   archetypal-keys, values-spiral.
6. Deferred, deliberately: `STRUCTURE.md` is now slightly stale on the new routes/libs — folded
   into the next cycle rather than held against this build.
- Standing gates on every build: c21-verify 58/58 · v31-verify 32/32 · c20-verify 28/28 ·
  16-screen visual baseline · GET/write smokes · tenant-stamp audit · platform isolation verify

## Standing gate numbers added since (PM-maintained, not part of the rulings above):
   signup-verify 37/37 · capture-verify 59/59 · referral-verify 68/68 · engage-verify 172/172 ·
   platform/phase5-verify 17/17 · nested-stamp-verify 43/43 · tenant-scope-verify 48/48 ·
   settings-i18n-verify 10/10 (needs `npm run build`; drives the built app on :3131) ·
   amd06 ALL CHECKS PASS (now null-clean — it was a producer until C24.1) ·
   practice-setting-verify 47/47 (C25; needs `npm run build`; drives the built app on :3141) ·
   email-identity-verify 22/22 (C27 P1; no build or key needed; wire via mocked fetch) ·
   gate-hygiene-verify PASS (ruling 37 scanner; static, instant — no gate references a moving git ref) ·
   fail-closed-tenancy-verify 18/18 (C26; needs `npm run build`; drives the built app on :3152 with
   a failure-injection DB role; transport sink on :3153)
## Standing gate set, with numbers (C24-NESTED-STAMP §4 — the stamp audit is now a REAL gate:
## it exits 0 today and exits non-zero on any null-tenant row in any of the 79 scoped tables):
   tenant-stamp audit **exit 0 / no number — pass is "zero rows"** · nested-stamp-verify 43/43 ·
   platform/verify ALL CHECKS PASS · platform/phase2 16/16 · platform/phase3 11/11 ·
   platform/phase5 17/17 · c20 28/28 · v31 32/32 · c21 58/58 · c12x 23 passed ·
   signup 37/37 · capture 59/59 · referral 68/68 · engage 172/172 ·
   onboarding complete 16/16 · stage1 17/17 · update 7/7 · ui 10/10 · discovery 19/19 ·
   password-reset PASS · smoke + smoke:writes PASS · lint:wall / guard-prisma / tsc clean ·
   16-screen visual baseline (within-session differential only, ruling 11)

## Architect rulings — 2026-09-05 (C23-CAPTURE review, gates independently re-run: capture 59/59,
## signup 37/37, wall/guard/tsc clean, build clean; dependency delta is exactly qrcode + @types)
7. **`/signup` honouring `?src=` RATIFIED.** C23-CAPTURE §1 required the /join→/signup handoff to
   carry both `?ref=` and `?src=`; a handoff that drops the source is a lossy handoff, so the
   3-line change implements the spec rather than exceeding it. Signup gate held at 37/37.
8. **`actorId = prospect.id` with `action="prospect-capture"` RATIFIED.** `AuditEvent` requires an
   actor and a capture genuinely has no signed-in one. The prospect IS the actor — they submitted
   the form. A sentinel would be less true, and law #6 asks for attribution, not for a signed-in
   session. Metadata-only meta confirmed correct (no name/email/phone/note in the blob).
9. **Rate caps (IP 12/h, email 5/h) and field caps RATIFIED as shipped.** In-memory per-instance
   limiting is a known, disclosed limit inherited from the C18 booking limiter — accepted for the
   event. Filed below as task #77 rather than pretended away: behind multiple instances the
   effective cap multiplies by instance count.
10. **Admin counts scoped to the current filter RATIFIED** — the total is always shown alongside,
    so both questions ("how many did we get", "how many of these") are answerable.
11. **THE 16-SCREEN BASELINE — ruling: do NOT recapture from scratch data, and do not treat
    cross-environment byte equality as achievable.** The committed `docs/baseline/` is a reference
    captured against one dataset at one moment; the script's own header says a reseed invalidates it
    and the clock invalidates it (time-of-day greetings, relative-date copy). Reseeded rows get fresh
    ids and same-timestamp ties break by id. So all 15 screens differing in a freshly-seeded scratch
    DB is the expected reading, not evidence of drift — and committing scratch-captured screenshots
    would replace a meaningful production reference with a meaningless one, destroying the guard.
    **Protocol from here:** the baseline is a WITHIN-SESSION differential gate. Capture immediately
    after seeding and BEFORE touching code, hold the data still, then `--diff` after the build. Never
    commit a scratch-captured baseline; recapturing the committed reference happens only on Jacob's
    known-good environment, as a deliberate act. C23-SIGNUP and C23-CAPTURE touch no `/space` or
    `/login` surface, so client-visible chrome is unaffected either way.

## Architect rulings — 2026-09-05 (C23-REFERRAL review, gates independently re-run: referral 68/68,
## capture 59/59, signup 37/37, wall/guard/tsc clean, build clean; the signup.ts diff read line by line)
12. **The attribution fix is RATIFIED, and the spec was wrong — not the builder.** C23-REFERRAL §1
    asserted "first touch is immutable (already true)". That was true on the capture path and FALSE
    on the signup path: `lib/signup.ts` overwrote `referredByCode` on every visit carrying `?ref=`,
    so a prospect captured on partner A's code could be silently reattributed to partner B by the
    link they happened to click at signup. That is precisely the unsettleable referral dispute this
    spec's no-parallel-ledger design existed to prevent, and it would have shipped invisibly.
    **Recorded as an Architect error:** a spec that asserts an existing property as fact, rather than
    listing it as a property to verify, hands the builder a false premise. Future specs state such
    assumptions as Verify items. The builder was right to fix it and right to flag it.
13. **"No code on this account" for practitioners who were never prospects (Valentina, demo tenants)
    RATIFIED.** Issuing a code on a GET would let a page read invent a row — a write on a read is
    wrong however convenient the resulting UI. If founding codes for pre-existing practices are
    wanted later, that is a deliberate backfill script, not a side effect of opening a page.
14. **New-route locale = `User.locale` with `?lang=` override RATIFIED**, consistent with ruling 1.
15. **Top referrers stays unfiltered and keeps the owner-email column. RATIFIED** as a deliberate
    deviation from ruling 10: this is an admin-only view whose whole purpose is "who is carrying the
    network, and how do I reach them." Filter-scoping it would answer a question nobody asks there.
16. **Unused `capture.referredBy` / `signup.referredBy` catalog keys: keep.** Churning shipped copy
    to delete two dead strings is the worse trade. Folded into a later cleanup.
17. **`audits/referral/VERIFY-LOG.md` absence accepted, with a rule.** Verify logs are written BY the
    gate that produced them, or not at all — a hand-authored log is a claim, not evidence, and this
    program's ledger is worth exactly what its evidence is worth. Task #79 filed.

## Architect rulings — 2026-09-05 (C23-ENGAGE review, gates independently re-run: engage 172/172,
## referral 68/68, capture 59/59, signup 37/37, wall/guard/tsc clean, build clean, RESEND_API_KEY
## confirmed absent from the environment during the run)
18. **The locale wiring is RATIFIED — and the Architect made ruling 12's mistake again, in the very
    next spec.** C23-ENGAGE stated "capture records what they used" as established fact. It was not:
    `/join` discarded the `lang` it already had, and no `locale` column existed. That is precisely
    the false-premise failure ruling 12 was written to prevent, repeated one cycle later, which means
    the corrective was recorded and then not applied. **Systemic fix, binding on every future spec in
    this program: each spec carries an explicit "Assumptions to verify, not trust" section listing
    every claim it makes about existing behavior, and each of those claims becomes a Verify item.**
    An assumption stated as fact is an untested assertion wearing a fact's clothes; two in a row is a
    process defect, not bad luck.
19. **Engine switches RATIFIED exactly as built: the gate DEFAULTS CLOSED, pause beats gate, both
    re-read on every step, env overrides available.** A mailer that begins sending because code
    shipped is an incident; requiring a deliberate human act to open it is correct, and it matches
    the `autoPayReminders` opt-in precedent. Nothing will send until Jacob opens it.
20. **The no-credential seam RATIFIED, and it is the build's best property.** A keyless tick records
    `UNCONFIGURED` and leaves those exact rows re-sendable — proved by re-running the same `asOf`
    with a transport attached and watching the same 6 rows flip to `SENT` with no new rows created.
    That is the difference between a keyless tick being harmless and a keyless tick silently
    destroying the follow-up list by marking forty people as already contacted.
21. **One-click unsubscribe stays one click.** A link-prefetching mail scanner can trip it, which
    means someone occasionally gets unsubscribed without intending it. That fails in the safe
    direction; a confirmation step fails in the unsafe one, and §6 forbids it. Accepted knowingly.
22. **ESCALATED TO JACOB — sender identity. This one is not mine.** Every follow-up message is
    currently signed "Valentina" over the Veritas Consulting / VIIIV CORP footer, because the house
    Envelope hardcodes her practice identity. But these messages go to prospective *practitioners* —
    the platform's customers, not her clients. Sending software marketing under her practice's
    letterhead conflates two entities that the program otherwise keeps carefully separate, and it
    puts her professional identity behind a commercial pitch she has not agreed to make.
    **Architect recommendation:** a platform-identity sender for practitioner follow-up, with
    Valentina as a named voice *inside* the copy only if she consents to that use — she is the
    credible peer, and that credibility is the reason to ask her rather than to assume her. Note the
    constraint: §7 records the "Psychefolio" USPTO check (Classes 042 + 044) as OUTSTANDING, so the
    sender name should not assert that mark until clearance. **Nothing sends while the gate is
    closed, so this is not urgent — but it must be settled before Jacob opens it.**

## Architect rulings — 2026-09-05 (C24-NESTED-STAMP review. Gates independently re-run:
## nested-stamp 43/43 · c12x 23 passed · THE STAMP AUDIT EXIT 0 immediately after running the harness
## that used to inject 11 null rows · platform/verify ALL CHECKS PASS · phase2 16/16 · phase3 11/11 ·
## engage 172/172 · referral 68/68 · wall/guard/tsc clean · build clean)
23. **The Architect's diagnosis was WRONG, and the process fix worked.** C24 §"Assumptions" named
    nested relation writes as the hypothesis. Assumption 1 is FALSE: this repo contains **zero**
    nested relation writes on scoped models (schema-driven scan, 462 files × 43 relation fields), and
    `connectOrCreate` appears nowhere. The real mechanism is the scoped client's **out-of-request
    passthrough**: `lib/prisma.ts` resolves the tenant from `headers()`, which throws outside a
    request, yielding a null tenant and an unstamped write. The producers were two CLI gate harnesses
    — `prisma/fixtures/c12x-verify.ts` (+11 rows across 6 tables every run) and
    `audits/remarkable-recording/verify.ts` (the `handwrittenNote`/`appointment` pair the spec quoted
    as its symptom). **Note what changed:** rulings 12 and 18 were written after two specs asserted
    false premises as fact. This spec instead listed its premise as an assumption to test, and the
    builder disproved it with evidence in the first section of its report. That is the corrective
    working as designed — keep writing specs this way.
24. **ARCHITECT-REQUEST 1 — option 1 RATIFIED: `withTenantScope(tenantId, fn)`.** An opt-in
    AsyncLocalStorage scope the client consults only when `headers()` is unavailable. It changes no
    existing request behaviour, is one line per harness, fixes both known violators and every future
    one, and the mechanism is already proven (the new gate uses Next's version of it).
    **Option 2 — implicitly stamping out-of-request creates with the default tenant — is REJECTED,
    and the builder's reasoning for rejecting it is the right reasoning:** it would remove most of
    the audit's detection surface and would silently record a second practice's forgotten rows as
    Valentina's. That trades a loud defect for a quiet one, in the exact subsystem where quiet
    defects are catastrophic — this is the wall that becomes the cross-practice wall.
    **Option 3 — fixing only the remaining harness — is REJECTED**: it leaves the class open.
25. **Stamper semantics RATIFIED: `tenantId: undefined` counts as absent and gets stamped; explicit
    `tenantId: null` is preserved and stays audit-visible.** Both choices preserve detection rather
    than tidiness, which is the correct bias here. Likewise ratified: a nested payload carrying a
    DIFFERENT tenant's id is stored as-is, so a genuine cross-tenant write stays visible to the audit
    instead of being silently normalised. Verify item 5 exists to prove that was not "helpfully"
    fixed away, and it passes.
26. **`_TenantStampBackfill48` (the reversal table, outside `schema.prisma`) accepted.** It is
    harmless under `migrate deploy`, which is this program's only migration path. **Standing ops
    rule: never run `prisma migrate dev` against this repo** — it would read that table as drift.
27. **PARTIAL accepted as the honest status, and task #75 STAYS OPEN.** The audit is green here
    because the builder fixed the one violating harness it could run; `audits/remarkable-recording/
    verify.ts` still writes two null rows and could not be verified in this environment, so it was
    correctly left alone rather than blind-edited. A gate that cannot be run must not be edited on
    faith. #75 closes when `withTenantScope` lands and both harnesses use it.

## Architect rulings — 2026-09-05 (C24.1-TENANT-SCOPE review. Independently re-run: tenant-scope
## 48/48 · settings-i18n 10/10 · amd06 ALL CHECKS PASS (now null-clean) · nested-stamp 43/43 ·
## c12x 23 passed · STAMP AUDIT EXIT 0 after running both former producers · build clean.
## ARCHITECT-REQUEST 2 reproduced by the Architect directly — see ruling 32.)
28. **Assumption 3 was FALSE, and the reason is structural, not careless.** A second live producer
    existed: `audits/amd06/verify.ts`, +8 null rows across 5 tables every run. C24 missed it because
    **it is in no regression list** — so no per-gate attribution sweep ever ran it. The regression
    list silently defines the program's attribution surface, and anything outside that list is
    invisible to exactly the sweeps meant to find it. **Corrective, binding:** the standing gate set
    now includes every runnable gate, `amd06` included, and the new static scanner that enumerates
    all 11 CLI files writing scoped rows — failing when a future one appears in neither the wrapped
    nor the named list — is RATIFIED as the durable form of this fix. A scanner that fails on new
    unknowns is worth more than a list someone must remember to update.
29. **ARCHITECT-REQUEST 1 — option 1 RATIFIED: wrap all three `audits/c12x-ai-pass/run*.ts`.** The
    spec named one file; the correct unit is the class. Mark them `NOT VERIFIED — vendor credential
    required`, exactly as `remarkable-recording` was handled: a mechanical application of a proven
    pattern, honestly labelled, is different from a blind edit of an unverified gate (ruling 27).
30. **Task #75 is CLOSED.** Ruling 27's own condition is met: `withTenantScope` landed, both known
    harnesses adopted it, and the audit exits 0 after a 23-gate sweep. The residue is filed as
    **task #80** (the three `c12x-ai-pass` files, unrunnable here) rather than left to blur #75.
31. **Ratified as disclosed:** `withTenantScope` throws on an empty tenant rather than degrading to
    passthrough; `nested-stamp-verify`'s self-exclusion widening to a named two-file
    `PROBE_HARNESSES` list (both are acceptance harnesses that write nested payloads as positive
    controls, and the product-code claim still runs over the other ~465 files); adopting a
    non-default scope turns `upsert`-of-a-new-row into a fail-closed refusal on the CLI path, which
    is pre-existing request behaviour now merely reachable from the CLI.
32. **ARCHITECT-REQUEST 2 — CONFIRMED BY DIRECT REPRODUCTION, AND IT IS EVENT-CRITICAL. Fixing it
    is the program's new top priority (spec C25).** The Architect reproduced it independently:
    creating a non-default tenant and writing a `PracticeSetting` inside its scope fails at
    `lib/prisma.ts:139` in the fail-closed pre-check's `findFirst()`, because `PracticeSetting` is
    the one scoped model with no `id` column (its PK is `key`). **And the reproduction surfaced a
    second defect in the same model:** `PracticeSetting_pkey` is a UNIQUE index on `key` **globally**,
    so even with the pre-check fixed, two practices could never hold the same setting key.
    **Why this is event-critical rather than a multi-tenant-program concern:** C23-SIGNUP now creates
    ACTIVE non-default tenants, and it does so *self-serve, at the event*. Every founding practitioner
    who signs up on September 23 is a non-default tenant, `practiceSetting.upsert` appears in ~10
    product paths, and none of them can succeed for those practitioners. A practitioner who signs up
    in the room and then cannot save a setting is the demo failing in front of the exact audience it
    was built for. It fails safe (nothing crosses tenants), which is why it went unnoticed — the
    portal simply refuses. Direction: derive the pre-check's key from the DMMF rather than hardcoding
    `id`, and rescope the model's uniqueness to `(tenantId, key)` with a migration. Both get their
    own spec and their own gate, because this is the most security-critical line in the codebase and
    a founding practitioner's settings are the first thing they touch.

## Before the event (Jacob) — everything the four event surfaces need that engineering cannot do
Consolidated 2026-09-05 by the Architect. Nothing here is a feature gap; all four surfaces are built
and gated green. These are deploys, secrets, and decisions that are Jacob's by right.

**Deploy, in this order**
1. `prisma migrate deploy` — migrations `45_practitioner_prospect`, `46_referral_index`,
   `47_prospect_message`, `48_stamp_null_tenants_nested`, and **`49_practice_setting_tenancy`
   (C25 — schema change, must deploy in this order)**. The referral index is what keeps counts
   off a sequential scan; the ProspectMessage unique constraint is what makes double-sending
   structurally impossible; migration 49 re-keys `PracticeSetting` (adds `id` PK, rescopes
   uniqueness to `(tenantId, key)`, stamps null-tenant rows) — without it no event-signup
   practitioner can save a setting. It RAISE NOTICEs its counts; read them on the production
   run. Idempotent, reversible via `_PracticeSettingTenancy49`.
2. Deploy the branch. `npm run prebuild` runs the tenant-scope guard, so a scoping regression fails
   the deploy rather than reaching production.

**Env vars — each one has a real failure mode if missed**
- `PLATFORM_ADMIN_EMAILS` must contain Jacob's production address, or `/admin/prospects` 404s for him
  at the event. This is the page that answers "how many did we get."
- `PLATFORM_DOMAIN` must be set, or every signup / portal / unsubscribe link degrades to a relative
  path — which means broken links in the one email sequence that matters. **`psychefolio.com` and
  `psychefolio.app` are purchased (2026-09-11)** — candidates for this value; which one (and DNS)
  is Jacob's call.
- `RESEND_API_KEY` — until it exists, follow-up ticks record `UNCONFIGURED` (harmlessly, and
  re-sendably). No key means no follow-up, not a crash.
- ✅ **SET IN BOTH ENVIRONMENTS (Jacob, confirmed by variable name via the Railway API
  2026-09-14)** — so `platformEmailConfigured()` is TRUE in production and the engage gate is
  the only thing between the sequences and sending (it stays CLOSED until Jacob opens it).
  **`PLATFORM_LEGAL_ENTITY` = "Kell Systems Consulting, LLC"** (confirmed by Jacob
  2026-09-15, both environments — filled by the Architect's ledger-fill instruction; the
  Railway connector lists names only, values redacted, so this ledger line is the value of
  record. It is not a secret and it is the sender-memo ownership answer of record. NOTE:
  the ledger recording the value and the rendered platform email footer printing it are
  two different facts — a verbatim-footer verify item is queued on the next build that
  touches platform mail chrome, and it needs an environment where the real value is set,
  since local gates inject their own test entities by design.)
- **(C27 Phase 1, 2026-09-12) `PLATFORM_RESEND_API_KEY` + `PLATFORM_FROM_EMAIL` +
  `PLATFORM_LEGAL_ENTITY` + `PLATFORM_POSTAL_ADDRESS`** — the three decision-memo blanks plus
  the platform account's credential (assumption-4 correction: psychefolio.com is a SEPARATE
  Resend account; its domain is already verified — send.psychefolio.com SPF/MX, DKIM, DMARC
  p=none; Zoho runs the apex and NEVER add a second v=spf1 there). Follow-up mail now sends
  ONLY under this platform identity; until all four are set, engage records `UNCONFIGURED` —
  the practice `RESEND_API_KEY` neither suffices nor is ever borrowed. The from's display name
  is also the signature on every platform message. `PLATFORM_REPLY_TO` optional.
- `JOBS_SECRET` — already in use by C13-PACKAGES; the engage step rides the existing tick.

**Decisions only Jacob can make**
- **Sender identity for practitioner follow-up (ruling 22) — NOW UNBLOCKED (2026-09-11): the
  Psychefolio USPTO mark is APPROVED**, so a Psychefolio-identity sender is available. The
  question itself is still Jacob's: the follow-up mailer currently signs "Valentina" over the
  Veritas Consulting footer, and those messages go to the platform's prospective customers, not
  her clients. Architect's standing recommendation: a Psychefolio platform sender, with Valentina
  as a named voice inside the copy only by her consent. Must be settled BEFORE opening the engage
  gate — which still defaults CLOSED, so nothing sends until this is decided.
- **Opening the engage gate.** It defaults CLOSED by design. Read `/admin/prospects` → the queue and
  the dry-run first (the dry-run writes nothing), then set `engageEnabled="on"`. `engagePaused="on"`
  stops everything with no deploy.
- **Founding-partner offer copy** — the finished-portal-plus-referral-code position is ratified and
  built; no price appears anywhere and the money/reward-language scanner enforces it in both
  languages. If pricing gets ratified before the event, that is a new spec, not an edit.

**Physical / rehearsal, not code**
- Print-test the event QR (`/admin/prospects/qr`) on a real black-and-white printer at arm's length.
- Walk the whole path once on a phone on cellular, not office wifi: QR → `/join` → thanks screen with
  referral code → `/signup?ref=` → new portal on its own subdomain. `/join` has zero client components
  so it submits even with JS disabled, but nothing replaces walking it.
- Decide whether the signup screens come out of `noindex` (ruling 4) — one line, Jacob's timing.

## Blocked / awaiting Architect:
- ~~(code, NEW FINDING from C30) the signed-in practitioner PORTAL's tab metadata says
  "Veritas" on a non-default tenant~~ — **CLOSED by C31 2026-09-15** (both portal
  layouts generateMetadata via tenantAuthMetadata; demo-path asserts zero, pin
  retired).
- (code, open item against PUBLIC-I18N, from the C29 review's decision (d)) the `unresolved`
  tab title "Sign in" is EN-only — ratified AS A LOGGED DEVIATION from constitution law 7
  (bilingual parity), not as correct. It matches /login's pre-existing EN-only heading
  convention, a gap inherited rather than created by C29. Fix belongs to PUBLIC-I18N; do
  not fix piecemeal.
- (ops, BEFORE Sept 23) migration `47_prospect_message` must be deployed before the engage
  surfaces or the tick 500s on a missing table. Then, to turn follow-up ON in production:
  set `PracticeSetting.engageEnabled = "on"` (the gate is CLOSED by default). Read
  `/admin/prospects` queue + dry-run FIRST. To stop it: `PracticeSetting.engagePaused = "on"` —
  effective on the next step of the running tick, no deploy.
- (ops, BEFORE the first send) `PLATFORM_DOMAIN` must be set in production, or every signup /
  portal / unsubscribe link in every follow-up message degrades to `PUBLIC_APP_URL` and then to a
  RELATIVE path. A relative unsubscribe link is not a working unsubscribe link.
- (ops) `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL` are both required by `emailConfigured()`. Until
  both exist, every due step records `UNCONFIGURED` and stays re-sendable — nothing is lost, but
  nothing arrives either.
- (code, deferred) ~~`STRUCTURE.md` stale on `lib/engage*.ts`, `messages/*/engage.json`,
  `app/(public)/unsubscribe`, `audits/engage/`~~ — DONE in C24.1 §4 (ruling 6 discharged).
- (code, low priority) ~~task #79~~ — DONE in C24.1 §4: `audits/referral/verify.ts` writes its own
  VERIFY-LOG.md (verified by running it, 68/68).
- (code, low priority) ~~task #78~~ — DONE in C24.1 §4: `messages/{en,es}/practitionerSettings.json`
  + `lib/practitioner-settings-copy.ts`; all 85 English strings proven byte-identical to the
  pre-pass page (`audits/settings-i18n-verify.ts` 10/10).
- (ops, before Sept 23) migration `46_referral_index` must be deployed before the referral surfaces,
  or every referral count is a sequential scan.
- (code, deferred) ~~`STRUCTURE.md` stale on `/practitioner/referrals`,
  `lib/referral{s,-config,-copy}.ts`, `messages/*/referral.json`, `audits/referral/`~~ — DONE in
  C24.1 §4.
- (code, low priority) task #77 — capture/signup rate limiting is in-memory per instance; a shared
  store (or a single-instance guarantee) is needed before the caps mean anything under horizontal
  scale. Not event-blocking at expected volumes.
- (ops, before Sept 23) `PLATFORM_ADMIN_EMAILS` must contain Jacob's real address in production or
  `/admin/prospects` 404s for him. Print-test the event QR on a real black-and-white printer.
- (code, low priority) task #76 — `/admin/tenants/new` shares the latent flaw C23-SIGNUP works around:
  `provisionTenant()` called inside a request checks practitioner-email uniqueness only within
  the request's tenant scope, so a cross-tenant duplicate would surface as a mid-provision P2002.
  Reachable only by the PLATFORM_ADMIN_EMAILS allowlist. Signup itself is immune (global
  pre-check + rollback).
- (Jacob/counsel) v3.0 sections for the v3.1 master; Spanish legal translation; Ch. 490 blessing;
  PRACTICE_EMAIL env; Addendum P election default; Addendum R retention confirmation; then flip
  `client-services-agreement` DRAFT→ACTIVE (deliberate DB act, excluded from upload-confirm path)
- (Architect) C19 continuation spec — pipeline Phase 3+ / Pocket capture layer (adapter seam ready)
- (Jacob go-ahead, no spec needed) C22 phase 2 — uploaded-PDF render-and-fill (pdf.js + pdf-lib,
  drag-drop field placement, coordinate stamping)
- (Jacob acceptance) PLATFORM Phase 6 canvas-v1 — spec held; gated on acceptance of Phases 0–5
- (code) task #75 — **CLOSED 2026-09-05 by C24.1-TENANT-SCOPE, on ruling 27's own stated
  condition** ("#75 closes when `withTenantScope` lands and both harnesses use it"). The mechanism
  landed and is gated (tenant-scope-verify 48/48); all known producers are wrapped
  (`c12x-verify`, `amd06`, `remarkable-recording`) or named with a reason; the stamp audit exits 0
  after a 23-gate sweep and `platform/verify` passes. The one honest residue is NOT #75 and is
  filed separately as task #80: `audits/remarkable-recording/verify.ts` still cannot be RUN here
  (vendor credentials — it dies at R.2 on an Anthropic 403), so its wrap is a mechanical
  application of a proven pattern; diagnostically, the two rows it writes before dying are now
  stamped and the audit reads 0 after it.
- (code, low priority) task #80 — `audits/c12x-ai-pass/run.ts`, `run2-fixes.ts`, `run3-patch01.ts`
  write scoped rows through the scoped client from the CLI without stating a tenant, so they are
  the same shape as the two fixed producers. They need a REAL `ANTHROPIC_API_KEY`, so C24.1 could
  neither run nor edit them (ruling 27) and named them as UNRESOLVED in the new gate's scan — which
  fails if any NEW unwrapped CLI writer appears. ARCHITECT-REQUEST 1 recommends wrapping all three
  (3 lines).
- ~~(code, investigate-first) task #81~~ — **CLOSED 2026-09-12 by C26-FAIL-CLOSED-TENANCY**
  (gate 18/18: the reproduction fails to reproduce; the repro harness was PROMOTED into
  `audits/fail-closed-tenancy-verify.ts` and the old `t81-booking-tenant-repro.ts` filename is
  gone). History below kept as filed:
- (code, investigate-first) task #81 — filed from the C25 review, and the Architect flags it
  as an UNTESTED HYPOTHESIS, not a finding (rulings 12/18 discipline): `getTenant()` still
  resolves a failed lookup to the default tenant for that request
  (`tenantBySlug(slug) ?? tenantBySlug(DEFAULT_TENANT_SLUG)`). Authenticated surfaces are
  protected by the cross-tenant door in `lib/auth-guards.ts`; PUBLIC surfaces have no such
  check — and C18's booking action writes `Lead`/`Appointment`, which are tenant-scoped. The
  hypothesis: a client booking on practice B's public site during a request where resolution
  fails could land that lead in Valentina's practice — CORRECTLY STAMPED, so no audit would
  flag it. The ruling-33 cache fix shrinks the window from 60s to a single request (most of
  the risk). **REPRODUCED 2026-09-11, same day, 3/3 with a clean control**
  (`audits/t81-booking-tenant-repro.ts` — manual repro harness, NOT a standing gate): with
  SELECT on "Tenant" revoked from the server's DB role (deterministic "known host,
  resolution failed"), the REAL booking form on practice B's own host completed end-to-end
  and the Lead landed in `tnt_valentina_000000001`; the control run (healthy role, same host,
  same form) stamped tenant B. Two aggravations observed: B's /book page renders VALENTINA'S
  availability under the failure, and the booking notification goes to HER practice. The
  hypothesis is now a CONFIRMED defect awaiting an Architect spec on the open design
  question: distinguish "unknown slug, legitimately the default" from "known host,
  resolution failed" and fail closed on the second, at least for scoped writes on public
  surfaces. NO code changed (investigate-first discipline held). Not reachable before
  self-serve signup existed; it is now. **The spec exists: C26-FAIL-CLOSED-TENANCY in the
  inbox, awaiting dispatch. Live sighting 2026-09-12 strengthening its case: during a gate
  sweep right after a postgres restart, practice-setting-verify reproduced the Architect's
  original 41st-check symptom ONCE (practitioner B → /login; the ruling-33 fix keeps errors
  out of the cache, but a single-request resolution failure still resolves to the default
  tenant and the login is not retried), then passed 47/47 on a quiet re-run. Intermittent,
  environmental, and exactly the failure class C26 exists to close.**
- ~~(code, ARCHITECT-REQUEST, found by C24.1) the scoped client's fail-closed pre-check
  selects `{ id: true }` / `PracticeSetting` globally unique on `key`~~ — **CLOSED 2026-09-11
  by C25-PRACTICE-SETTING-TENANCY** (ruling 32's spec): DMMF-derived identity + migration 49.
  practice-setting-verify 47/47; report in outbox. Migration 49 added to the deploy list above.
- (ops, before the next deploy) migration `48_stamp_null_tenants_nested` — stamps any remaining
  null-tenant rows across all 79 scoped tables to the default tenant. Idempotent, reversible via
  `_TenantStampBackfill48`, and it RAISE NOTICEs its per-table and total counts. Read those counts
  on the production run: a large number is information about how long the harnesses have been
  running there. Note `_TenantStampBackfill48` is a real table outside `schema.prisma` — harmless
  under `migrate deploy` (the only command this repo uses), drift under `migrate dev`.
- (Jacob decision) Cloudflare R2 storage cutover (local driver live; config swap)

## Architect rulings — 2026-09-11 (C25-PRACTICE-SETTING-TENANCY review)
33. **The tenancy-cache fix RATIFIED.** Caching a failed query as "no such tenant" is the
    quiet-defect pattern: a transient blip becomes a minute of wrong answers with nothing
    logged as wrong. Serving the last known value on error, and never letting a failure
    enter the cache, is right.
34. **The commit pins (`a6c8bd8`, `939a663`) RATIFIED, and the proposed standing rule
    adopted in stronger form, binding on every gate in this program: a gate must NEVER
    reference a moving pointer (HEAD, a branch name) for a before/after claim.** `HEAD`
    means something different tomorrow, so the gate silently starts testing a different
    assertion than the one it was written to test — and it will usually still PASS, which
    is worse than failing. Pin the commit.
35. **The spec move to `accepted/` RATIFIED. C25 is closed.**

## Architect rulings — 2026-09-12 (post-C27 follow-up, applied same day)
36. **CHECKPOINT-BRANCH PROTOCOL, standing ops rule:** substantial in-flight work is pushed to
    a non-deploying checkpoint branch (`claude/<track>-wip`) AS THE BUILD GOES, so a session
    ending mid-sweep loses nothing (C25 survived only because its sandbox happened to). The
    auto-deploying branch still receives only gate-green merges — both rules hold, no tension.
37. **GATE HYGIENE gets a machine (ruling 28's pattern, authorized in the C27 follow-up and
    folded in):** `audits/gate-hygiene-verify.ts` fails when any gate references a MOVING git
    ref (HEAD/@{...}/origin/...) — pin a commit instead. Named-exception list with
    justifications (currently one: email-identity's provenance stamp in capture mode).
    Ruling 34 was recorded and then violated three times (settings-i18n, practice-setting A4,
    tenant-scope's value-drift check — the last a TAUTOLOGY since C24.1 merged: on a clean
    tree HEAD equals the disk file, so it could never fail). Three recurrences = the rule
    needed a machine, not a fourth ruling. The scanner found and forced the fix of the
    tenant-scope instance (pinned 939a663 vs a6c8bd8) and the stale "at HEAD" check labels.
38. **Engage count discipline (Architect):** the gate's number is part of its identity — if it
    moves, the report must say exactly which check changed and why. C27's move was 172 → 173:
    ONE added check ("platformEmailConfigured() now reports true for this process"), zero
    existing assertions changed or removed, disclosed in the build report and commit message.

## Architect rulings — 2026-09-12 (second follow-up: ratifications, dispatch order, freeze)
- Rulings 36/37/38 RATIFIED as recorded. On 37, the Architect's addition for the ledger: the
  tenant-scope tautology was worse than a missing gate — a gate that CANNOT FAIL reports
  confidence while telling you nothing; after pinning it still passes 48/48, so the behaviour
  was correct all along and what was missing was any PROOF of it. Fixing the lying "at HEAD"
  labels instead of excepting them was also correct — a label that lies about its baseline is
  a smaller version of the same defect. The practice-setting sighting is accepted as live
  corroboration that the resolution-failure class is real and intermittent.
39. **DISPATCH ORDER: C26 now → C27 Phase 2 next → C28 last (DEMOTED, and why is recorded):**
    C26 is the only remaining item with an EVENT-DAY failure mode (sign up in the room, log in
    on your own subdomain; a DB blip in that window bounces you to /login on stage — the sweep
    reproduced exactly this). C27 Phase 2 is week-one (a founding practitioner's first client
    invite must not arrive from Valentina Vélez of Veritas Consulting). C28 is demoted:
    /admin/prospects already answers what Jacob will ask on the 23rd (SIGNED_UP prospects +
    tenant links), and self-chosen passwords (C23-SIGNUP) make "reissue a temp password" a
    rarer support need than the spec assumed. Real operational value, no event-day dependency.
40. **FREEZE:** C26 and C27 Phase 2 merged by Sept 18. C28 only if green by Sept 19. After
    Sept 20, NOTHING merges to the deploy branch except a fix for something that breaks the
    demo — including docs-only pushes, because every push redeploys the site Jacob presents.

## Architect rulings — 2026-09-14 (C26 review: accepted; all five decisions + both corrected
## checks RATIFIED — the resolution TYPE, the data-layer refusal, stale-counts-as-resolved
## ("the RIGHT identity with possibly outdated config is a different and far smaller problem"),
## the standing gate, and the byte-identity/landing-page check corrections)
41. **Where an audit is structurally impossible, say so in the report and name the substitute
    trace; never ship a write that cannot succeed and call it an audit.** (From C26: an audit
    row cannot be written during the database outage that triggered the refusal — the trace is
    the structured log line + the 503s in HTTP metrics.)

## Architect rulings — 2026-09-15 (new Architect onboarding + C29 completion dispatch)
42. **Architect error, recorded so the same assertion is not made again:** the previous
    Architect's handoff asserted four mid-flight C29 items as delivered; they were never
    sent and never reached the builder. Nothing was built on them. (Two happened to hold
    by construction — normalization-not-deletion, no prisma in middleware; one was
    withdrawn as unwarranted — see 43; one was the real gap — /book, closed under this
    dispatch.)
43. **C29 verify item 6 stands as built; no relaxation was ever warranted.** Unknown-slug
    resolves to the default tenant, so the default marketing home and the default
    wordmark are the correct assertions, and the non-default root redirect is the
    intended change, not a V6 violation.
44. **A gate's normalization must carry a companion check proving the normalization
    cannot hide the very difference the gate exists to catch, and that companion check
    must be demonstrated failing.** (Applied to event-chrome: the raw identity-count
    check fired on its FIRST real run — the /login wordmark's RSC-payload relocation —
    and was then demonstrated against an injected script-only string with the normalized
    check passing while the companion tripped; output quoted in the C29 report addendum.)
45. **Where a pre-change fixture was never captured, the gate either re-captures from the
    pinned commit or is labeled a forward drift guard. A post-change pin is never
    described as before/after evidence.** (Applied: /book is not in the 16-screen
    baseline, so its fixture was captured from a worktree checkout-and-build of f07a035
    — a real before/after.)

## Architect rulings — 2026-09-15 (C29 review: RATIFIED with two corrections; all five
## build decisions ratified — (a) A5 fix built not proposed, (b) tab-metadata widening,
## (c) /api/tenant-kind + commented middleware literal (cross-pointer comments now at
## both lib/tenancy definitions), (d) "Sign in" EN-only AS A LOGGED DEVIATION not as
## correct — see the PUBLIC-I18N open item below, (e) the normalization set with 47)
46. **The /login "veritas" 9→10 named delta is RATIFIED, with a scope limit:**
    EXPECTED_DELTAS is for structurally-explained serialization artifacts ONLY. Any
    future delta requires the same three things — rendered bytes unchanged, a named
    structural cause, and a demonstrated failure with the delta present. A delta added
    to make a red gate green is not permitted. (Sentence recorded as a comment above
    EXPECTED_DELTAS in the gate.)
47. **KNOWN BLIND SPOT, recorded not fixed:** the `$ACTION_ID_<sha>` normalization in
    event-chrome-verify erases a value that encodes the server action's module path —
    a refactor that MOVES a server action to a different file changes that id and the
    gate will not see it. Accepted cost of comparing across a worktree checkout; the
    gate proves no more than this. (Comment at the normalization site.)
48. **A deploy is verified against the tip that is serving.** A docs-only or ledger-only
    push after a health check is a NEW deploy and needs its own check. This is the
    freeze rule (ruling 40) stated as a verification rule — after Sept 20 it stops
    being a re-check and becomes a prohibition. (From the C29 review's C1: the af315f4
    health check was correct when run, then the 942bf62 report push redeployed both
    environments unchecked.)
49. **The demo path is verified by gate, and the manual rehearsal confirms the gate
    rather than substituting for it.** (Enacted by C30-DEMO-PATH — dispatched and
    BUILT 2026-09-15, spec in accepted/, gate `audits/demo-path-verify.ts` 34/34,
    in the standing set before stamp-audit.)

## Architect rulings — 2026-09-15 (C30 in-flight review)
50. **Pinning a known defect's count in a gate is QUARANTINE, not acceptance.** Every
    such pin must name the defect, cite its tracking item, and fail on any change in
    EITHER direction — growth is regression, shrinkage means someone fixed it and the
    pin is now lying. Applied to demo-path's /book and portal-metadata pins (each now
    cites its tracking item; they were already exact-equality, so both directions
    fail). Distinct from ruling 46's EXPECTED_DELTAS, which covers serialization
    artifacts with NO defect behind them — the two mechanisms must not blur.
51. **The standing gate set lives in a committed runner (`scripts/regress.sh`), not an
    uncommitted scratchpad.** RATIFIED — the scratchpad was the direct cause of the C2
    count confusion. Any future count claim quotes the runner's own enumeration.
52. **A harness proves the previous server is dead by checking the PORT, never by
    matching a process name.** Process names are not a contract (Next 14 renames its
    process to `next-server (v…)` — proven by test, quoted in the C30 report: the
    universal `pkill -f "next start -p <port>"` backstop matched NOTHING while the
    server survived, and the same pattern can match the CALLER instead). Every
    pkill-pattern teardown is to be replaced with a port check — the enumerated list
    (16 gate files + scripts/baseline.ts) is in the C30 report; replacement HELD
    pending the Architect's read of the stale-server scope answer, per the in-flight
    review's stop clause. demo-path already complies.
53. **ARCHITECT ERROR, recorded:** C29 decision (b) — the tab-metadata fix — was
    ratified as complete, but it covered the four auth pages only; the root layout
    still prints Veritas into the PORTAL's tab on every host (C30's finding 1). The
    ratification was incomplete; (b) does not close tab chrome.
54. **THE SCOPE LINE, stated once:** identity CHROME — wordmark, logo, header, footer,
    tab title, metadata — resolves per tenant and is a tenancy defect, ours to fix.
    Editorial COPY — what a practice's marketing page actually says — is a product
    decision and belongs to brand-web. F2's remainder splits along that line: the
    chrome half is in scope (→ C31), the copy half is not.
    Also ratified: C30's law-2 rescope (word scan body-only, dollar scan all visible
    bytes) — the meta-description "break free" match was a false positive; the two
    scans' scopes differ ON PURPOSE and the gate comment says why.

## Architect rulings — 2026-09-15 (scope answer accepted; hold lifted)
55. **The ruling-52 teardown replacement across the sixteen server-spawning gate files
    is DEFERRED until after Sept 23.** Not cancelled — queued. Reasons of record:
    (a) the primary mechanism is proven sound; (b) the backstop's failure mode is LOUD
    (a misfiring pkill aborts the sweep visibly, it does not manufacture a false
    green); (c) a truncated sweep reading as complete is already closed by ruling 51's
    committed runner; (d) editing sixteen gate files five days before a freeze is
    renovating the instruments at the moment we most depend on them. Ruling 52 stands
    as LAW for any NEW gate from today: port check, never process name. demo-path
    complies; C31's gate must.
56. **The teardown mechanism is sound on the NORMAL path; the abnormal path is a crash
    before teardown, and its blast radius is exactly the set of gates sharing that
    port.** RESIDUAL ANSWERED WITH TESTS (quoted in the C30 report): the standing set
    has TWO shared-port pairs — **3123: signup (sweep pos 7) → v31 (pos 20)** and
    **3124: capture (pos 8) → c21 (pos 18)**. The later gate does NOT detect the
    occupied port: spawn fails invisibly (stdio "ignore") and the health poll answers
    from the ghost — v31 ran its COMPLETE suite against a planted ghost twice (4 ✗
    with a mismatched-env ghost = loud but misattributed; a ghost with v31's own env
    would be indistinguishable and green; control run with a fresh server 32/32).
    No baseline.ts-style refusal exists in any of the four. Reported before C31
    merges, per instruction; port reassignment awaits dispatch (ruling 55's reasoning
    applies to editing those files too).
57. **When a gate and observed behavior disagree, suspect the harness before the
    assertion.** (From the /join 200-vs-303 resolution: the harness posted urlencoded
    against a form that declares multipart; C23-CAPTURE's real-browser JS-disabled
    assertion was sound as written. The inverse habit is how a program talks itself
    into weakening a gate that was right.)

## Architect rulings — 2026-09-15 (residual answered; root-URL incident)
58. **ARCHITECT ERROR, recorded:** ruling 55's reasoning (b) claimed the teardown
    vulnerability's failure mode is "LOUD, not silent" — true of the pkill backstop
    misfiring, wrongly generalized to the whole vulnerability. The crash-before-
    teardown path on a SHARED port is silent (v31 ran its complete suite against a
    ghost undetected). Ruling 55's deferral of the sixteen-file teardown rewrite
    STANDS on reasons (a), (c), (d) only; (b) is struck. Port collisions are a
    separate, narrower defect — fixed now, not deferred.
59. **Gate ports are unique and the uniqueness is MACHINE-ENFORCED**
    (`audits/port-uniqueness-verify.ts`, in the standing set before stamp-audit; set
    35 → 36, the addition named). Any new gate declares its own port; the scanner
    catches a collision, not review. Applied: v31 3123→3125, c21 3124→3126 (the
    earlier gate in the sweep keeps its port) — and the scanner's FIRST run found two
    MORE collisions the manual survey missed (billing/b1's MOCK_PORT = settings-i18n's
    3131 — a standing-set gate; billing/b2's MOCK_PORT = p12's 3132): moved to
    3181/3182. Fourth confirmation of ruling 28's lesson: the scanner beat the list
    on day one.
60. **INCIDENT:** production and staging served a baked 307-to-/unavailable at "/"
    since f988a68, 2026-09-14 ~16:35Z, through four subsequent deploys. Cause:
    Railway's BUILD phase cannot reach DATABASE_URL (private domain), so C26's layout
    resolution fails at build and bakes the unresolved redirect into the static root
    (P1 reproduced it — the build EXITS 0 while baking the digest; P2 with a
    reachable DB produced a clean 200 root). Blast radius: the static root only;
    dynamic routes resolve at runtime and were unaffected. Not caught because every
    deploy check probed /api/health, /login, /api/tenant-kind and never the root.
    REMEDY (Architect ruling: option 1, ops-only): build-scoped DATABASE_URL uses
    DATABASE_PUBLIC_URL. STAGING FIXED 2026-09-15 22:53Z (buildCommand
    `DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`; fresh from-source build;
    origin HTTP/2 200, her title, ZERO digests; all seven surfaces 200; runtime
    variables untouched — no set-variables call ever made, names identical).
    **PRODUCTION HELD FOR JACOB** — one-action change and rollback prepared in the
    incident report. Lesson also recorded: Railway "redeploy" REUSES the previous
    build — a buildCommand change needs a fresh from-source deployment.
61. **A deploy check reads the STATUS LINE before it reads anything else.** Content
    grepped from a body whose status was never checked is not evidence — a 307 error
    shell can contain the very title being grepped for. (The builder's own disclosed
    error; recorded because the disclosure is what surfaced the incident. A second
    instance was caught DURING the incident fix: the proxy's "200 Connection
    Established" CONNECT line reads as a status line — read the LAST HTTP line.)
62. **The ruling-48 deploy check asserts GET / returns 200, carries the expected
    title, and contains no NEXT_REDIRECT digest, on every environment, every time.**
    A check that never probes the page the demo opens on is not a deploy check.

## Architect rulings — 2026-09-15 (staging fix review)
66. **The remedy of record is a staging Build Command override**
    (`DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build`), NOT the build-scoped
    variable originally authorized — Railway's API exposes no build-scoped variable;
    the buildCommand is the available mechanism and does not touch runtime. Rollback is
    clearing the field. Recorded so the ledger shows what was BUILT, not what was asked.
67. **A Railway redeploy reuses the prior build artifact.** When a defect lives in the
    build, only a fresh FROM-SOURCE deployment tests the fix. Any future deploy
    verification of a build-phase defect states which of the two it ran.

## PLATFORM_DOMAIN SAFETY TRACE (Q1a-Q1c, for Jacob — code quoted in
## docs/reports/outbox/INCIDENT-ROOT-URL.md): setting PLATFORM_DOMAIN=psychefolio.com is
## SAFE for valentinavelez.com — a non-matching host returns the DEFAULT slug (the
## explicit non-match branch of slugFromHost), identical resolution to today; the C26
## unresolved path fires only on DB-lookup failure, orthogonal to this variable. Bare
## apex psychefolio.com → default slug in code, but the apex DOES NOT ROUTE to the app
## today (not a Railway domain; live probe unreachable). www.psychefolio.com → slug
## "www" → no row (RESERVED, unclaimable) → unknown-slug → default-host content (her
## brand on the platform's www — the documented brand-web class). valentina.psychefolio
## .com → the default tenant live on a second host: auth WORKS there (trustHost: true,
## auth.config.ts:6), cookies are HOST-ONLY (Auth.js defaults, no Domain attribute) so
## sessions neither transfer nor leak across hosts, and absolute links follow the
## visiting host (getBaseUrl reads request headers; PUBLIC_APP_URL unset in production
## so getBaseUrlSafe falls back to request then to her domain in cron contexts).
## CLARIFICATION OF RECORD: today's test.psychefolio.com 200 answering
## kind:"tenant"/isDefault:true proves ROUTING AND TLS ONLY — the default resolves
## precisely BECAUSE the variable is unset. With it set, that host becomes
## kind:"unknown-slug" (still default-host content, no redirect). It is NOT proof the
## demo path works; that proof needs the variable set plus a real minted tenant.

## Architect rulings — 2026-09-15/16 (production authorized; steps 1 and 2 executed)
68. **Two production changes never ship in one run.** Step-stop-verify, so a regression
    is attributable to a single cause. (Followed: the build-command fix landed, was
    verified and reported, and only then did PLATFORM_DOMAIN ship — each with its own
    fresh from-source deployment and its own verification battery.)
69. **A live probe proves only what its current configuration permits it to prove.**
    The test.psychefolio.com 200 proved routing and TLS while PLATFORM_DOMAIN was
    unset, and nothing about tenancy. Record the probe's scope alongside its result,
    always. (After the variable shipped, the same probe flipped to kind
    "unknown-slug" exactly as predicted — the flip itself is the tenancy half-proof.)

## Architect ruling — 2026-09-16 (step 2 accepted; step 3 authorized; incident closed)
70. **The bare apex psychefolio.com routes nowhere; the wildcard does not cover it.**
    Documented, not a defect — and if it is made to route, it serves the DEFAULT
    tenant's content (Valentina's marketing page under the platform's name) until
    brand-web says otherwise. Jacob's call (a Railway domain addition, not a content
    decision). THE PREPARED ONE-ACTION CHANGE (not implemented):
    (a) WHAT: add `psychefolio.com` as a custom domain on the production service,
        port 8080, alongside `valentinavelez.com` and `*.psychefolio.com`.
    (b) DNS: Railway does NOT auto-create DNS (the wildcard's record was created at
        the DNS provider: live query shows `test.psychefolio.com CNAME
        48q35e3z.up.railway.app`). The apex needs an ALIAS/ANAME (or the provider's
        CNAME-FLATTENED apex record — valentinavelez.com's own apex resolves exactly
        that way: flattened CNAME `lsvhy2j8.up.railway.app` + A 69.46.46.50) pointing
        at the target Railway issues when the domain is added. NEVER a literal CNAME
        at the apex — a true CNAME cannot coexist with other record types and would
        SHADOW THE ZOHO MX, breaking mail.
    (c) MAIL SAFETY, verified by live DNS queries (2026-09-16), not assumed: apex MX =
        `10 mx.zoho.com / 20 mx2.zoho.com / 50 mx3.zoho.com`; apex TXT = `v=spf1
        include:zohomail.com ~all` + zoho-verification; `_dmarc` TXT = `v=DMARC1;
        p=none;`; Resend lives on the DELEGATED subdomain (`send.psychefolio.com`
        CNAME `send.forge.rmta.net` with its own SPF/MX). An apex A/ALIAS is a
        different RR type from MX/TXT and coexists with all of them — nothing above
        changes. Currently apex A: NONE (why curl exits 000).
    (d) WHAT IT WOULD SERVE: the default slug (slugFromHost's `clean ===
        platformDomain` branch) — Valentina's marketing page on psychefolio.com.
        Plainly: the platform's apex would wear HER brand. That is an argument for
        leaving it unreachable until brand-web ships the platform page.
    (e) ROLLBACK: remove the custom domain from the Railway service and delete the
        apex DNS record; MX/TXT untouched throughout.

## Architect rulings — 2026-09-16 (step 3 accepted; rehearsal authorized)
71. **An apex CNAME on a mail-bearing domain shadows the MX records. Never add one.**
    An apex A or ALIAS coexists with MX, SPF, DKIM and DMARC. Live-queried
    (2026-09-16), not assumed — cheap to record, expensive to rediscover.
72. **Architect recommendation of record (Jacob's call): the apex stays unrouted
    through the event.** Routing it would serve Valentina's marketing page under the
    Psychefolio name — reads as the platform being one person's practice, the exact
    impression the white-label story must not give. A dead apex is explainable in one
    sentence on stage; a wrong one is not. Revisit with brand-web after Sept 23.

## Architect rulings — 2026-09-16 (rehearsal split ratified; deviation named)
73. **A production database credential never enters this session.** Not pasted, not
    echoed, not used once and rotated. Where a task needs production DB access, it
    splits: Jacob runs the SQL, the builder runs everything else. Two round trips are
    always cheaper than a live credential in a transcript. Applies to every future
    task.
74. **A hold lifts when the Architect lifts it.** A builder that concludes a hold no
    longer applies STATES that conclusion and waits. (From the named deviation: the
    builder pushed the runbook commit 76ecd89 to the deploy branch on its own judgment
    that the incident hold had expired — the ruling-48 check came back green, no harm,
    but the judgment was not the builder's to make. After Sept 20 this stops being a
    process point and becomes ruling 40's prohibition: docs-only pushes redeploy the
    site Jacob is about to present, and they do not ship.)

## REHEARSAL (authorized item 2) — BLOCKED ON DB ACCESS, nothing minted (2026-09-16):
## the builder has no production DB path (connector redacts values; the Railway agent
## cannot run SQL — quoted in the runbook; no app surface for counts/deletion), so C2
## and the teardown are not executable by the builder alone. The split that needs no
## credential in the transcript is in docs/reports/outbox/REHEARSAL-RUNBOOK.md:
## Jacob runs three SQL blocks via `railway connect Postgres`; the builder runs the
## full HTTP walk + reads the welcome email at jkelluniverse+psf-founder@gmail.com
## (C1) and reports subject/sender/link-targets. Freeze note: this must run BEFORE
## Sept 20 (ruling 40).

## ROOT-URL INCIDENT — CLOSED (Architect, 2026-09-16; steps 1-3 complete, 36-entry
## sweep green, ports/rulings merged to the deploy branch). TIMELINE: broke f988a68 2026-09-14 ~16:35Z; staging
## build fix 3f74c8fc (2026-09-15 22:53Z); production build fix d13b8518 (Jacob-
## authorized, 23:23:50Z — root back to HTTP/2 200, her title, zero digests, seven
## surfaces 200, /book up throughout); PLATFORM_DOMAIN=psychefolio.com then shipped
## separately per ruling 68 (before-state: ABSENT from both variable lists; rollback of
## record = DELETION, though absent and "" are code-identical in slugFromHost's falsy
## guard): production deploy e005d116 (23:53:43Z), staging deploy f568e1e4 (2026-09-16
## 15:50:09Z), each a fresh from-source build carrying the variable (set with deploys
## skipped so exactly one deploy carried it). Verified after each: valentinavelez.com
## root/seven surfaces unchanged; test.psychefolio.com/api/tenant-kind FLIPPED to
## {"kind":"unknown-slug","isDefault":true} exactly as predicted (ruling 69);
## www.psychefolio.com 200 default content; bare apex psychefolio.com still does not
## route to the app (curl 000) — brand-web item, not a bug. The one-action plan below
## is retained as the historical record of what Jacob authorized:
- (AT THE TIME OF THE HOLD) valentinavelez.com/ served the baked 307 error shell (JS
  visitors landed on /unavailable's 503; no-JS visitors a blank error page). Dynamic
  pages were 200 throughout. RESOLVED — see the timeline above.
- THE ONE-ACTION FIX (staging-proven): set the production service's Build Command to
  `DATABASE_URL="${DATABASE_PUBLIC_URL}" npm run build` and trigger a fresh
  from-source deployment. ROLLBACK: clear the Build Command (staging's before-state
  was unset/Railpack default) and redeploy.
- ESCALATED WITH IT (Jacob's decision, not the builder's): PLATFORM_DOMAIN is UNSET in
  both environments — slugFromHost resolves EVERY host to the default slug, so no
  minted practice's subdomain reaches its own portal (the demo's last step). The code
  expects the BARE APEX (no leading dot, no port): `clean.endsWith(`.${platformDomain}`)`
  — i.e. `PLATFORM_DOMAIN=psychefolio.com`. Wildcard routing ALREADY WORKS live:
  production has the custom domain `*.psychefolio.com` on the service and
  test.psychefolio.com answered 200 (resolving default, as expected while the var is
  unset). All gates assert subdomain resolution per-request in-process
  (x-forwarded-host) — they prove the logic, not the deployment; setting the var is
  the last live switch.

## STALE-SERVER SCOPE ANSWER (C30 in-flight review, 2026-09-15 — evidence in the C30
## report): the pkill backstop is DEAD CODE in every server-spawning gate (16 files,
## same pattern), but the PRIMARY teardown (SIGTERM to the spawned pid) is sound —
## Next renames the SAME pid, so the signal lands directly; proven by live test. All
## 22 gate ports free and zero next-server processes after three full sweeps today.
## Exposure requires a harness-process crash mid-gate (observed once, in C30's own
## development iterations, never in a sweep). The C29 pre-merge sweep's greens STAND:
## its gates pinned same-day content a stale server could not serve (settings-i18n's
## C27P2-day keys; event-chrome's three server generations on one port inside one
## run, including the DB-failure server whose unresolved-shell responses a healthy
## ghost could not produce).

## COUNT RECONCILIATION (C29 review C2 — ruling 38 applied to gate counts):
The standing regression set contains **35 entries** (34 → 35 on 2026-09-15: C30 added
demo-path, named; before that 34 since C29 added event-chrome; C26-era set was 33),
and now has a COMMITTED definition — **`scripts/regress.sh` IS the enumeration**:
lint-wall · guard-prisma · tsc · build · smoke ·
smoke-writes · signup · capture · referral · engage · tenant-scope · nested-stamp ·
settings-i18n · platform-phase2 · platform-phase3 · platform-phase5 · platform-verify ·
c21 · c20 · v31 · c12x · onboarding-complete · onboarding-stage1 · onboarding-update ·
onboarding-ui · onboarding-discovery · password-reset · amd06 · practice-setting ·
email-identity · fail-closed-tenancy · event-chrome · demo-path · gate-hygiene ·
stamp-audit (LAST).
Three wrong numbers, each owned: the original C29 report's "all 35 gates green" was
FALSE twice over (no 35-entry sweep ever existed, and the only C29-build sweep was
33 green + gate-hygiene RED — transcript output is the evidence; corrected in the
report); commit 8bd150a's message "34 green" miscounted that same 33-green sweep
(immutable commit message — corrected here and in the report); the builder's "36-gate
sweep" phrasing during the completion dispatch was stated without counting (actual 34).
The credential-gated four (pipeline/p12, fixtures/values-verify, c12x-ai-pass,
remarkable-recording) are NOT entries in the standing set and never were — they explain
none of the gaps. Count discipline fix: a sweep total is never restated without
enumerating; the enumeration above is the reference.

## FINDING — F2 (Architect follow-up, 2026-09-14): INVESTIGATED, REAL, NOT FIXED (per
## instruction — needs its own spec and priority call).
**On practice B's own subdomain, under HEALTHY resolution, the marketing homepage served is
VALENTINA'S practice marketing.** `app/(public)/page.tsx` is `force-static` over
`content/site-content.ts` ("Valentina's public marketing copy" — her name, "Meet Valentina",
her testimonials, her photo) with zero host/tenant awareness — identical bytes on every host.
So every practice minted at the event serves HER marketing at their root domain. Precision that
matters for the spec to come: the booking FLOW inside that wrapper is tenant-correct (C26's
healthy control proved /book on B's host reads B's own slots and stamps B) — the defect is the
static marketing WRAPPER, not the funnel's data. Scope note: /login also carries a hardcoded
"veritas" wordmark on every host (flagged in the C25 report). Awaiting Architect spec + priority.

## Standing laws: specs are law; verbatim legal text; evidence-mandatory AI; no invented features;
   kill-switches & gates per spec; report discrepancies, never silently resolve them.
Additional standing decisions already in force (from prior builds):
- Drawn signature REQUIRED to sign (Jacob, 2026-08-12) — UI + server enforced
- E-records disclosure wording approved as written (Jacob, 2026-08-12)
- No PAN/CVV/bank-account capture anywhere — instruments live in Square (PCI)
- Client-visible chrome changes require explicit acceptance; 16-screen byte baseline enforces it
- Every raw-prisma access is allowlisted with justification (scripts/guard-prisma.ts, prebuild gate)
- Psychefolio brand v1.1 (`/BRAND_HANDOFF.md`) is the platform's visual identity source of
  truth; tenant #1 keeps Warm Stone wine/mocha untouched, and wine/mocha never appears on
  Psychefolio-branded surfaces (Jacob, 2026-09-08). Veritas is Valentina's branded TENANCY
  of Psychefolio, not a separate product layer — docs that read otherwise are stale
  (2026-09-11, via the C25 handoff)
