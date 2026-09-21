# demo-path VERIFY-LOG (gate-written, ruling 17)

Last run: 2026-09-21T16:51:18.429Z

# C30-DEMO-PATH verify — 2026-09-21T16:51:12.280Z
# the full event path over HTTP, EN and ES, against throwaway practices ("c30-demo-en", "c30-demo-es")
- ✓ EN — /join renders in EN with no price and no "free" (law 2) — status 200; heading present: true; law2: true
- ✓ EN — /join POST (no-JS server action) lands on the thanks screen with a code — 303 → /join/thanks?code=VYFMKCB5
- ✓ EN — thanks screen displays the referral code, in EN, law-2 clean — displayed "VYFMKCB5"
- ✓ EN — /signup renders in EN, carries ref="VYFMKCB5" untransformed, law-2 clean
- ✓ EN — /signup POST provisions and lands on the welcome screen — 303 → /signup/welcome?slug=c30-demo-en&email=c30-founder-en%40fixture.test&code=A7Y9YV63
- ✓ EN — welcome screen renders in EN and names the portal host
- ✓ EN — tenant is ACTIVE + journey-v1 + warm-clay — ACTIVE|journey-v1|warm-clay
- ✓ EN — exactly the three standard modules — archetypal-keys,body-graph,values-spiral
- ✓ EN — FOUNDING_COMP and ZERO Stripe objects — FOUNDING_COMP|NULL|NULL
- ✓ EN — A2: the founder's stored referredByCode IS the displayed string, byte-equal — SIGNED_UP|VYFMKCB5
- ✓ EN — the referrer stays LEAD and owns that code — LEAD|VYFMKCB5
- ✓ EN — c30-demo-en.psx.test/login wordmark and tab title are the practice's; zero veritas/valentina visible (C29, observed end to end) — status 200; practice in visible: true; veritas=0, valentina=0
- ✓ EN — c30-demo-en.psx.test/ 307s to /book (C29 redirect, never Valentina's marketing page) — 307 → http://c30-demo-en.psx.test:3160/book
- ✓ EN — c30-demo-en.psx.test/book is the PRACTICE's page: header/footer/empty-state name it, tab title carries it, ZERO veritas/valentina anywhere visible (C31 — the C30 quarantine pins RETIRED, not lowered) — valentina=0, veritas=0 (visible incl. head); title suffix present: true
- ✓ EN — the founder signs in; the portal — SCREEN AND TAB — is THEIR practice's: title carries it, ZERO veritas/valentina anywhere visible (C31 — the portal-metadata quarantine pin RETIRED) — status 200; veritas=0, valentina=0 (visible incl. head)
- ✓ ES — /join renders in ES with no price and no "free" (law 2) — status 200; heading present: true; law2: true
- ✓ ES — /join POST (no-JS server action) lands on the thanks screen with a code — 303 → /join/thanks?code=GZ2D8R45&lang=es
- ✓ ES — thanks screen displays the referral code, in ES, law-2 clean — displayed "GZ2D8R45"
- ✓ ES — /signup renders in ES, carries ref="GZ2D8R45" untransformed, law-2 clean
- ✓ ES — /signup POST provisions and lands on the welcome screen — 303 → /signup/welcome?slug=c30-demo-es&email=c30-founder-es%40fixture.test&code=92Y6NRT8&lang=es
- ✓ ES — welcome screen renders in ES and names the portal host
- ✓ ES — tenant is ACTIVE + journey-v1 + warm-clay — ACTIVE|journey-v1|warm-clay
- ✓ ES — exactly the three standard modules — archetypal-keys,body-graph,values-spiral
- ✓ ES — FOUNDING_COMP and ZERO Stripe objects — FOUNDING_COMP|NULL|NULL
- ✓ ES — A2: the founder's stored referredByCode IS the displayed string, byte-equal — SIGNED_UP|GZ2D8R45
- ✓ ES — the referrer stays LEAD and owns that code — LEAD|GZ2D8R45
- ✓ ES — c30-demo-es.psx.test/login wordmark and tab title are the practice's; zero veritas/valentina visible (C29, observed end to end) — status 200; practice in visible: true; veritas=0, valentina=0
- ✓ ES — c30-demo-es.psx.test/ 307s to /book (C29 redirect, never Valentina's marketing page) — 307 → http://c30-demo-es.psx.test:3160/book
- ✓ ES — c30-demo-es.psx.test/book is the PRACTICE's page: header/footer/empty-state name it, tab title carries it, ZERO veritas/valentina anywhere visible (C31 — the C30 quarantine pins RETIRED, not lowered) — valentina=0, veritas=0 (visible incl. head); title suffix present: true
- ✓ ES — the founder signs in; the portal — SCREEN AND TAB — is THEIR practice's: title carries it, ZERO veritas/valentina anywhere visible (C31 — the portal-metadata quarantine pin RETIRED) — status 200; veritas=0, valentina=0 (visible incl. head)
- ✓ law 10 — ZERO mail left the process: the Resend sink counted 0 hits with every sending credential stripped — sink hits: 0
- ✓ law 10 — zero engage rows for the fixture prospects (the gate stays CLOSED) — 0
- ✓ no null-tenant row anywhere the path touches — 0 null-tenant rows
- ✓ self-cleaning — no fixture residue after the run — 00

34/34 checks passed
