# C35 VISUAL verify — 2026-09-28T17:53:27.595Z

**SCOPE.** Host `psychefolio.test`, path `/founders`, local production build on :3148.
Viewports asserted (mobile first, ruling 207): mobile-375 375x812 · mobile-390 390x844 · tablet-768 768x1024 · desktop-1440 1440x900.
NOT covered: production pixels (proxy CA), real devices, touch, and any viewport absent from that list.

# ruling 203 — a tenant host's /founders
- ✓ a tenant host is refused with 404 — HTTP 404
- ✓ …and its response carries ZERO founding-page content, not merely a 404 status — 7039 bytes, none of the 7 markers present
- ✓ positive control: the platform host DOES serve that content — HTTP 200, 3/3 markers, 122883 bytes

# mobile-375 — 375x812 (mobile)
- ✓ [mobile-375] the gate measured the real page (>=60 text nodes) — 117 nodes
- ✓ [mobile-375] the document does not scroll horizontally — scrollWidth 376 vs viewport 375
- ✓ [mobile-375] no element extends past the viewport — none
- ✓ [mobile-375] no text sits inside a container collapsed to zero width — none
- ✓ [mobile-375] no prose is crushed below 5px of width per character — 91 prose blocks, thinnest 6.22px/char
- ✓ [mobile-375] every text node meets AA (117 measured) — all pass
- ✓ [mobile-375] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [mobile-375] every rendered colour is on-palette — 8 distinct
- ✓ [mobile-375] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [mobile-375] the lockup renders large enough to READ (>=56px tall) — 168x71
- ✓ [mobile-375] every ratified figure appears at most ONCE, or as many times as is justified here — $99x2 · $149x2 · $500x1 · $199x1 — exceptions: $99 may appear 2x — the offer card, and the FAQ answer to 'What happens after the first year?' which cannot answer it without naming the rate it changes FROM · $149 may appear 2x — the offer card, and that same FAQ answer, which names the rate it changes TO
- ✓ [mobile-375] single-column flow: no content container is still multi-column — none
- ✓ [mobile-375] horizontal padding is the brief's 20-24px — 22px
- ✓ [mobile-375] the price card uses full width (>= viewport - 2x24px) — 331px of 375
- ✓ [mobile-375] the hero CTA appears BEFORE the price card — true
- ✓ [mobile-375] FAQ tap targets are >=44px tall — 11 targets, all >=44px
- ✓ [mobile-375] baseline created (first run) — 656503 bytes

# mobile-390 — 390x844 (mobile)
- ✓ [mobile-390] the gate measured the real page (>=60 text nodes) — 117 nodes
- ✓ [mobile-390] the document does not scroll horizontally — scrollWidth 390 vs viewport 390
- ✓ [mobile-390] no element extends past the viewport — none
- ✓ [mobile-390] no text sits inside a container collapsed to zero width — none
- ✓ [mobile-390] no prose is crushed below 5px of width per character — 91 prose blocks, thinnest 6.60px/char
- ✓ [mobile-390] every text node meets AA (117 measured) — all pass
- ✓ [mobile-390] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [mobile-390] every rendered colour is on-palette — 8 distinct
- ✓ [mobile-390] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [mobile-390] the lockup renders large enough to READ (>=56px tall) — 168x71
- ✓ [mobile-390] every ratified figure appears at most ONCE, or as many times as is justified here — $99x2 · $149x2 · $500x1 · $199x1 — exceptions: $99 may appear 2x — the offer card, and the FAQ answer to 'What happens after the first year?' which cannot answer it without naming the rate it changes FROM · $149 may appear 2x — the offer card, and that same FAQ answer, which names the rate it changes TO
- ✓ [mobile-390] single-column flow: no content container is still multi-column — none
- ✓ [mobile-390] horizontal padding is the brief's 20-24px — 22px
- ✓ [mobile-390] the price card uses full width (>= viewport - 2x24px) — 346px of 390
- ✓ [mobile-390] the hero CTA appears BEFORE the price card — true
- ✓ [mobile-390] FAQ tap targets are >=44px tall — 11 targets, all >=44px
- ✓ [mobile-390] baseline created (first run) — 652730 bytes

# tablet-768 — 768x1024 (tablet)
- ✓ [tablet-768] the gate measured the real page (>=60 text nodes) — 117 nodes
- ✓ [tablet-768] the document does not scroll horizontally — scrollWidth 768 vs viewport 768
- ✓ [tablet-768] no element extends past the viewport — none
- ✓ [tablet-768] no text sits inside a container collapsed to zero width — none
- ✓ [tablet-768] no prose is crushed below 5px of width per character — 91 prose blocks, thinnest 6.60px/char
- ✓ [tablet-768] every text node meets AA (117 measured) — all pass
- ✓ [tablet-768] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [tablet-768] every rendered colour is on-palette — 8 distinct
- ✓ [tablet-768] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [tablet-768] the lockup renders large enough to READ (>=88px tall) — 240x101
- ✓ [tablet-768] every ratified figure appears at most ONCE, or as many times as is justified here — $99x2 · $149x2 · $500x1 · $199x1 — exceptions: $99 may appear 2x — the offer card, and the FAQ answer to 'What happens after the first year?' which cannot answer it without naming the rate it changes FROM · $149 may appear 2x — the offer card, and that same FAQ answer, which names the rate it changes TO
- ✓ [tablet-768] the price card is no narrower than the brief's 360px — 720px
- ✓ [tablet-768] baseline created (first run) — 621840 bytes

# desktop-1440 — 1440x900 (desktop)
- ✓ [desktop-1440] the gate measured the real page (>=60 text nodes) — 121 nodes
- ✓ [desktop-1440] the document does not scroll horizontally — scrollWidth 1440 vs viewport 1440
- ✓ [desktop-1440] no element extends past the viewport — none
- ✓ [desktop-1440] no text sits inside a container collapsed to zero width — none
- ✓ [desktop-1440] no prose is crushed below 5px of width per character — 92 prose blocks, thinnest 5.13px/char
- ✓ [desktop-1440] every text node meets AA (121 measured) — all pass
- ✓ [desktop-1440] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [desktop-1440] every rendered colour is on-palette — 8 distinct
- ✓ [desktop-1440] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [desktop-1440] the lockup renders large enough to READ (>=88px tall) — 240x101
- ✓ [desktop-1440] every ratified figure appears at most ONCE, or as many times as is justified here — $99x2 · $149x2 · $500x1 · $199x1 — exceptions: $99 may appear 2x — the offer card, and the FAQ answer to 'What happens after the first year?' which cannot answer it without naming the rate it changes FROM · $149 may appear 2x — the offer card, and that same FAQ answer, which names the rate it changes TO
- ✓ [desktop-1440] baseline created (first run) — 640126 bytes

VISUAL VERIFY PASS — 62/62
