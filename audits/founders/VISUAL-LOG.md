# C35 VISUAL verify — 2026-09-28T16:51:06.369Z

**SCOPE.** Host `psychefolio.test`, path `/founders`, local production build on :3148.
Viewports asserted (mobile first, ruling 207): mobile-375 375x812 · mobile-390 390x844 · tablet-768 768x1024 · desktop-1440 1440x900.
NOT covered: production pixels (proxy CA), real devices, touch, and any viewport absent from that list.

# mobile-375 — 375x812 (mobile)
- ✓ [mobile-375] the gate measured the real page (>=60 text nodes) — 123 nodes
- ✓ [mobile-375] the document does not scroll horizontally — scrollWidth 375 vs viewport 375
- ✓ [mobile-375] no element extends past the viewport — none
- ✗ [mobile-375] no text sits inside a container collapsed to zero width — 7: <DIV> "A founding rate for the first twen" · <DIV> "Practice-level access at the Solo " · <DIV> "Receive the complete Practice plan" · <LI> "Founding pricing from the first mo"
- ✗ [mobile-375] no prose is crushed below 5px of width per character — 1.92px/char 71px "Founding pricing from the first month" · 2.53px/char 76px "Direct product feedback access" · 2.55px/char 102px "Priority participation in early releases" · 2.33px/char 93px "Recognition as one of the first twenty p"
- ✓ [mobile-375] every text node meets AA (123 measured) — all pass
- ✓ [mobile-375] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [mobile-375] every rendered colour is on-palette — 8 distinct
- ✓ [mobile-375] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [mobile-375] the lockup renders large enough to READ (>=40px tall) — 150x63
- ✗ [mobile-375] no price figure appears more than once — $99x4 · $149x4 · $500x3
- ✓ [mobile-375] single-column flow: no content container is still multi-column — none
- ✗ [mobile-375] horizontal padding is the brief's 20-24px — 16px
- ✓ [mobile-375] the price card uses full width (>= viewport - 2x24px) — 375px of 375
- ✗ [mobile-375] the hero CTA appears BEFORE the price card — false
- ✗ [mobile-375] FAQ tap targets are >=44px tall — 25px "Who is the founding program fo" · 25px "Is this a free trial?" · 25px "What happens after the first y" · 25px "How are the 20 seats selected?" · 25px "What do I need to contribute?" · 25px "Can I switch plans later?" · 25px "What if I need to pause?" · 25px "Are clients limited?"
- ✓ [mobile-375] baseline created (first run) — 664016 bytes

# mobile-390 — 390x844 (mobile)
- ✓ [mobile-390] the gate measured the real page (>=60 text nodes) — 123 nodes
- ✓ [mobile-390] the document does not scroll horizontally — scrollWidth 390 vs viewport 390
- ✓ [mobile-390] no element extends past the viewport — none
- ✗ [mobile-390] no text sits inside a container collapsed to zero width — 7: <DIV> "A founding rate for the first twen" · <DIV> "Practice-level access at the Solo " · <DIV> "Receive the complete Practice plan" · <LI> "Founding pricing from the first mo"
- ✗ [mobile-390] no prose is crushed below 5px of width per character — 1.92px/char 71px "Founding pricing from the first month" · 2.53px/char 76px "Direct product feedback access" · 2.55px/char 102px "Priority participation in early releases" · 2.33px/char 93px "Recognition as one of the first twenty p"
- ✓ [mobile-390] every text node meets AA (123 measured) — all pass
- ✓ [mobile-390] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [mobile-390] every rendered colour is on-palette — 8 distinct
- ✓ [mobile-390] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [mobile-390] the lockup renders large enough to READ (>=40px tall) — 150x63
- ✗ [mobile-390] no price figure appears more than once — $99x4 · $149x4 · $500x3
- ✓ [mobile-390] single-column flow: no content container is still multi-column — none
- ✗ [mobile-390] horizontal padding is the brief's 20-24px — 16px
- ✓ [mobile-390] the price card uses full width (>= viewport - 2x24px) — 390px of 390
- ✗ [mobile-390] the hero CTA appears BEFORE the price card — false
- ✗ [mobile-390] FAQ tap targets are >=44px tall — 25px "Who is the founding program fo" · 25px "Is this a free trial?" · 25px "What happens after the first y" · 25px "How are the 20 seats selected?" · 25px "What do I need to contribute?" · 25px "Can I switch plans later?" · 25px "What if I need to pause?" · 25px "Are clients limited?"
- ✓ [mobile-390] baseline created (first run) — 663451 bytes

# tablet-768 — 768x1024 (tablet)
- ✓ [tablet-768] the gate measured the real page (>=60 text nodes) — 123 nodes
- ✓ [tablet-768] the document does not scroll horizontally — scrollWidth 768 vs viewport 768
- ✓ [tablet-768] no element extends past the viewport — none
- ✓ [tablet-768] no text sits inside a container collapsed to zero width — none
- ✓ [tablet-768] no prose is crushed below 5px of width per character — 93 prose blocks, thinnest 5.35px/char
- ✓ [tablet-768] every text node meets AA (123 measured) — all pass
- ✓ [tablet-768] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [tablet-768] every rendered colour is on-palette — 8 distinct
- ✓ [tablet-768] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [tablet-768] the lockup renders large enough to READ (>=56px tall) — 150x63
- ✗ [tablet-768] no price figure appears more than once — $99x4 · $149x4 · $500x3
- ✓ [tablet-768] the price card is no narrower than the brief's 360px — 768px
- ✓ [tablet-768] baseline created (first run) — 636884 bytes

# desktop-1440 — 1440x900 (desktop)
- ✓ [desktop-1440] the gate measured the real page (>=60 text nodes) — 127 nodes
- ✓ [desktop-1440] the document does not scroll horizontally — scrollWidth 1440 vs viewport 1440
- ✓ [desktop-1440] no element extends past the viewport — none
- ✓ [desktop-1440] no text sits inside a container collapsed to zero width — none
- ✓ [desktop-1440] no prose is crushed below 5px of width per character — 94 prose blocks, thinnest 5.13px/char
- ✓ [desktop-1440] every text node meets AA (127 measured) — all pass
- ✓ [desktop-1440] VERITAS wine/mocha appear ZERO times — 0 occurrences
- ✓ [desktop-1440] every rendered colour is on-palette — 8 distinct
- ✓ [desktop-1440] the lockup loads and is the PRIMARY asset — src=/brand/lockup-primary-reversed.svg
- ✓ [desktop-1440] the lockup renders large enough to READ (>=56px tall) — 150x63
- ✗ [desktop-1440] no price figure appears more than once — $99x4 · $149x4 · $500x3
- ✓ [desktop-1440] baseline created (first run) — 638217 bytes

14 CHECK(S) FAILED — 45/59
