# PASSWORD-RESET verify — 2026-09-21T22:16:07.630Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/3e6a8e8cfd4650951bdb67c04cd5215bff13f35d33d7e81cb15012e92370ab54?error=short
- ✓ mismatched confirm rejected — /reset/3e6a8e8cfd4650951bdb67c04cd5215bff13f35d33d7e81cb15012e92370ab54?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
