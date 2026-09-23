# CLAUDE-CLIENT-ONBOARDING.md — Client Intake & Discovery Build File (v1.1)
### Practitioner Portal · First-login intake engine · Resumable progress · Quiet feature discovery · Preview mode · Future-proofing
Supersedes v1.0. Companion to `CLAUDE.md` (session pipeline v1.1) and `CLAUDE-PLATFORM.md` (multi-tenant v1.0). All standing rules from both apply. Build AFTER platform Phase 2 (module registry + intake schema builder).

**v1.1 changes:** practitioner preview mode (4.5); IntakeFlow supports multiple flows per client (re-intake/reassessment-ready); question-text snapshots on answers; activity event log; string tables; drop-off analytics; invite-link lifecycle; export inclusion. All marked ◆.

---

## 0. STANDING RULES FOR THIS BUILD

1. **The intake is generated, not hardcoded.** Steps and questions derive from the tenant's enabled modules (`intakeRequirements`) plus tenant custom questions. No tenant-specific intake code, ever.
2. **Never lose a client's answer.** Every field persists server-side the moment it's entered. A closed laptop, dead phone, or two-week gap costs nothing.
3. **No forced tours.** No modal walkthroughs, no "step 3 of 9" overlays, no blocking coach marks. Discovery is ambient, contextual, dismissible, and finite (Section 6).
4. **Mobile-first.** Clients will do this on phones. One question group per screen, big touch targets, no side-by-side layouts on small viewports.
5. **Plain, warm language in shared copy; the practitioner's language in module copy.** Platform-level strings stay neutral; module display labels and welcome text come from tenant config.
6. **Birth data precision matters.** Charts computed from wrong coordinates or timezone are wrong readings delivered with confidence. Geocode properly, resolve historical timezone, honor the "time unknown" path.
7. **Sensitive data, minimal collection.** Collect only what enabled modules require.
8. ◆ **Answers must stay meaningful forever.** An answer without the question as it was asked is future garbage. Snapshot question text with every answer (2.1).
9. ◆ **Preview is never real.** Practitioner preview mode persists nothing to real client data and is visually unmistakable as preview (4.5).

---

## 1. WHAT WE'RE BUILDING

Two connected systems:

**A. Intake engine** — a resumable, step-based flow that a client lands in on first login. Collects identity + birth data + module question sets (including the values-spiral assessment, which auto-computes their spiral), ends with review + consent, then triggers computed readings in the background and lands the client on their home screen.

**B. Quiet discovery layer** — how clients learn the portal after intake without being marched through it: teaching empty-states, one-at-a-time contextual hints, and a dismissible getting-started card.

```
FIRST LOGIN
    │
    ▼
┌─ INTAKE ENGINE (resumable at any point) ─────────────────┐
│                                                          │
│  Welcome ─► A. Identity ─► B. Birth Data ─► C. Module    │
│  (tenant     name · sex     DOB · time ·     question     │
│   welcome    · contact)     place (geo+tz)   sets (values │
│   copy)                     · "unknown       spiral, etc.)│
│                              time" path         │         │
│                                                 ▼         │
│              E. Done ◄─── D. Review & Consent            │
│              (celebrate,   (answers summary ·             │
│               go home)      recording consent* ·          │
│                             data acknowledgment)          │
└──────────────────────────┬───────────────────────────────┘
                           │ background
                           ▼
        Readings compute (ReadingProvider + internal scorers)
        Values spiral auto-populates · Map panels fill in
                           │
                           ▼
              HOME + QUIET DISCOVERY LAYER
        (teaching empty states · contextual hints ·
              getting-started card)
```

---

## 2. DATA MODEL

```prisma
enum IntakePurpose { INITIAL | UPDATE | REASSESSMENT }   // ◆
enum IntakeStatus  { NOT_STARTED | IN_PROGRESS | COMPLETE | ABANDONED }

model IntakeFlow {
  id          String        @id @default(cuid())
  tenantId    String
  clientId    String
  purpose     IntakePurpose @default(INITIAL)   // ◆ multiple flows per client over time
  status      IntakeStatus
  schemaHash  String        // hash of generated schema at start (see 4.3)
  currentStep String
  startedAt   DateTime?
  completedAt DateTime?
  @@index([tenantId, clientId])
  // ◆ Only one non-complete flow per client at a time — enforce in service layer.
}

model IntakeAnswer {
  id                   String   @id @default(cuid())
  flowId               String
  fieldKey             String   // "identity.fullName", "birth.time", "values.q7"
  value                Json
  questionTextSnapshot String   // ◆ the question EXACTLY as rendered to this client
  savedAt              DateTime @updatedAt
  @@unique([flowId, fieldKey])
}

model ClientHintState {
  id        String   @id @default(cuid())
  tenantId  String
  clientId  String
  hintKey   String
  status    HintStatus   // UNSEEN | SEEN | DISMISSED
  updatedAt DateTime @updatedAt
  @@unique([clientId, hintKey])
}

model ActivityEvent {          // ◆ lightweight event log — see 2.2
  id        String   @id @default(cuid())
  tenantId  String
  clientId  String?
  actor     String            // "client" | "practitioner" | "system"
  eventKey  String            // "intake.started", "intake.step_completed",
                              // "intake.completed", "intake.abandoned",
                              // "reading.computed", "hint.dismissed", ...
  meta      Json?
  createdAt DateTime @default(now())
  @@index([tenantId, eventKey, createdAt])
}
```

### 2.1 ◆ Why question-text snapshots
When a practitioner rewords question 7 next year, every historical answer to the OLD wording must still mean what it meant. `questionTextSnapshot` makes each answer self-contained forever — this is what makes future re-assessments comparable and old maps trustworthy. Non-negotiable on every answer write.

### 2.2 ◆ Why the event log now
`ActivityEvent` is ~30 lines to build and quietly powers the future: practitioner timelines ("Maria completed intake Tuesday"), the notification system, drop-off analytics (2.3), and debugging. Emit events from the intake engine from day one; build consumers later.

### 2.3 ◆ Drop-off analytics (privacy-light)
From `intake.step_completed` events, an admin view (Jacob + optionally per-tenant) shows counts per step and where clients stall — aggregate only, no third-party trackers, no client-level surveillance surface. This is how the intake itself gets improved with evidence instead of guesses.

### 2.4 ◆ Answers are self-contained for export
Per-tenant export (platform caveat #2) must include intake flows + answers with snapshots. No extra work if the schema above is followed — just include the tables in the export job's manifest.

---

## 3. THE INTAKE STEPS

Step order is fixed at the framework level; step CONTENT is generated per tenant.

### Welcome (no inputs)
- Tenant's `branding.welcomeCopy` + practitioner photo/logo. One button: "Let's begin."
- Honest expectation: "About N minutes. Your progress saves automatically — leave and come back anytime." (N computed from generated step count.)

### Step A — Identity
- Full name (as it should appear), preferred name (optional), contact confirmation.
- **Sex**: collected only when an enabled computed module requires it for chart calculation. Label: "Sex (used for your chart calculations)", options including "prefer to self-describe" where the module tolerates it. Stored separately from any display-gender field; modules declare the requirement in `intakeRequirements`.

### Step B — Birth data (the precision step)
- **Date of birth**: date picker, no defaults.
- **Time of birth**: time input with explicit alternate path — "I don't know my birth time" → "That's okay. Some chart details (like houses) need an exact time; the rest works without it." Time-degradable modules compute partial readings; time-required panels show "add your birth time anytime in settings" instead of an error. Helper copy: "Birth certificates often list it."
- **Place of birth**: places-autocomplete (city-level). On selection store: display name, lat/lng, and **historical timezone for that date/place** (timezone-by-coordinates honoring historical offsets — where naive implementations produce wrong charts). Never store just a city string.
- Reassurance line: "Used to calculate your charts. You can see everything we store in Review."

### Step C — Module question sets (generated)
- One sub-step per enabled module that declares intake questions, ordered by `TenantModule.position`, rendered under the practitioner's `displayLabel`.
- **Values spiral (auto-complete):** the `values-spiral` module ships a `questionSet` and a `score(answers) → SpiralResult` function in its module definition. On completion the scorer runs and writes the client's spiral to their map — no practitioner data entry. This is the **internal scorer** path (`ModuleDefinition.scorer?`), stored like readings with `provider: "internal"`. Valentina's existing assessment questions migrate verbatim into the module's `questionSet`; her existing clients' spiral data untouched (platform Rule 0.1).
- Practitioner custom questions render as the final sub-step.

### Step D — Review & consent
- Read-only summary grouped by step, each group with an Edit link (jump back, return here).
- Consent items (tenant-flag dependent): data acknowledgment (always, plain English); **session recording consent** when the session pipeline is enabled — the `ConsentRecord` from `CLAUDE.md` Section 4 is created HERE, satisfying the consent gate before the first session.
- Submit: "Complete my setup."

### Step E — Done
- Brief, warm completion. If readings still generating: "Your charts are being prepared — they'll appear on your map shortly." Never block on background jobs. Single button to Home.

---

## 4. FLOW MECHANICS

### 4.1 Save behavior
- Every field auto-saves on blur/change (debounced 800ms) via one upsert (with snapshot — Rule 0.8). Step advancement snapshots `currentStep`. Quiet "Saved" indicator. No Save buttons — saving is not the client's job.

### 4.2 Resume behavior
- Login while `IN_PROGRESS` routes to `currentStep`, pre-filled, with "Welcome back — picking up where you left off." Back-navigation allowed.
- Optional (tenant flag): ONE reminder email at 72h incomplete. Never more.

### 4.3 Schema drift guard
- If enabled modules change mid-flow, `schemaHash` mismatch triggers: rebuild steps, keep every still-relevant answer, surface only new questions. Never discard; never re-ask.

### 4.4 Access & invite links ◆
- First login via invite link from the practitioner's client-create flow. Links are single-use, expire in 14 days, and are resendable from the practitioner's client page (old link invalidated, event logged). Expired-link page: friendly, one button — "Ask {practitioner} for a fresh link" (notifies practitioner).
- Intake is the forced landing only while `IN_PROGRESS`; portal is reachable with the getting-started card pointing back ("Finish your setup — about N minutes left"). Surfaces that literally require intake data (the map) show their teaching empty-state with a finish-setup link.

### 4.5 ◆ Practitioner preview mode ("See it as your client will")
- Entry points: provisioning flow step 3 (module toggles) and the tenant admin's intake settings page — button: **Preview as client**.
- Renders the EXACT generated intake — same engine, same schema builder, same copy — against an ephemeral in-memory flow. Nothing writes to `IntakeFlow`/`IntakeAnswer`/readings; scorers may run at the Review step to show a sample spiral result, computed transiently and discarded.
- Visually unmistakable: persistent top banner "PREVIEW — nothing here is saved", distinct border tint. Exit anytime.
- Preview reflects unsaved provisioning changes (toggle a module → preview shows/hides its questions immediately) — this is the feedback loop that lets a practitioner tune their intake before any client sees it.
- Also available to Jacob for any tenant from the admin panel (support/debug).

### 4.6 ◆ Future flows: UPDATE and REASSESSMENT (schema-ready now, UI later)
- `purpose: UPDATE` — short generated flow for a specific fix (e.g., client adds birth time later → recompute time-dependent readings). The "add your birth time anytime" link in settings targets this.
- `purpose: REASSESSMENT` — practitioner-triggered re-run of an assessment module (values spirals change over time; comparing spiral-2026 to spiral-2027 is real practitioner value). Snapshots (2.1) make results comparable across years.
- v1.1 builds the schema and service-layer support; only the birth-time UPDATE flow ships now (it's small and immediately useful). Full REASSESSMENT UI is deferred but requires zero migration when it comes.

### 4.7 ◆ String tables
- All platform-level intake/discovery copy lives in `lib/copy/en.ts` (typed string table), not inline in components. Multi-language remains out of scope, but this makes it a translation task later instead of a refactor. Tenant-entered copy (welcome text, labels, custom questions) is already data.

---

## 5. WHAT HAPPENS AT COMPLETION (orchestration)

1. `IntakeFlow.status = COMPLETE`; answers commit to destinations; `intake.completed` event emitted.
2. Background fan-out: computed-module `ReadingRequest`s → ReadingProvider (cached, retried); internal scorers → `provider: "internal"` readings; `ConsentRecord` if recording consent included.
3. Practitioner notification: "{Client} completed their intake" + link to the fresh map.
4. Client lands on Home with the discovery layer active.
5. ◆ UPDATE-flow completion triggers targeted recompute only (e.g., birth time added → recompute time-dependent readings; cache untouched for unchanged inputs).

---

## 6. QUIET DISCOVERY (the anti-walkthrough)

Three mechanisms, strictly bounded. Philosophy: **the interface teaches at the moment of relevance, once, and then shuts up.**

### 6.1 Teaching empty states
Every major surface's empty state explains itself in one or two warm sentences with the one obvious action:
- Map (readings pending): "Your map is being prepared — your charts and {values label} will appear here shortly."
- Sessions (none yet): "After your sessions with {practitioner name}, summaries you've both reviewed will live here."
Empty states are the primary teacher — zero interruptions; the client is already looking there.

### 6.2 Contextual first-visit hints
- One small dismissible callout anchored to one element, first visit only. Hard rules: max ONE visible at a time; never blocks interaction (no overlay/dimming); dismiss = never again; catalog ≤ 6 per layout; **no chaining — "Next" buttons are banned** (a chain is a tour wearing a disguise). Hint copy ships with the layout template.

### 6.3 Getting-started card
- One quiet Home card, 3–5 auto-detected items that check themselves off from real behavior. Dismissible as a whole; auto-disappears forever when complete. Never reappears, never nags, never badges the nav.

### 6.4 The practitioner's voice (optional, tenant flag)
- Short welcome video/audio from the practitioner on the Done step or first Home visit. Beats any product tour — clients came for the practitioner, not the software. Pure config.

---

## 7. BUILD ORDER & ACCEPTANCE CRITERIA

**Stage 1 — Intake engine core**
- [ ] Step framework renders generated schema (fixture tenant, 2 modules + custom questions)
- [ ] Per-field auto-save with question snapshots; resume mid-step verified (kill tab; return; nothing lost)
- [ ] ◆ `ActivityEvent` emitted for start/step/complete/abandon
- [ ] Mobile pass at phone width: no horizontal scroll, no cramped inputs
- [ ] ◆ All copy through the string table (lint/code-review enforced)

**Stage 2 — Birth data precision**
- [ ] Autocomplete → lat/lng + historical tz; tests include a DST-era and a pre-1970 birth
- [ ] "Time unknown" path degrades correctly; Review shows exactly what's stored

**Stage 3 — Module questions + values spiral**
- [ ] Module sub-steps render from registry in tenant order with tenant labels
- [ ] Values-spiral scorer runs at completion; spiral on map with zero practitioner action
- [ ] Valentina's question set migrated verbatim; existing clients' spiral data untouched
- [ ] Schema-drift guard verified on a DEMO tenant

**Stage 4 — Review, consent, completion**
- [ ] Review summary with working Edit-jumps
- [ ] Recording `ConsentRecord` created when session pipeline enabled — gate satisfied pre-first-session
- [ ] Completion fan-out works; Done never blocks on jobs

**Stage 5 — ◆ Preview mode + invite lifecycle**
- [ ] Preview renders the exact generated intake; zero persistence proven (row counts identical before/after a full preview run)
- [ ] Preview reflects unsaved module toggles live; banner + tint unmistakable
- [ ] Invite links: single-use, 14-day expiry, resend invalidates old, expired page notifies practitioner
- [ ] ◆ Birth-time UPDATE flow: client adds time from settings → targeted recompute → time-dependent panels populate

**Stage 6 — Discovery layer**
- [ ] Teaching empty states on all major surfaces
- [ ] Hints: one-at-a-time, non-blocking, dismiss-forever, ≤6, no chaining (code-review enforced)
- [ ] Getting-started card auto-completes and disappears permanently
- [ ] Practitioner welcome video flag works on a DEMO tenant
- [ ] ◆ Drop-off view shows per-step counts from events (admin)

**Whole-file acceptance test:** a fictional new client on a DEMO tenant completes intake across THREE separate phone visits, ends with a populated map including an auto-computed values spiral, later adds their birth time via the UPDATE flow and watches house-dependent panels appear, and reaches day 7 having seen at most a handful of hints and zero forced tours. Separately: the practitioner previews their intake, toggles a module, and sees the preview change — with zero rows written.

---

## 8. OUT OF SCOPE — DO NOT BUILD

- Practitioner-side intake form BUILDER UI (custom questions stay config/admin-entered)
- Multi-language intake (string tables prepare for it; don't build it)
- Full REASSESSMENT flow UI (schema-ready; ships later)
- Payment collection inside intake
- Progress-nag mechanics (recurring emails, badges, streaks)
- Any modal/overlay product tour, however small
- Client-level analytics surfaces (aggregate drop-off counts only)
- Changes to existing clients' data or Valentina's current client experience
