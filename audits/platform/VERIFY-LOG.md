# PLATFORM Phase 0 verify — 2026-07-21T21:03:37.512Z

## Tenant #1
- ✓ tenant row exists (slug valentina)
- ✓ fixed id matches the DAL constant — tnt_valentina_000000001
- ✓ journey-v1 + warm-clay
- ✓ her three panels as generic module keys — archetypal-keys, body-graph, values-spiral
- ✓ her branded names live in settings, not code — Human Design · Gene Keys · Values spiral

## Backfill
- ✓ every user row carries her tenantId — null-tenant users: 0
- ✓ practice tables backfilled (worksheets)

## Cross-tenant isolation (the DAL)
- ✓ her tenant never sees tenant B's user — her visible users: 17
- ✓ tenant B sees exactly its own row — tenant B visible users: 1
- ✓ tenant B never sees her practitioner
- ✓ legacy null-tenant rows belong to the DEFAULT tenant only

## Host resolution
- ✓ custom domain resolves the default tenant (no PLATFORM_DOMAIN set)
- ✓ subdomain resolves its slug
- ✓ apex resolves the default tenant
- ✓ foreign host resolves the default tenant
- ✓ nested subdomain never leaks a slug

ALL CHECKS PASS
