# PASSWORD-RESET verify — 2026-09-30T16:03:30.998Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/ccba0cc2a85294afc75b6d330f4bbba39d7b97686c9a82c7dfbe7e51f8f52a68?error=short
- ✓ mismatched confirm rejected — /reset/ccba0cc2a85294afc75b6d330f4bbba39d7b97686c9a82c7dfbe7e51f8f52a68?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
