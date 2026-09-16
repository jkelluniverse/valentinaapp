# PASSWORD-RESET verify — 2026-09-16T23:46:43.456Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/1f30012bf9d73fe94d569883ceaee9c5545b0232974a23114c6a33dd4991041a?error=short
- ✓ mismatched confirm rejected — /reset/1f30012bf9d73fe94d569883ceaee9c5545b0232974a23114c6a33dd4991041a?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
