# Veritas — Repository Structure

Veritas is a private coaching platform for Valentina Vélez (neuropsychology
specialist / Psych-K consultant). This document orients a new contributor (human
or AI) to where things live and how they fit together.

**Stack:** Next.js 14 (App Router) · React 18.3 · TypeScript · Prisma + PostgreSQL
· NextAuth (credentials) · Tailwind (Warm Stone tokens) · `@anthropic-ai/sdk`
(model `claude-opus-4-8`). Deployed on Railway from branch
`claude/valentinaapp-github-repo-erf4xp`; migrations run manually after deploy.

---

## Directory tree (tracked files only)

```
valentinaapp/
├── ai/                              # AI prompt+schema modules: SYSTEM_PROMPT, JSON OUTPUT_SCHEMA, VERSION
│   ├── deepeningPrompt.ts           #   C17 adaptive-inquiry "doors"
│   ├── integrativePrompt.ts         #   C12 cross-lens synthesis
│   ├── integrativeReadingPrompt.ts  #   C12r client-facing reading
│   ├── libraryAuthorPrompt.ts       #   C3 prompt studio
│   ├── noteScanPrompt.ts            #   C14 note connection-scan
│   ├── psycheExtractPrompt.ts       #   C16 constellation extraction
│   ├── sessionPrepPrompt.ts         #   C5 session prep
│   └── worksheetAuthorPrompt.ts     #   C9 worksheet studio
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── calendar/[secret]/route.ts     # ICS calendar feed (C10)
│   │   ├── health/route.ts                # VERSION marker — fingerprints each deploy
│   │   └── square/webhook/route.ts        # Square payment webhook (C13)
│   ├── invite/[token]/{actions.ts,page.tsx}     # C1 accept invite + grant consent
│   ├── login/page.tsx
│   ├── practitioner/                       # THE STUDY — practitioner portal (light theme)
│   │   ├── availability/                    #   scheduling config (C10)
│   │   ├── billing/                         #   ledger + Square (C13)
│   │   ├── courses/                         #   course builder (C6)
│   │   ├── library/                         #   AMENDMENT-03 folder library
│   │   │   ├── page.tsx, LibraryBrowser.tsx, folder-actions.ts
│   │   │   ├── actions.ts, PromptForm.tsx, SendToClient.tsx, ArchiveToggle.tsx
│   │   │   ├── [promptId]/page.tsx          #   prompt editor
│   │   │   └── new/page.tsx                 #   AI prompt studio
│   │   ├── messages/                        #   C15 inbox
│   │   ├── notes/                           #   C14 "The Margins" (private notes)
│   │   ├── patterns/                        #   C16.8 Pattern Library ontology
│   │   ├── schedule/, search/, worksheets/
│   │   ├── clients/
│   │   │   ├── page.tsx + row/invite action components   # roster (C8)
│   │   │   └── [clientId]/                  # THE PORTRAIT — tabbed client file
│   │   │       ├── page.tsx                 #   tabs: Record/Map/Margins/Messages/Prep/Between/Courses/Profile/Billing
│   │   │       ├── psyche-actions.ts        #   C16 curation (add/edit/merge/state/edge, audited)
│   │   │       ├── design/                  #   charts + integrative map (C11/C12)
│   │   │       ├── prep/                    #   C5 Prep Room
│   │   │       ├── book/, record/, worksheets/
│   │   ├── layout.tsx                       #   nav + mobile bottom tab bar
│   │   └── page.tsx                         #   The Study home (attention feed)
│   ├── space/                              # THE SANCTUARY — client portal (Dusk dark theme)
│   │   ├── first-map/                       #   C16.5/C17 the client's OWN living map
│   │   │   ├── page.tsx, FirstMap.tsx, actions.ts
│   │   ├── new/                             #   C2/C17 journaling
│   │   │   └── page.tsx  (+ ../ReflectionPortal.tsx, ../actions.ts)
│   │   ├── consent/                         #   AMENDMENT-01 one-time re-consent
│   │   ├── courses/, design/, entries/, journey/, messages/,
│   │   │   profile/, prompts/, schedule/, worksheets/
│   │   ├── layout.tsx                       #   nav + mobile bottom tab bar
│   │   ├── page.tsx                         #   Sanctuary home
│   │   ├── ReflectionPortal.tsx             #   the reflection + Settling Stone + Deepening UX
│   │   └── actions.ts                       #   createEntry / keepReflection / answerDoor / dismissDoor
│   ├── privacy/page.tsx
│   ├── globals.css                         # Warm Stone tokens + Dusk + mobile utilities
│   ├── layout.tsx                          # root layout (fonts, viewport, PWA meta, SW register)
│   ├── manifest.ts                         # PWA web manifest (AMENDMENT-02)
│   ├── not-found.tsx, page.tsx
├── components/
│   ├── mobile/                      # AMENDMENT-02: BottomTabBar, Sheet, AvatarSheet, PwaHint, RegisterSW, icons
│   ├── psyche/                      # C16: ConstellationMap (canvas force layout), MapWorkbench
│   ├── brand.tsx, entries.tsx, record.tsx, Greeting.tsx, ThemeToggle.tsx, SignOutForm.tsx
│   ├── MessageThread.tsx, HdChartView.tsx, Bodygraph.tsx, LensViews.tsx
│   ├── ReadingProse.tsx, ReadingSection.tsx, WorksheetFill.tsx, WorksheetAnswers.tsx
│   ├── JotBox.tsx, NoteRow.tsx, LessonContent.tsx, SlotGrid.tsx, SquareCardForm.tsx
│   └── ConfirmDelete.tsx, CopyField.tsx, InlineField.tsx, PendingButton.tsx
├── content/consent.md               # AMENDMENT-01 canonical consent text (DRAFT — needs pro review)
├── lib/                             # server logic: services, AI pipelines, guards, meta/config
│   ├── human-design/                #   in-house HD engine: engine, ephemeris, wheel, meaning, index
│   ├── auth-guards.ts               #   requireClient / requirePractitioner — the real authz boundary
│   ├── consent.ts                   #   AMENDMENT-01 single gate: hasConsent(userId)
│   ├── prisma.ts, base-url.ts, roles.ts, notify.ts
│   ├── record.ts, record-meta.ts, client-record.ts, attention.ts   # C4 unified record
│   ├── psyche.ts, psyche-extract.ts, pattern-library.ts            # C16 graph + extraction + cross-client library
│   ├── deepening.ts                 #   C17 adaptive-inquiry engine (safety-first)
│   ├── messaging.ts, message-safety.ts, message-refs.ts            # C15
│   ├── library.ts                   #   AMENDMENT-03 folders/items service
│   ├── notes.ts, note-scan.ts       #   C14
│   ├── integrative.ts, integrative-reading.ts, gene-keys.ts, spiral.ts   # C12/C12r
│   ├── session-prep.ts              #   C5
│   ├── courses.ts, course-meta.ts, worksheet-meta.ts, worksheet-author.ts, library-author.ts
│   ├── schedule.ts, schedule-meta.ts, appointments.ts, ics.ts, geocode.ts   # C10/C11
│   ├── billing.ts, square.ts, program-config.ts                    # C13
│   ├── search.ts, name.ts, entry-meta.ts, prompt-meta.ts, invites.ts, reference-input.ts
├── prisma/
│   ├── schema.prisma                # SINGLE SOURCE OF TRUTH for all models
│   ├── migrations/                  # hand-numbered SQL; applied manually via `npm run db:migrate`
│   │   0_init, 1_c1_accounts, 2_c2_log_entries, 3_c3_between_session, 4_c4_record,
│   │   5_c5_session_prep, 6_c6_courses, 7_c9_worksheets, 8_c10_scheduling, 9_c11_profile_hd,
│   │   10_c12_integrative, 11_c13_stages_billing, 12_c14_notes, 13_c12r_reading,
│   │   14_c15_messaging, 15_amendment01_consent, 16_amendment03_library,
│   │   17_c16_constellation, 18_c17_deepening
│   ├── seed.ts, backfill-record.ts
├── public/                          # PWA assets: icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, sw.js
├── auth.ts, auth.config.ts          # NextAuth (credentials)
├── middleware.ts                    # coarse signed-in gate + sets x-pathname header (consent redirect)
├── next.config.mjs, tailwind.config.ts, postcss.config.js, tsconfig.json
├── package.json, package-lock.json
├── .env.example, .gitignore, README.md
```

---

## Conventions & architecture

- **Two portals, one app.** `app/practitioner/*` = *The Study* (light). `app/space/*`
  = *The Sanctuary* (Dusk dark). The theme is scoped by `data-portal="practitioner|client"`
  on each portal's root; Warm Stone tokens are channel-triplet CSS vars (`--c-*`)
  in `globals.css`, aliased in `tailwind.config.ts`.
- **Rendering.** Pages are server components (`export const dynamic = "force-dynamic"`).
  Mutations are colocated `actions.ts` server actions (`"use server"`). Client
  components are the exception (canvas, sheets, live forms) and may import server
  actions directly.
- **The record (C4).** Everything a client creates funnels into `RecordItem` via
  `lib/record.ts` `record.append({...})`, keyed on `(sourceType, sourceId)`. This
  unified timeline is what every AI pipeline reads.
- **Authorization.** `lib/auth-guards.ts` (`requireClient` / `requirePractitioner`)
  read role/active status from the DB — this is the real gate. `middleware.ts` is
  only a coarse "are you signed in" check plus an `x-pathname` header.
- **Consent (AMENDMENT-01).** One versioned global grant. Every gate calls
  `hasConsent(userId)` from `lib/consent.ts`. The canonical text is
  `content/consent.md`. AI-review is folded into this one consent.
- **AI pipelines.** Server-side only; API key never leaves `lib/*`. Pattern:
  pseudonymize input → `@anthropic-ai/sdk` with `output_config.format` json_schema
  and `thinking: { type: "adaptive" }` → validate → store. Logs are METADATA ONLY
  (never record/message/map content). A mandatory referral/crisis layer runs first
  or short-circuits. Prompt files live in `ai/`; each carries a `*_VERSION`.
- **Migrations are manual.** Change `prisma/schema.prisma`, add a new numbered
  `prisma/migrations/N_name/migration.sql`, then after deploy run
  `npm run db:migrate` in the Railway shell. There is no auto-migrate on boot.
  Pages that touch a brand-new table should fail soft (catch `P2021`) during the
  deploy→migrate window.
- **Health/versioning.** `app/api/health/route.ts` exposes a `VERSION` string,
  bumped every deploy to fingerprint which build is live.
- **Mobile-first (AMENDMENT-02).** Bottom tab bars (`components/mobile/`), safe-area
  insets, `100dvh`, a reusable bottom `Sheet`, and PWA install. Desktop (≥768px)
  keeps quiet top-row nav; no tab bar.

## Component map (feature → code)

| Component | Where |
|---|---|
| C1 Accounts / invites | `app/invite/*`, `lib/invites.ts`, `lib/roles.ts` |
| C2 Reflections | `app/space/new`, `ReflectionPortal.tsx`, `app/space/entries/*` |
| C3 Prompts / library items | `app/practitioner/library/*`, `lib/library-author.ts` |
| C4 Unified record | `lib/record.ts`, `lib/client-record.ts`, `lib/attention.ts` |
| C5 Session prep | `lib/session-prep.ts`, `app/practitioner/clients/[clientId]/prep` |
| C6/C7 Courses | `app/*/courses`, `lib/courses.ts` |
| C9 Worksheets | `app/practitioner/worksheets`, `lib/worksheet-*.ts` |
| C10 Scheduling | `app/*/schedule`, `lib/schedule.ts`, `lib/appointments.ts`, `lib/ics.ts` |
| C11/C12 Charts + integrative | `lib/human-design/*`, `lib/integrative*.ts`, `app/space/design` |
| C13 Stages + billing | `lib/billing.ts`, `lib/square.ts`, `app/practitioner/billing` |
| C14 Margins (notes) | `app/practitioner/notes`, `lib/notes.ts`, `lib/note-scan.ts` |
| C15 Messaging | `app/*/messages`, `lib/messaging.ts`, `lib/message-*.ts` |
| C16 Constellation (psyche map) | `lib/psyche*.ts`, `components/psyche/*`, `app/practitioner/clients/[clientId]` (Map tab), `app/space/first-map` |
| C17 Deepening | `lib/deepening.ts`, `ai/deepeningPrompt.ts`, `ReflectionPortal.tsx` |
| AMENDMENT-01 Consent | `lib/consent.ts`, `content/consent.md`, `app/space/consent` |
| AMENDMENT-02 Mobile/PWA | `components/mobile/*`, `app/manifest.ts`, `public/*`, `app/layout.tsx` |
| AMENDMENT-03 Library folders | `lib/library.ts`, `app/practitioner/library/*` |

## Getting started (for a new agent)

1. Read `prisma/schema.prisma` first — it's the domain model.
2. `npm install`; typecheck with `npx tsc --noEmit`; build with a dummy env:
   `DATABASE_URL="postgresql://u:p@localhost:5432/db" AUTH_SECRET="<32+ chars>" npm run build`.
3. New Prisma model → edit schema + add a numbered migration; note that it must be
   applied with `npm run db:migrate` after deploy (not automatic).
4. Follow existing patterns: server component page + colocated `actions.ts`;
   put logic in `lib/`; route AI through the `ai/` prompt + `lib/` pipeline pattern
   with metadata-only logging and a safety layer.
