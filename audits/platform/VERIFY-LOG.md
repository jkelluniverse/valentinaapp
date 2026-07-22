# PLATFORM Phase 0/0.5 verify — 2026-07-22T15:55:01.813Z

## Tenant #1
- ✓ tenant row exists (slug valentina)
- ✓ fixed id matches the DAL constant — tnt_valentina_000000001
- ✓ journey-v1 + warm-clay
- ✓ her three panels as generic module keys — archetypal-keys, body-graph, values-spiral
- ✓ her branded names live in settings, not code — Human Design · Gene Keys · Values spiral

## Null-tenant invariant (migration 36 + stamped creates)
- ✓ zero null-tenant rows across every scoped table — 66 tables checked

## Cross-tenant isolation — all 66 tables
- ✓ tenant B sees zero rows in every table (her data invisible)
- ✓ every table's B row is visible to B
- ✓ her tenant sees none of B's rows in any table
- ✓ legacy null rows belong to the DEFAULT tenant only (5 table probe)

## Host resolution
- ✓ custom domain resolves the default tenant (no PLATFORM_DOMAIN set)
- ✓ subdomain resolves its slug
- ✓ apex resolves the default tenant
- ✓ foreign host resolves the default tenant
- ✓ nested subdomain never leaks a slug

ALL CHECKS PASS

---

# BILLING Phase B1 — Square OAuth Connect flow (2026-07-22)

Run: `audits/billing/b1-verify.ts` — 18/18 against the built app and a local
mock of Square's OAuth surface (endpoint shapes verified against the live
docs the same day; the developer app is unregistered, so credentials are
placeholder env values and nothing blocks on paperwork).

## Connect flow (§3.2)
- ✓ start → authorize redirect with client_id, scope, signed tenant-bound state
- ✓ callback exchanges the code, stores CONNECTED account, captures the
  merchant's business name; tampered state rejected (badstate)
- ✓ settings page: "Connected as {business name}", disconnect revokes with
  `Authorization: Client APPLICATION_SECRET` AND deletes local tokens

## Token lifecycle (§3.3, Rule 0.8)
- ✓ AES-256-GCM at rest — raw DB row holds no plaintext token material
  (dump inspection); ciphertext round-trips
- ✓ daily refresh job rotates tokens proactively (tick §6b)
- ✓ forced refresh failure → NEEDS_RECONNECT; dashboard banner offers the
  one-tap reconnect

## Valentina zero-change (Rule 0.6)
- ✓ her env-token arrangement is represented as a virtual CONNECTED account
  with ZERO rows written and her existing payment code paths untouched
- ✓ 16-screen baseline byte-identical (recaptured for clock drift —
  greeting + inactivity-threshold rollover; eyeballed both), 50-page smoke

B1 VERIFY PASS — 18/18 · B2–B4 held by instruction

---

# SESSION-PIPELINE Phases 1–2 (multi-tenant amendment) — 2026-07-22

Run: `audits/pipeline/p12-verify.ts` — 20/20 against a local mock of
AssemblyAI's surface (shapes verified against live docs same day) and ONE
REAL extraction call.

- ✓ consent HARD STOP in code: no transcription without an active
  RecordingConsent; blocked uploads store nothing
- ✓ audio in OUR custody via the storage adapter (local driver; S3/R2 is a
  config decision, not a refactor); signed expiring access only — no public
  objects
- ✓ submit: diarization ×2 speakers, webhook auth-header binding, signed
  capture token in both URLs
- ✓ normalize + speaker heuristic (opener/talker → practitioner), one-tap
  Swap speakers in review; vendor copy DELETED after normalize
- ✓ real Claude extraction returns the strict §6 schema — heard the belief
  statement verbatim, captured action items, stayed descriptive (no
  diagnosis-adjacent language), flags array present
- ✓ draft lands in the EXISTING C19 review inbox (provider "capture") —
  practitioner-as-author: nothing merges without Apply; redaction-before-
  persistence unchanged
- ✓ error path keeps audio for retry; tick §6a2 polls webhook-less captures
- ✓ amendment honored: SessionCapture carries tenantId (scoped model #69),
  every query through the scoped client, prebuild guard green

Gates: baseline byte-identical, 51-page smoke pass.

---

# Draft→map hard-boundary verification (pre-onboarding, 2026-07-22)

Question: is there ANY code path — direct API call included — by which an
extraction draft reaches a client's live map without a practitioner action?
Answer: NO. The existing C19/Margins Apply flow already guarantees the
spec's draft-review gate at full strength. Full trace:

- The only writers of recording content into the live map are
  `applyRecordingCore` (→ SessionTranscript + Note) and `applyHandwrittenNote`
  (→ Note). `applyRecordingCore` takes `practitionerId` as a required arg;
  its only callers are the `applyRecordingDraft` server action (opens with
  `requirePractitioner()`) and the CLI verify harness.
- All THREE automated pipeline entry points create only a `RecordingDraft`
  (status DRAFT) and never touch the map: `/api/webhooks/transcription` and
  the jobs-tick backstop both call `completeCapture` (draft-only);
  `/api/recording/webhook` calls `ingestRecording` (draft-only).
- The map extractor `runPsycheExtraction` reads only persisted rows
  (recordItem, note, sessionTranscript, psycheNode/edge, HD chart) — NEVER
  `RecordingDraft.payload`. A draft is invisible to the map until Apply
  persists it. Its three server-action callers all open with
  `requirePractitioner()`.

Asserted in `audits/pipeline/p12-verify.ts` (now 22/22): after the full
automated pipeline runs, the draft is still DRAFT, no SessionTranscript
exists, and no recording Note exists — the map is untouched until a
practitioner Applies. No gap to close; onboarding builds on this gate.

---

# CLIENT-ONBOARDING Stage 1 — intake engine spine (2026-07-22)

Run: `audits/onboarding/stage1-verify.ts` — 17/17 (CLI, self-cleaning).

- ✓ schema GENERATED from her enabled modules (identity → birth → values
  question-set), values set expanded to concrete scale fields, birth-time-
  unknown path carried, honest minute estimate
- ✓ existing clients untouched: no flow → not forced into intake (the
  routing gate, next slice, only fires on an IN_PROGRESS flow)
- ✓ startFlow creates one IN_PROGRESS flow, emits intake.started; resume
  returns the SAME flow (one active flow per client)
- ✓ per-field persistence with question-text SNAPSHOT (Rule 0.8), idempotent
  upsert; step advance emits intake.step_completed
- ✓ schema-drift guard: disabling a question-set module rebuilds the schema,
  KEEPS every answer, re-syncs the stored hash. (Disabling one of two
  chart modules that share birth fields is correctly NOT a drift — the
  builder dedups shared requirements.)

Modeling note: IntakeAnswer carries no tenantId — it is scoped transitively
through its parent IntakeFlow (cascade); removed from SCOPED_MODELS so the
scoped client doesn't inject a filter for a column that doesn't exist (the
invariant audit caught this). Isolation verify extended with B-fixtures for
all six models added since it was written (payment, connected account,
capture, intake flow, hint state, activity event): ALL CHECKS PASS.

---

# CLIENT-ONBOARDING §5 — completion orchestration + both intersections (2026-07-22)

Run: `audits/onboarding/complete-verify.ts` — 16/16 (throwaway client, self-cleaning).

Intersections the user flagged, both proven:
- (1) the recording ConsentRecord created at the Review step IS the same
  RecordingConsent row the session pipeline's gate reads — the verify
  asserts hasRecordingConsent() passes for the client afterwards (not a
  parallel record).
- (2) at completion BOTH fire: the values-spiral internal scorer → SPIRAL
  LensResult (held for review), and the birth-data → reading path → her
  in-house chart engine (ensureChart: HD + Gene Keys). reading.computed
  events emitted for each. (Her tenant uses her existing computation, not
  the held astrology-api.io ReadingProvider — Rule 5.1.)
- identity/birth committed to profile with the time-unknown path; flow
  marked COMPLETE; intake.completed emitted; re-completion no-ops.

## Production bug this surfaced and fixed
The scoped client's `$transaction([...])` array form was AWAITING each built
op — which executes the PrismaPromise into a resolved value instead of
passing the unresolved promise to $transaction, so every array-form
transaction threw "All elements must be Prisma Client promises." Live since
the scoped-client deploy; smoke is GET-only so it never exercised a write
path. Affected in-request paths: library item/folder actions, notes,
billing, courses, forgot-password, and ensureChart (profile-save chart
regeneration silently failed). Fixed: pre-checks run first (async), then the
promise array is built SYNCHRONOUSLY. complete-verify now permanently guards
this path (ensureChart's 3-item transaction runs green through it).

---

# CLIENT-ONBOARDING Stage 1 UI — the intake flow (2026-07-22)

Run: `audits/onboarding/ui-verify.ts` — 10/10 (browser-driven, throwaway
invited client, self-cleaning).

- ✓ routing gate: a client with an IN_PROGRESS flow is redirected to
  /space/intake from anywhere in /space; existing clients (no flow) are
  never redirected (pixel gate safe — María byte-identical)
- ✓ Welcome → generated Identity/Birth/values steps → Review → Done, each a
  mobile-first single-screen takeover (no space chrome)
- ✓ per-field auto-save on change (debounced) with the question-text snapshot
- ✓ Complete my setup → flow COMPLETE, intakeCompletedAt stamped, the values
  scorer produced a SPIRAL lens (the §5 fan-out, fired through the real UI)
- ✓ after completion the gate releases — the client is no longer redirected

Wiring: new clients get their flow at invite acceptance (`app/invite`), so
first login lands in intake; the space-layout gate renders the intake route
bare and only redirects when a flow is active. `/space/intake` added to the
GET smoke walk (redirects a no-flow client home → 200).

---

# CLIENT-ONBOARDING §4.6 — birth-time UPDATE flow (2026-07-22)

Run: `audits/onboarding/update-verify.ts` — 7/7 (throwaway client, self-cleaning).

- ✓ a client who onboarded WITHOUT a birth time adds it from Settings
  (the affordance shows only when birthTimeUnknown — no fixture client has
  that, so the baselined settings/design screens are untouched)
- ✓ invalid time rejected; valid time sets birthTime + precision EXACT
- ✓ targeted recompute: the chart's inputHash changes with the new time, so
  time-dependent readings regenerate (unchanged inputs stay cached)
- ✓ a purpose:UPDATE flow is recorded COMPLETE (the schema-ready UPDATE path,
  §4.6) + intake.birthtime_added event emitted

Gates: baseline byte-identical, smoke, invariant clean.

---

# CLIENT-ONBOARDING §4.5 — practitioner preview mode (2026-07-22)

"Preview intake" (Settings → Preview intake): renders the EXACT generated
intake — same schema builder, same copy — with a persistent "PREVIEW —
nothing saved" banner and a distinct dashed-tint frame. Reflects the tenant's
current module config (toggling a module changes the preview).

- ✓ all preview screens render (welcome → steps → review) — in the GET smoke
- ✓ ZERO persistence proven: IntakeFlow row count identical (0 → 0) before and
  after walking the full preview. Persistence-free by construction — the page
  has no form actions and no writes.
- ✓ baseline byte-identical (a new practitioner route; client screens untouched)

---

# CLIENT-ONBOARDING §4.4 — invite-link lifecycle (2026-07-22)

The invite system already had single-use (acceptance guard on PENDING) and
resend-regenerates-the-token. Completed to spec:
- ✓ links live 14 days (INVITE_TTL_DAYS 7 → 14)
- ✓ resend invalidates the old link (token regenerated) AND logs an
  invite.resent event
- ✓ expired/used-link page: a friendly "Ask for a fresh link" button that
  notifies the inviting practitioner (email + invite.fresh_requested event),
  no enumeration (same response whether or not the token is real)
- ✓ new clients get their intake flow at acceptance (wired in the intake UI
  slice) → first login lands in intake

Gates: baseline byte-identical, smoke, build green.
