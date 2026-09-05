# AMD-06 verify (mechanics) — 2026-09-05T22:45:25.063Z

## Temp password — Rosa
- ✓ temp password verifies against the stored hash
- ✓ mustChangePassword forces the /must-change gate
- ✓ sessionVersion bumped — stale sessions dead
- ✓ choosing their own password clears the gate

## Phone purchase — María
- ✓ charge carries channel PRACTITIONER_ASSISTED + required note
- ✓ mark-paid settles and ACTIVATES the package — sessions=6
- ✓ invoice path: attributed DUE charge awaits the shared invoice flow
- ✓ card path invisible without card-on-file consent
  · (no Square link on scratch — consent open/close asserted structurally elsewhere)

## Assist grant + worksheet — Ben
- ✓ fresh grant is live (30-minute window)
- ✓ expired grant is dead by the same conditions
- ✓ exit stamps endedAt — the grant can never be reused

## The audit spine
- ✓ every tool above landed attributed audit lines
- ✓ audit rows carry actor + on-behalf-of, metadata only

ALL CHECKS PASS

Staging walkthrough (request-bound layer): enter assist from a Portrait → wine banner on every /space screen · consent+payment+security+export+deletion+resonance blocked with the quiet notice · message send returns "assist" · exit returns to the Portrait · the client's settings show the "Valentina helped" line (+ email if the toggle is on).
