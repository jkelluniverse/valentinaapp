# PASSWORD-RESET verify — 2026-10-06T20:38:33.065Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/134bf88295f1f0bf67bab3ce3fa741ffc7dd7f1593517835fdfe56b5b8e310cc?error=short
- ✓ mismatched confirm rejected — /reset/134bf88295f1f0bf67bab3ce3fa741ffc7dd7f1593517835fdfe56b5b8e310cc?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
