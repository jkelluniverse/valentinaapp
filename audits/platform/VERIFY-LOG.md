# PLATFORM Phase 0/0.5 verify — 2026-07-22T15:23:53.113Z

## Tenant #1
- ✓ tenant row exists (slug valentina)
- ✓ fixed id matches the DAL constant — tnt_valentina_000000001
- ✓ journey-v1 + warm-clay
- ✓ her three panels as generic module keys — archetypal-keys, body-graph, values-spiral
- ✓ her branded names live in settings, not code — Human Design · Gene Keys · Values spiral

## Null-tenant rows (default-owned by rule; informational)
  · psycheNode: 47 null-tenant rows
  · lensResult: 13 null-tenant rows
  · note: 64 null-tenant rows
  · message: 212 null-tenant rows
  · worksheetAssignment: 14 null-tenant rows
  · worksheetResponse: 13 null-tenant rows
  · recordItem: 284 null-tenant rows
  · logEntry: 271 null-tenant rows
- ✓ null-tenant rows enumerated (all default-owned) — 8 of 66 tables hold legacy-null rows

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

# Phase 2 — module registry + intake schema builder (2026-07-22)

Run: `audits/platform/phase2-verify.ts` — 16/16.

## Registry (Rule 0.4 / 5.1)
- ✓ body-graph, archetypal-keys, values-spiral registered as structured-content
  panel modules — their data pipelines untouched, the registry only frames them
- ✓ module code is trademark-free; her labels AND her exact panel copy live in
  TenantModule.settings (migration 35), components hold neutral defaults only
- ✓ /space/design renders panels through panelsFor(rows) — byte-identical
  baseline proves her page did not move

## Intake schema builder
- ✓ her derived intake: identity → birth → values question-set
- ✓ birth data deduped across modules; asked once
- ✓ birth-time-unknown path: both chart modules declare graceful degradation

## DEMO tenant zero-code toggle
- ✓ values-only tenant generates NO birth step; one panel; tenant's own label
- ✓ one row insert (body-graph) adds the birth step, changes the schema hash,
  and prepends the panel — no code, no deploy
- ✓ disabling the row reverses both; her schema hash never moved

PHASE 2 VERIFY PASS — 16/16
