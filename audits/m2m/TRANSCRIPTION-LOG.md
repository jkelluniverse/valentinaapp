# C38-B transcription attribution — 2026-10-06T20:39:50.811Z
SCOPE: hosts a.m2m.test, b.m2m.test · HTTP only, no browser viewport · local build on :3150 + mock AssemblyAI on :3151. NOT covered: production, the real provider, any route but /api/webhooks/transcription (ruling 208).

## the host is IGNORED (the check ruling 238 exists for)
- ✓ A's capture id sent with B's Host header is accepted AND attributed (200, not a drop) — HTTP 200
- ✓ …and completes into TENANT A (status REVIEW, draft in A) — status=REVIEW draftsA=1
- ✓ …and tenant B received NOTHING from it — draftsB=0

## positive control — the route DOES write, for the right tenant
- ✓ B's capture id (sent with A's Host) completes into tenant B — HTTP 200 draftsB=1
- ✓ …and A's count is unchanged — draftsA=1

## unknown captureId — dropped, not guessed
- ✓ an unknown capture id is acknowledged (200) AND says so, so the provider stops retrying — HTTP 200 note=unknown capture — dropped
- ✓ …and created no draft anywhere — 2 drafts across A+B

## the caller checks still hold
- ✓ a bad capture token is refused (403) — HTTP 403

ALL CHECKS PASS
