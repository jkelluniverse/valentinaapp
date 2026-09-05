# PSYCHEFOLIO BUILD STATE

## Active track: (none — C23-ENGAGE accepted by the Architect 2026-09-05.
## ALL FOUR C23 EVENT SURFACES ARE BUILT AND VERIFIED: signup 37/37 · capture 59/59 ·
## referral 68/68 · engage 172/172. Remaining work before Sept 23 is deployment + Jacob's
## decisions, not features — see "Before the event (Jacob)" below.)

## Queue (dependency order):
1. (Architect review) C23-ENGAGE — report in docs/reports/outbox/BUILD-REPORT-C23-ENGAGE.md;
   8 items for ratification, incl. a spec assertion that was false (see below).
2. (awaiting spec / Architect) whatever follows the four event surfaces. Standing candidates
   already filed under Blocked: PUBLIC-I18N, C19 pipeline Phase 3+, PLATFORM Phase 6.

## Built & verified: (list as completed)
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
   platform/phase5-verify 17/17

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

## Before the event (Jacob) — everything the four event surfaces need that engineering cannot do
Consolidated 2026-09-05 by the Architect. Nothing here is a feature gap; all four surfaces are built
and gated green. These are deploys, secrets, and decisions that are Jacob's by right.

**Deploy, in this order**
1. `prisma migrate deploy` — migrations `45_practitioner_prospect`, `46_referral_index`,
   `47_prospect_message`. The referral index is what keeps counts off a sequential scan; the
   ProspectMessage unique constraint is what makes double-sending structurally impossible.
2. Deploy the branch. `npm run prebuild` runs the tenant-scope guard, so a scoping regression fails
   the deploy rather than reaching production.

**Env vars — each one has a real failure mode if missed**
- `PLATFORM_ADMIN_EMAILS` must contain Jacob's production address, or `/admin/prospects` 404s for him
  at the event. This is the page that answers "how many did we get."
- `PLATFORM_DOMAIN` must be set, or every signup / portal / unsubscribe link degrades to a relative
  path — which means broken links in the one email sequence that matters.
- `RESEND_API_KEY` — until it exists, follow-up ticks record `UNCONFIGURED` (harmlessly, and
  re-sendably). No key means no follow-up, not a crash.
- `JOBS_SECRET` — already in use by C13-PACKAGES; the engage step rides the existing tick.

**Decisions only Jacob can make**
- **Sender identity for practitioner follow-up (ruling 22).** Currently signed "Valentina" over the
  Veritas Consulting footer, which puts her practice's identity behind a software pitch to her
  professional peers. Must be settled BEFORE opening the engage gate. Architect recommends a platform
  sender with her as a named voice only by her consent; note the Psychefolio USPTO check is still
  outstanding, so the sender name should not assert that mark yet.
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
- (code, deferred) `STRUCTURE.md` also stale now on `lib/engage*.ts`, `messages/*/engage.json`,
  `app/(public)/unsubscribe`, `audits/engage/` (ruling 6).
- (code, low priority) task #79 — `audits/referral/verify.ts` should self-write its VERIFY-LOG.md as
  its sibling gates do; until then its evidence lives only in its build report.
- (code, low priority) task #78 — `/practitioner/settings` has no message catalog, so its labels
  (including the new referrals link row) are inline English. Needs a settings-page i18n pass; every
  string this program ADDED is in both catalogs.
- (ops, before Sept 23) migration `46_referral_index` must be deployed before the referral surfaces,
  or every referral count is a sequential scan.
- (code, deferred) `STRUCTURE.md` now also stale on `/practitioner/referrals`,
  `lib/referral{s,-config,-copy}.ts`, `messages/*/referral.json`, `audits/referral/` (ruling 6).
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
- (code, anytime) task #75 — auto-stamp nested relation writes with tenantId (nightly audit is the net)
- (Jacob decision) Cloudflare R2 storage cutover (local driver live; config swap)

## Standing laws: specs are law; verbatim legal text; evidence-mandatory AI; no invented features;
   kill-switches & gates per spec; report discrepancies, never silently resolve them.
Additional standing decisions already in force (from prior builds):
- Drawn signature REQUIRED to sign (Jacob, 2026-08-12) — UI + server enforced
- E-records disclosure wording approved as written (Jacob, 2026-08-12)
- No PAN/CVV/bank-account capture anywhere — instruments live in Square (PCI)
- Client-visible chrome changes require explicit acceptance; 16-screen byte baseline enforces it
- Every raw-prisma access is allowlisted with justification (scripts/guard-prisma.ts, prebuild gate)
