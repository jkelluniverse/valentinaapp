# C29-EVENT-CHROME verify — 2026-09-15T21:17:16.719Z

## Verify 1 — the five assumptions, confirmed or corrected
- ✓ A1 CONFIRMED-AND-WIDENED — the four auth files were the complete set of hardcoded `veritas ✧` CHROME (now zero); the .ics UIDs, export filenames, webhook header and storage keys are NOT chrome and are untouched — AND the sweep found one more identity literal the spec missed: /book's empty-slots copy named Valentina on every host (fixed with the same tenant-resolving pattern, default tenant byte-identical) — files still carrying a hardcoded wordmark: none · non-chrome veritas strings intact (uid/filename/header/keys)
- ✓ A2 CONFIRMED — the default tenant's branding.portalTitle IS exactly "veritas", in the live row AND in migration 33's canonical INSERT (which production carries) — the no-acceptance argument stands on data, not hope — db="veritas" · migration 33 carries it
- ✓ A3 CONFIRMED — the public wall covers app/(public)/** only and bans auth/prisma imports there; /login etc. live OUTSIDE it and @/lib/tenancy is resolution plumbing, not a banned import — the wall is untouched (lint:wall green in regression) — wall scope verified from its own source

## Rig — practice B (real signup), the errprobe role
- ✓ a real ACTIVE non-default practice exists; signup gave it its own portalTitle — tenant B = cmu36aasd000112keaen5qqtq · portalTitle="T29 Bright Practice"

## Verify 2 + 5 — THE SHIPPABILITY CHECK: the default tenant's five pinned surfaces, byte-identical to f07a035
- ✓ V2 — default tenant /login BYTE-IDENTICAL to the f07a035 fixture (normalized as documented; every rendered byte compared) — 2901 normalized bytes identical
- ✓ V2 — default tenant /forgot BYTE-IDENTICAL to the f07a035 fixture (normalized as documented; every rendered byte compared) — 2589 normalized bytes identical
- ✓ V2 — default tenant /reset/t29-dummy-token.x BYTE-IDENTICAL to the f07a035 fixture (normalized as documented; every rendered byte compared) — 2091 normalized bytes identical
- ✓ V2 — default tenant /must-change BYTE-IDENTICAL to the f07a035 fixture (normalized as documented; every rendered byte compared) — 19 normalized bytes identical
- ✓ V5 — default tenant / BYTE-IDENTICAL to the f07a035 fixture (normalized as documented; every rendered byte compared) — 13489 normalized bytes identical
- ✓ V5-book (fixture captured from a checkout-and-build of f07a035 — a real before/after, ruling 45) — default tenant /book BYTE-IDENTICAL to the f07a035 fixture (normalized as documented; every rendered byte compared) — 4667 normalized bytes identical
- ✓ RULING-44 CANNOT-HIDE — the RAW identity-string counts (whole body, scripts included) match the f07a035 fixture on every pinned page, modulo ONE named+justified delta (/login veritas +1, the wordmark serialized as RSC slot data — found by this check itself); any unnamed delta fails — counts match across 6 pages × 2 strings (1 named delta applied)

## Verify 3 — practice B's auth chrome is B's
- ✓ V3 — practice B's /login renders B's OWN wordmark and the string `veritas` appears NOWHERE in the VISIBLE response (scripts carry the pre-existing `veritas-theme` storage key — data, not chrome) — status=200 · B wordmark visible=true · veritas in visible html=false

## Verify 4 + A5 — practice B's public root lands on B's own booking surface
- ✓ V4 — B's root REDIRECTS to /book (no per-practice marketing page invented): the landing is the BOOKING page, not the marketing home. (The /book page's own static copy is Valentina's on every host today — the F2 remainder, brand-web scope, documented in the report.) — / → 307 → 200 · booking heading present=true · marketing-home copy absent=true
- ✓ A5 ANSWERED-AND-FIXED — a practice with NO availability lands on the honest empty state naming ITS OWN practice, never 'Valentina will find a time' (the pre-change copy said that on every host); the default tenant's copy is byte-unchanged (covered by V2/V5) — empty-slots names=true · 'Valentina will find a time' absent=true

## Verify 6 — an unknown slug behaves exactly as today
- ✓ V6 — unknown slug: root serves the default marketing home (200, no redirect) and /login the default wordmark — the documented unknown-slug behavior, unchanged — / → 200 · /login wordmark=veritas

## Verify 7 + A4 — under C26's injected failure, nothing borrows a wordmark
- ✓ V7/A4 — under resolution failure, B's /login renders NO wordmark at all in the VISIBLE html (no veritas, no practice name — C26's neutral shell) and the root does not redirect into a form that cannot be submitted — /login → 200 · veritas visible=false · practice name visible=false · / → 200
- ✓ SELF-CLEANING — probe practice and role are gone — rows 0 · role gone

EVENT-CHROME VERIFY PASS — 17/17
