# PASSWORD-RESET verify — 2026-09-19T21:44:51.869Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/b01497697773647d0c9f339bdb10d9028fbc8dbea3eb62c9f4b0d2ca237eca98?error=short
- ✓ mismatched confirm rejected — /reset/b01497697773647d0c9f339bdb10d9028fbc8dbea3eb62c9f4b0d2ca237eca98?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
