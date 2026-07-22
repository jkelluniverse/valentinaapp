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
