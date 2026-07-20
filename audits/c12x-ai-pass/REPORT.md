# C12X AI Pass — Report

**Date:** 2026-07-20 · **Model:** `claude-opus-4-8` (the production `ANTHROPIC_MODEL` default) ·
**Prompts:** `reading-3`, `guide-1`, `integrative-2`

**How this ran:** the exact production code paths (`ensureChart` → `ensureReading`,
`runIntegrationGuide`, `runIntegrativeSynthesis`) executed against the committed staging fixture
roster (anchor 2026-07-14) on a scratch Postgres, with the real Anthropic key. Reproducible via
`run.ts`, `run2-fixes.ts`, `run3-patch01.ts` in this directory — the same generations fire on
staging from the client design page and the Portrait's Guide tab.

---

## Round 1 — the four X.2 readings (`RUN-LOG.md`)

| Client | Case | Locale | Chart | Blocks | Lint | Status |
|---|---|---|---|---|---|---|
| María | full chart | en | Projector · Emotional · 2/4 · cross 36/6·11/12 | 13 | 0 hits | PUBLISHED |
| Elena | full chart | es | Manifesting Generator · Sacral · 5/1 | 13 | 0 hits | PUBLISHED |
| Tomás | **unknown time** | en | Manifestor (noon estimate) | 12 → **9 after fix** | 0 hits | PUBLISHED |
| Rosa | **approximate time** | en | Generator · Emotional · 5/2 | 10 | 0 hits | PUBLISHED |

- **Cross titling law held**: every cross named only by its gates; no invented titles.
- **Rosa (approximate)**: `APPROX_TIME_NOTE` now rides the chart (new — approximate was
  previously indistinguishable from exact); the reading holds Authority/Profile lightly and says
  so in prose. ✓
- **Tomás (unknown) — round-1 FAIL, fixed**: the model fabricated authority/profile/cross blocks
  from the noon estimate. Fix: those fields are now **stripped from the payload structurally**
  (never seen, can't be written) plus a post-generation filter. Round 2: 9 blocks, none
  time-dependent. ✓

## Round 2 — fixes proven live (`RUN-LOG-2.md`)

- Tomás re-generated: **no authority/profile/cross blocks** ✓ · lint 0 ✓
- María's Guide refresh with the new recency rule: **5 citations into the freshly seeded week**
  (was 0), 35/35 citations resolving ✓

## Integration Guide — María (`guide/`)

- First generation: 9 components · **42/42 evidence citations resolve to her actual record
  items** (invalid ids are dropped server-side by construction) · 11 consistent + 4 complicating
  cross-refs — both directions present ✓ · confidence levels in use: SUPPORTED / EMERGING /
  SPECULATIVE · 10 cautions across components · referral false.
- Transparent-connection format verified in the rendered output: theme → connection → cited
  evidence (dated, tappable in the app) → confidence → validation question.
- The overview honestly reports divergence ("treat those as questions, not findings") and that
  no resonance marks exist yet ("everything below is a hypothesis to test in session").
- On-demand refresh after a seeded week: `inputHash` changed ✓, resolution 100% ✓, and (round 2)
  the fresh entries are cited ✓.

## Spanish output vs the language law (Elena, `readings/elena.md`)

- Mechanical lint: **0 banned-phrase hits** (en + es patterns).
- Manual review: native es-419 (not translated English), tú register throughout, invitation
  phrasing everywhere ("puedes", "notar", "una posibilidad"), non-clinical, no jargon walls, no
  confidence vocabulary client-side. The closing even echoes the central principle ("ningún mapa
  te contiene del todo").
- **One item for Valentina's voice pass:** the text uses feminine agreements ("llamada",
  "hecha") rather than the fully gender-neutral formulations the prompt prefers. Defensible for
  Elena; worth her call on whether to force neutrality harder.

## Round 3 — C12X-PATCH-01 verify, 18/18 (`RUN-LOG-3-PATCH01.md`)

1. **María without the values assessment** (the blocker turned test case): reading, formulation,
   and Guide all generate; no values-machinery speculation in the reading (verified against
   values-snapshot/blend/center-of-gravity/stage/spiral markers + manual read of
   `readings/maria-no-values.md`); Guide overview names the absent lens once. ✓
2. **Values lens joins**: Guide + formulation show the stale chip ("the values lens joined the
   picture"); the client reading is stale by hash and **auto-regenerates on next visit**;
   refresh folds the spiral in and clears staleness. ✓
3. **Record grows ≥15 items**: Guide + formulation stale; **reading untouched** (chart-only by
   law). ✓
4. **Method text edit**: Guide + formulation stale; reading untouched. ✓
5. **History, not amnesia**: prior versions kept — READING×2, GUIDE×3, FORMULATION×1 — and
   viewable on their surfaces. Lint held on every regenerated output. ✓

## Defects this pass caught (all fixed & pushed)

1. `max_tokens` too small for adaptive thinking + structured output → truncated JSON
   (readings 24k, Guide 28k, Ask 12k).
2. Live API rejects `minItems`/`maxItems` in `output_config` schemas → stripped across all
   prompt schemas (reading, guide, ask, prep, belief statements, integrative).
3. Unknown-time fabrication (Tomás) → structural payload strip + post-filter.
4. Guide refresh ignored fresh material → recency rule.
5. Approximate birth time indistinguishable from exact → `APPROX_TIME_NOTE`.
6. Values-spiral hard block on the reading → PATCH-01 lens-graceful generation.
7. (Adjacent, staging-reported) fixture profiles never geocoded + geocoder failing on
   "City, Country" and country-less territories → self-heal + hardened lookup.

## Evidence index

- `readings/{maria,elena,tomas,rosa}.{md,json}` — rendered readings + raw structures
- `readings/maria-no-values.md` — the lens-absent branch
- `guide/maria-guide-1.{md,json}` · `guide/maria-guide-2-refresh.{md,json}` — Guide + refresh,
  citations annotated (`[NEW WEEK]` markers in round 2)
- `RUN-LOG.md` · `RUN-LOG-2.md` · `RUN-LOG-3-PATCH01.md` — assertion transcripts
- `run.ts` · `run2-fixes.ts` · `run3-patch01.ts` — reproducible runners
