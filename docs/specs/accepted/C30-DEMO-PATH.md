# C30-DEMO-PATH

Header: C30-DEMO-PATH · depends-on C23-SIGNUP, C23-CAPTURE, C23-REFERRAL, C29 ·
Priority P1 — it is the only gate that tests the thing being demonstrated · 2026-09-15.
Dispatched by the Architect in the C29 review (ruling 49).

## WHY THIS EXISTS

Every gate in the standing set tests a component. Nothing tests the path Jacob walks on
Sept 23. The four event surfaces were verified separately and the seams between them
were exactly where C25, C26, C27 and C29 defects lived. A manual rehearsal proves the
path once; a gate proves it after every change between now and the freeze. If something
breaks it on Sept 19, a manual rehearsal on Sept 18 will not have caught it.

## ASSUMPTIONS TO VERIFY, NOT TRUST — the Architect's belief, not fact. Disproving any is valuable.

A1. I believe the full path can run headless in one process against a seeded DB:
    GET /join (JS disabled) → POST → thanks screen carrying a referral code →
    GET /signup?ref=<code> → POST → a provisioned tenant → GET that tenant's portal
    on its own host. If any step needs a real browser or a vendor call, say which.
A2. I believe the referral code on the /join thanks screen is the same code /signup
    accepts, with no transformation. Verify the actual strings match.
A3. I believe a signup through this path lands ACTIVE + FOUNDING_COMP + journey-v1 +
    warm-clay + three modules, and creates NO Stripe object. Assert all of it.
A4. I believe the hardcoded absolute chromium path in six files blocks any browser-based
    approach on any machine but this one. If so, this gate must be HTTP-level, not
    browser-level. Confirm before choosing an approach.
A5. I believe the new tenant's portal and /book render that tenant's name and NOT
    "veritas" / "Valentina" anywhere. This is the C29 fix observed end to end.

## STANDING LAWS THAT BITE

Law 2 (no price on any screen — assert no dollar figure and no "free" on /join, the
thanks screen, or /signup). Law 5 (server-side). Law 7 (run the whole path in ES as
well as EN). Law 10 (engage stays CLOSED — this gate must not send mail; assert zero
sends). Ruling 34 (no moving git ref).

## BUILD ORDER

1. A fixture tenant slug reserved for this gate, torn down and recreated each run so
   the gate is idempotent. Never reuse or touch the default tenant.
2. The path, HTTP-level, EN.
3. The same path, ES, asserting the ES surfaces render in Spanish.
4. Negative assertions: no price string, no cross-tenant leak of "veritas"/"Valentina"
   on the new tenant's surfaces, no mail sent, no Stripe object, no null-tenant row.
5. Wire it into the standing set. Run it BEFORE the stamp-audit, which stays last.

## VERIFY

V1. A1-A5 each answered with evidence; any disproved assumption reported, not worked
    around.
V2. Full path green in EN, with the tenant's host serving its own portal.
V3. Full path green in ES.
V4. Negative assertions all green, each named.
V5. Gate is idempotent — run it twice in a row, both green, no residue.
V6. Demonstrated able to fail: break one link (e.g. a bad ref code), show the gate
    trips, revert, quote both outputs.
V7. Standing set green, C30 included, stamp-audit LAST, exit 0.
V8. Ruling 49 recorded: the demo path is verified by gate, and the manual rehearsal
    confirms the gate rather than substituting for it.

## OUT OF SCOPE — DO NOT BUILD

C28. Brand-web. The platform apex. F2's remainder. Fixing the chromium path. Sending
any mail. Touching the default tenant, Valentina's data, or the engage gate. Any
change to the four event surfaces themselves — if this gate finds a defect in them,
REPORT it, do not fix it, and stop for dispatch.
