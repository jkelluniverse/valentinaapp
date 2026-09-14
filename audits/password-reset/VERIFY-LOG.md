# PASSWORD-RESET verify — 2026-09-14T17:01:35.504Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/b6683d8511f1c4c13b8e18a321367f07f5c0bb6a63d552c0ea6bf2bc196d28ae?error=short
- ✓ mismatched confirm rejected — /reset/b6683d8511f1c4c13b8e18a321367f07f5c0bb6a63d552c0ea6bf2bc196d28ae?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
