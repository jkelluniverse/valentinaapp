# C35-FOUNDERS-EVENT verify — 2026-09-23T18:53:37.183Z
- ✓ the founding page renders on the PLATFORM host — status 200
- ✓ a TENANT host still 404s — no founding funnel on a practice's domain — status 404
- ✓ V3 — every dollar figure on the page is one of ruling 175's (4 distinct found) — all of: $99 $149 $500 $199
- ✓ V4 — ruling 176: no seat counter or 'remaining' language anywhere — none
- ✓ …and the fixed statement of terms IS present
- ✓ ruling 188 — Practice Manager agent / morning brief / admin-VA seat are ABSENT — none
- ✓ …and 'One practitioner seat' IS the stated seat line
- ✓ ruling 189 — the founding page links to /signup NOWHERE — none
- ✓ …and the apply CTA is present
- ✓ the card's ?source= switches the hero eyebrow to the event wording
- ✓ …and the apply link carries the source onward
- ✓ the Addendum link is ABSENT while the document does not exist (no placeholder, no 404)
- ✓ …while the terms SUMMARY does ship
- ✓ the FAQ is native <details>/<summary>, so it opens with JS disabled — 11 <details> elements
- ✓ the application form renders and carries a server-action id
- ✓ a JS-DISABLED application submission writes the prospect — http 303 · row created
- ✓ RULINGS 179/181 — the STORED source is the card TAG, not "web" and not the raw ?source= — stored source = "event-psychk-ftl-2026" (expected event-psychk-ftl-2026)
- ✓ the application-only answers land in applicationMeta (migration 53, additive) — keys: appliedAt,modalities,arrivedFrom,feedbackCallsConfirmed
- ✓ ruling 189 — applying provisions NOTHING: no tenant on the row — tenantId=null convertedAt=null

FOUNDERS VERIFY PASS — 19/19
