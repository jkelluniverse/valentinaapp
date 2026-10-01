# CLAUDE-PLATFORM.md — Multi-Tenant Platform Build File (v1.0)
### Practitioner Portal · Tenant config system · Layouts · Skins · Modality modules · ReadingProvider
Companion to `CLAUDE.md` (session pipeline v1.1). Same repo, same standing rules. Read both before building.

---

## 0. STANDING RULES — READ FIRST, APPLY ALWAYS

1. **Valentina's portal must not change.** She is a live user. Phase 0 converts her portal into tenant #1 with ZERO visible difference — same screens, same navigation, same colors, same features. Every phase in this file must pass the check: "Does Valentina's experience change? If yes, stop." Refactors happen underneath her, never to her.
2. **One codebase, one deployment, many tenants.** A new practitioner is a database row + a config object + a subdomain — never a forked repo, never a second Railway app. All customization is data, not code.
3. **Config is data, code is generic.** No `if (tenant === "valentina")` branches anywhere, ever. If a tenant needs something the config schema can't express, extend the schema.
4. **The platform is modality-agnostic.** No trademarked modality names (PSYCH-K, Gene Keys, Human Design, or any other controlled system) in code identifiers, module keys, database enums, or platform-level UI copy. Named branding lives only in tenant-entered display strings. Module keys are generic (`archetypal-keys`, `body-graph`, `values-spiral`, `western-natal`, `tarot-draw`).
5. **Readings are the practitioner's interpretive tools.** The platform computes, stores, and displays them; it never validates, interprets, or makes claims about them. Copy in shared components stays neutral ("Reading", "Chart", "Draw").
6. **Compute once, cache forever.** Birth-data-derived readings never change; store them on the client record at intake completion and never re-call the API for the same inputs.
7. **Adapter pattern for all external reading services** — same discipline as the transcription adapter. `ReadingProvider` interface; astrology-api.io is today's implementation; the vendor is swappable via env/config.
8. **Verify astrology-api.io parameters against live docs before writing integration code.** OpenAPI spec: `https://api.astrology-api.io/api/v3/openapi.json` · llms.txt: `https://astrology-api.io/llms.txt`. Do not rely on memorized endpoint shapes.
9. **All standing rules from `CLAUDE.md` v1.1 apply** (entity separation, consent gate, practitioner-as-author, no real client data in seeds/demos, server-side keys only, solo-operator maintainability).

---

## 1. THE ARCHITECTURE DECISION (and why)

**Multi-tenant, single deployment.** The alternative — clone-the-repo-per-practitioner — feels plug-and-play but becomes its opposite at client #4: every bug fix, security patch, and feature ships N times to N Railway apps with N drifting configs. One codebase means one fix ships to everyone, and "copying a new version" collapses into inserting a `Tenant` row.

Tenancy model:
- Every tenant-owned table carries `tenantId`; every query is tenant-scoped through a single data-access layer (`lib/tenancy/db.ts`) that injects the filter. No raw Prisma calls from feature code — this is how cross-tenant leaks are made impossible rather than merely avoided.
- Routing: subdomain per tenant (`{slug}.portaldomain.com`) resolved in middleware to a `tenantId`; custom domains supported later via a `TenantDomain` table (Railway custom domains).
- One Postgres database, tenant-scoped rows. (Per-tenant databases are enterprise theater at this scale; revisit only past ~50 tenants.)

---

## 2. THE TENANT CONFIG (heart of the system)

```prisma
model Tenant {
  id           String   @id @default(cuid())
  slug         String   @unique          // subdomain
  displayName  String                    // "Valentina R." — tenant-entered
  status       TenantStatus              // ACTIVE | DEMO | PROVISIONING | SUSPENDED
  layoutKey    String                    // "journey-v1" | "dashboard-v1" | "canvas-v1"
  skinKey      String                    // "warm-clay" | "celestial-dark" | "clinical-light" | "botanical"
  branding     Json                      // { logoKey?, accentOverride?, portalTitle, welcomeCopy }
  modules      TenantModule[]
  featureFlags Json                      // { sessionPipeline: true, manualLookup: false, ... }
  createdAt    DateTime @default(now())
}

model TenantModule {
  id        String  @id @default(cuid())
  tenantId  String
  moduleKey String                       // registry key, e.g. "western-natal"
  enabled   Boolean @default(true)
  position  Int                          // display order on client maps
  settings  Json                         // module-specific knobs incl. display label
  @@unique([tenantId, moduleKey])
}
```

`settings.displayLabel` is where a practitioner's own branded language lives ("Kabbalistic Natal Reading", "Body Graph") — Rule 0.4: their words in their data, generic keys in our code.

**Config completeness test:** provisioning a new tenant must require zero code changes. If it doesn't, the schema is incomplete — fix the schema.

---

## 3. LAYER 1 — LAYOUT TEMPLATES

A layout template answers: what is home, what is one click away, what does the portal think the practitioner does all day. Implemented as three parallel layout component trees under `components/layouts/{key}/`, selected once at the root by `tenant.layoutKey`. All layouts consume identical feature components (client list, map, session review, intake) — layouts arrange, features behave.

| Key | Paradigm | Home screen | Fits |
|---|---|---|---|
| `journey-v1` | Client-first | People; opening a client makes their map the world | Depth practitioners (Valentina's current movement — snapshot it exactly) |
| `dashboard-v1` | Ops-first | Today: schedule, roster, statuses, sidebar nav | Coaches, structured practices |
| `canvas-v1` | Map-first | The psyche map is the interface; everything hangs off nodes | Most esoteric end (build LAST; hardest) |

Rules:
- `journey-v1` is defined as **whatever Valentina has today**, extracted, not redesigned. Improvements to journey navigation become `journey-v2` — she opts in, never migrates silently.
- Layout templates are versioned and immutable once a tenant is live on them.
- New feature = must render acceptably in ALL live layouts before ship, or sit behind a feature flag.

---

## 4. LAYER 2 — SKINS (design tokens)

Skins are pure CSS custom-property sets in `styles/skins/{key}.css` — palette, typography pair, radius/texture, iconography accent. No layout information in a skin; no colors in a layout. Any skin × any layout must compose.

Ship four: `warm-clay` (Valentina's current palette, extracted exactly), `celestial-dark`, `clinical-light`, `botanical`. `branding.accentOverride` allows one tenant-picked accent color on top of a skin; anything deeper becomes a new skin file.

Acceptance for the token extraction: screenshot-diff Valentina's key screens before/after — pixel-identical.

---

## 5. LAYER 3 — MODALITY MODULE REGISTRY

`lib/modules/registry.ts` — every module declares itself:

```typescript
export type ModuleClass = "COMPUTED" | "SESSION" | "MANUAL_TOOL";

export interface ModuleDefinition {
  key: string;                    // generic, trademark-free (Rule 0.4)
  class: ModuleClass;
  defaultLabel: string;           // neutral: "Natal Chart", "Card Draw"
  intakeRequirements: IntakeField[];   // fields this module forces into intake
  readingRequests?: ReadingRequest[];  // COMPUTED: what to pull at intake completion
  mapPanel: React.ComponentType<MapPanelProps>;  // how it renders on a client map
  sessionTool?: React.ComponentType<SessionToolProps>; // SESSION class: in-session UI
}
```

### Module classes
- **COMPUTED** — derivable from intake data. On intake completion, the orchestrator collects `readingRequests` from all enabled computed modules, calls the ReadingProvider, and stores results on the client record. Launch set: `western-natal`, `vedic-natal`, `numerology`, plus **placeholder panel modules** `archetypal-keys`, `body-graph`, `values-spiral` (see 5.1).
- **SESSION** — event-based, happens in the moment: `tarot-draw` (draw tool in session view; each draw stored as a dated reading attached to the session). Cannot be auto-derived from intake — never pretend otherwise.
- **MANUAL_TOOL** — practitioner research console: `lookup-console`, a panel to query positions/transits/synastry ad hoc without leaving the app (astrology-api.io raw-data endpoints). Results optionally saved to a client record.

### 5.1 Valentina's trifecta — honest handling
Her three panels (`archetypal-keys`, `body-graph`, `values-spiral`) migrate as **structured-content panel modules**: whatever data/process produces them today keeps producing them (manual entry or her existing flow), rendered through the module system. Do **not** wire them to computed readings in this build — proper computation for those systems involves controlled IP and dedicated sources, which is a separate decision with its own guardrails. Zero change to her workflow (Rule 0.1); the win is that her panels now prove the module system renders arbitrary modality content.

### Intake schema builder
`lib/intake/schema.ts` derives each tenant's intake form from their enabled modules' `intakeRequirements` (union, deduped) plus tenant-added custom fields. Birth-data fields include a **"birth time unknown"** path: modules declare whether they degrade gracefully (natal without houses) or hide.

---

## 6. READINGPROVIDER ADAPTER

Same pattern, same discipline as `lib/transcription/`:

```typescript
// lib/readings/types.ts
export interface ReadingRequest {
  kind: string;                   // "natal-positions" | "natal-houses" | "transits" |
                                  // "synastry" | "numerology-core" | "tarot-draw" | ...
  inputs: Record<string, unknown>; // birthDate, birthTime?, birthPlace{lat,lng,tz}, spread, etc.
}

export interface NormalizedReading {
  provider: string;
  kind: string;
  inputsHash: string;             // cache key — dedupe identical computations (Rule 0.6)
  computedAt: string;
  payload: unknown;               // provider result, shape documented per kind
  raw: unknown;                   // full provider response, archived
}

export interface ReadingProvider {
  readonly name: string;
  supports(kind: string): boolean;
  compute(req: ReadingRequest): Promise<NormalizedReading>;
}
```

- `lib/readings/astrology-api.ts` — the ONLY file that knows astrology-api.io exists. Verify every endpoint path and parameter against the OpenAPI spec (Rule 0.8) before writing. API key server-side env var (`ASTROLOGY_API_KEY`).
- `lib/readings/index.ts` — factory keyed to `READING_PROVIDER` env var.
- Caching: before any provider call, check `Reading` table by `inputsHash`; free tier is 50 requests/month, so demos must run almost entirely from cache after first computation.
- Rate/failure handling: readings compute in a background job at intake completion; failures mark the reading `PENDING_RETRY` and never block intake submission.

```prisma
model Reading {
  id         String   @id @default(cuid())
  tenantId   String
  clientId   String
  sessionId  String?             // set for SESSION-class readings (draws)
  moduleKey  String
  kind       String
  inputsHash String
  payload    Json
  status     ReadingStatus       // COMPLETE | PENDING_RETRY | FAILED
  computedAt DateTime
  @@index([tenantId, clientId])
  @@unique([tenantId, clientId, kind, inputsHash])
}
```

---

## 7. PROVISIONING — "NEW PRACTITIONER IN UNDER AN HOUR"

Admin-only provisioning flow (`/admin/tenants/new`, Jacob-only role):
1. Create tenant: slug, display name → subdomain live immediately (wildcard DNS already pointed).
2. Pick layout + skin (live preview with fictional data).
3. Toggle modules; set display labels; review the generated intake form.
4. Branding: logo upload, portal title, welcome copy, accent override.
5. Seed choice: `EMPTY` (real client) or `DEMO_FIXTURES` (fictional data, status `DEMO`).
6. Invite practitioner (email, role `PRACTITIONER`).

Also expose as a CLI script (`scripts/provision-tenant.ts --config path.json`) — the config JSON IS the productized deliverable: a practitioner's entire portal is one reviewable, versionable file.

DEMO tenants: banner-marked, fictional seed data only, excluded from any real notification sends.

---

## 8. VALENTINA MIGRATION (Phase 0 — the strangler)

Order of operations, each step invisible to her:
1. **Snapshot:** screenshot every screen/state of her current portal; record her flows. This is the regression baseline.
2. **Extract skin:** lift her palette/typography into `skins/warm-clay.css`; swap hardcoded styles for tokens. Diff against baseline: identical.
3. **Extract layout:** wrap her current navigation/IA as `layouts/journey-v1/` consuming the same feature components. Diff: identical.
4. **Introduce Tenant:** create her `Tenant` row (`ACTIVE`, `journey-v1`, `warm-clay`, her three panel modules + real feature flags); add `tenantId` to her existing rows via migration; route her domain through tenant middleware.
5. **Verify:** full manual pass of her real flows + screenshot diffs. Only then is Phase 0 accepted.

She never gets an email that says "we migrated you." If she notices anything, Phase 0 failed.

---

## 9. BUILD PHASES & ACCEPTANCE CRITERIA

**Phase 0 — Valentina becomes tenant #1 (do first, alone, carefully)**
- [ ] Screenshot baseline captured and stored in repo (`/docs/baseline/`)
- [ ] Skin + layout extracted; screenshot diffs pass (pixel-identical on key screens)
- [ ] `Tenant`/`TenantModule` migrated; all her data carries `tenantId`; middleware routes her domain
- [ ] Tenant-scoped data-access layer in place; a test proves cross-tenant reads are impossible
- [ ] Her portal behaves identically end-to-end (manual pass, checklist in repo)

**Phase 1 — Second layout + skins**
- [ ] `dashboard-v1` layout complete with all existing features rendering correctly
- [ ] `clinical-light` + `celestial-dark` skins; every skin × layout combo renders acceptably
- [ ] Layout/skin switch on a DEMO tenant requires config change only

**Phase 2 — Module registry + intake builder**
- [ ] Registry with Valentina's three panel modules migrated (workflow unchanged — Rule 5.1)
- [ ] Intake schema derives from enabled modules; birth-time-unknown path works
- [ ] Enabling/disabling a module on a DEMO tenant updates intake + map panels with zero code

**Phase 3 — ReadingProvider + computed modules**
- [ ] `astrology-api.ts` adapter, params verified against OpenAPI spec; key server-side
- [ ] `western-natal` + `numerology` compute at intake completion; cached by `inputsHash`; retry path works
- [ ] Second identical intake computes zero new API calls (cache proof)

**Phase 4 — Session + manual tools**
- [ ] `tarot-draw` session tool; draws stored as dated readings on the session
- [ ] `lookup-console` manual tool; optional save-to-client
- [ ] Neutral platform copy audit (Rule 0.5) across all module surfaces

**Phase 5 — Provisioning + demo tenants**
- [ ] Admin provisioning flow + CLI script; new DEMO tenant live in < 1 hour without code changes
- [ ] Three seeded demo tenants: `demo-journey` (Valentina pattern, fictional data), `demo-mystic` (canvas-or-journey + celestial-dark + natal/tarot/lookup), `demo-coach` (dashboard + clinical-light + NO esoteric modules)
- [ ] The Sept 23 demo move works: flipping `demo-mystic`'s config to coach settings transforms the portal live

**Phase 6 — `canvas-v1`** (only after 0–5 accepted; hardest layout, least urgent)

---

## 10. OUT OF SCOPE — DO NOT BUILD

- Any redesign, improvement, or "quick fix" to Valentina's live experience (goes in `journey-v2`, her opt-in)
- Computed integrations for controlled-IP systems (archetypal-keys / body-graph stay panel modules pending a separate decision)
- Per-tenant databases or per-tenant deployments
- Self-serve tenant signup (provisioning is Jacob-only for now)
- Marketplace/theming UI for practitioners to build their own skins
- Anything violating `CLAUDE.md` v1.1 out-of-scope list
