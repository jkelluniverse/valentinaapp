# PASSWORD-RESET verify — 2026-09-19T21:09:54.347Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/ead4f3a0d95f43b61fe6cab9679357cf72fb63a1d0c9cba466b39a173f08e05e?error=short
- ✓ mismatched confirm rejected — /reset/ead4f3a0d95f43b61fe6cab9679357cf72fb63a1d0c9cba466b39a173f08e05e?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
