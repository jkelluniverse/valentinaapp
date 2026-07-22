# PLATFORM Phase 0 — Valentina becomes tenant #1 (acceptance record)

Rule 0.1 held throughout: every slice shipped behind two gates — the
screenshot baseline (`scripts/baseline.ts --diff`, 15 byte-stable screens +
the simulated map, incl. two Dusk shots) and the 49-page smoke walk
(`npm run smoke`). If either failed, the slice stopped.

| Criterion | Status | Evidence |
|---|---|---|
| Screenshot baseline captured and stored in repo | ✅ | `docs/baseline/*.png` (16 screens: practitioner + client, desktop/mobile/Dusk), determinism proven by a same-build diff run |
| Skin extracted; screenshot diffs pass | ✅ | `styles/skins/warm-clay.css` (light + Dusk verbatim); `globals.css` keeps identical fallbacks; diff gate green; Dusk verified by eye |
| Layout extracted; diffs pass | ✅ | `components/layouts/journey-v1/` (both shells verbatim) behind the registry; app layouts are thin wrappers; diff gate green |
| `Tenant`/`TenantModule` migrated; her data carries `tenantId`; middleware routes her domain | ✅ | Migration `33_tenant_phase0` (fresh-DB zero-drift + populated-DB backfill both proven); her three panels as generic module keys with HER labels in settings; host→tenant resolution in `lib/tenancy` (all current hosts → default tenant; `{slug}.$PLATFORM_DOMAIN` ready for tenant #2) |
| Tenant-scoped DAL; cross-tenant reads impossible (test) | ✅ | `lib/tenancy/db.ts`; `audits/platform/VERIFY-LOG.md` — 16/16 incl. both isolation directions and the legacy-null rule |
| Portal behaves identically end-to-end | ✅ | 49/49 smoke pages + 15/15 byte-identical screens after every slice |

## Phase 1 — second layout + skins (accepted 2026-07-22)

| Criterion | Status | Evidence |
|---|---|---|
| `dashboard-v1` layout complete, all features rendering | ✅ | `components/layouts/dashboard-v1/` (both shells + the Today home); same prop contracts as journey-v1; 49/49 smoke against the registry |
| `clinical-light` + `celestial-dark`; skin × layout combos render acceptably | ✅ | `styles/skins/*.css` on the warm-clay token contract; eyeballed screenshots of dashboard-v1 in both skins, desktop + mobile; journey-v1 × warm-clay byte-identical every slice |
| Layout/skin switch on a DEMO tenant is config-only | ✅ | `audits/platform/phase1-switch.ts` — 12/12 incl. a live config flip with the server running (see VERIFY-LOG) |

## Honest scope notes (the strangler continues)

- **Phase 0.5 (pulled forward):** every table now carries `tenantId`
  directly (migration 34) and the DAL covers all 66 scoped models through one
  factory/code path. The isolation proof runs both directions against every
  table with a real tenant-B row inserted per table (parent chains included).
  Feature code still migrates onto `tenantDb` progressively; the door check
  (`getSessionUser` host↔tenant) holds regardless.
- Host→tenant resolution runs server-side in `lib/tenancy` (Node), not edge
  middleware (no DB at the edge). A `TenantDomain` table takes over
  custom-domain mapping when a second custom-domain tenant exists.
- New rows are stamped with their tenant at creation (seed + invite
  acceptance); legacy null rows belong to the default tenant only.
- `journey-v1` and `warm-clay` are now immutable while she lives on them —
  improvements become `journey-v2` / new skins, her opt-in.
