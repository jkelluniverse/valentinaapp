# C31-TENANT-CHROME-REMAINDER

Header: C31 · depends-on C29, C30 · Priority P1, it is on the demo path · 2026-09-15.
Dispatched by the Architect in the C30 in-flight review. BUILD ONLY after C30 is merged
and the stale-server question is answered (both done — see the C30 report; the build
itself awaits the Architect's read of the stale-server scope answer per the stop clause).

## WHY THIS EXISTS

C29 redirects a non-default tenant's root to its own /book. C30 then measured what a
founding practitioner actually lands on: /book carries Valentina's logo and name in the
header and footer (6 occurrences) and her metadata including the tab title (8), and the
portal's tab still reads Veritas for tenant B. So the demo's happy path currently ends
on another practitioner's brand. That is the exact harm C29 existed to prevent, one
surface further down. Ruling 54 puts this in scope.

## ASSUMPTIONS TO VERIFY, NOT TRUST — the Architect's belief, not fact. Disproving any is valuable.

A1. I believe the root layout can resolve the wordmark and metadata per tenant using the
    same expression C29's AuthWordmark and the portal shells already use, and that this
    is a chrome change only.
A2. I believe the default tenant's output stays byte-identical throughout, so no
    acceptance gate is needed — same argument C29 made and proved.
A3. I believe making the root layout host-aware does NOT force static routes dynamic
    beyond what C29 already accepted. If it does, say which routes and stop.
A4. I believe your enumerated counts (6 chrome + 8 metadata on /book, portal tab) are
    complete. Re-derive them; do not trust my restatement of your own number.
A5. I believe none of this touches the marketing COPY on /book or the homepage. If a
    fix cannot be made without changing copy, stop and report — that is brand-web's.

## STANDING LAWS

Law 5 server-side · Law 7 EN/ES parity on anything you touch · ruling 11 baseline ·
client-visible chrome requires acceptance — Valentina's surfaces must be byte-identical,
which is how you avoid needing her acceptance at all.

## BUILD ORDER

1. Root layout metadata resolves per tenant. Default output byte-identical.
2. /book chrome — header, footer, logo, tab title, metadata — resolves per tenant.
   Copy untouched.
3. Retire the C30 quarantine pins these fixes make obsolete, per ruling 50, naming each.
4. 16-screen baseline captured before any code change, diffed after.

## VERIFY

V1. A1-A5 answered with evidence.
V2. Default tenant byte-identical on /book, the portal shell, and the four auth pages.
V3. 16-screen baseline MATCH.
V4. C30 re-run: tenant B's /book and portal show ZERO "veritas"/"Valentina" chrome
    occurrences. The pins are removed, not lowered.
V5. Demonstrated able to fail: revert one resolution, show C30 trips, restore.
V6. Standing set green, count move named, stamp-audit LAST, exit 0.
V7. (Added per the Architect's ledger-fill instruction, 2026-09-15, if C31 touches
    platform mail chrome — otherwise this item transfers to the next build that does:)
    the RENDERED platform email footer contains `Kell Systems Consulting, LLC` VERBATIM
    — comma and period included. The ledger recording the value and the footer printing
    it are two different facts. HONEST LIMIT: local gates inject their own test
    entities by design (email-identity uses "T27 Entity, Inc.", engage uses "Engage
    Verify Entity" — surveyed 2026-09-15, no gate or fixture asserts a stale
    production string), so the verbatim assertion needs an environment where the real
    value is set: a staging-rendered footer or Jacob's eyes on a real send.

## OUT OF SCOPE — DO NOT BUILD

Marketing copy on /book or the homepage. The platform apex. C28. Brand-web assets.
Sending mail. The chromium path. Touching Valentina's data or the engage gate.
