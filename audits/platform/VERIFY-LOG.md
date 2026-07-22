# PLATFORM Phase 0/0.5 verify — 2026-07-21T21:22:55.895Z

## Tenant #1
- ✓ tenant row exists (slug valentina)
- ✓ fixed id matches the DAL constant — tnt_valentina_000000001
- ✓ journey-v1 + warm-clay
- ✓ her three panels as generic module keys — archetypal-keys, body-graph, values-spiral
- ✓ her branded names live in settings, not code — Human Design · Gene Keys · Values spiral

## Backfill (all tables)
- ✓ every row in every scoped table carries her tenantId — 66 tables checked

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

# Phase 1 — dashboard-v1 + skins + the DEMO switch (2026-07-22)

Run: `audits/platform/phase1-switch.ts` against the scratch dataset with the
built app on :3108 and PLATFORM_DOMAIN=platform.test. A DEMO tenant is
provisioned by row inserts alone, served on its subdomain, and re-arranged by
a config UPDATE while the server keeps running. Self-cleaning.

## Config is data
- ✓ demo host serves login wearing clinical-light
- ✓ demo practitioner gets dashboard-v1 (sidebar + Today home)
- ✓ config UPDATE alone flips the live portal to celestial-dark + journey-v1
  (no deploy, no restart — the 60s tenant cache is the only delay)
- ✓ default host stays journey-v1 + warm-clay throughout

## Isolation at the feature level
- ✓ demo roster shows only the demo client — none of the default tenant's people
- ✓ no cross-tenant unread badge (regression: the practitioner layout's unread
  count now goes through the DAL)
- ✓ demo session refused on the default host (door check, 307)

## Render acceptance (eyeballed screenshots, desktop + mobile)
- ✓ dashboard-v1 × clinical-light
- ✓ dashboard-v1 × celestial-dark
- ✓ journey-v1 × warm-clay — byte-identical baseline, every slice

SWITCH TEST PASS — 12/12
