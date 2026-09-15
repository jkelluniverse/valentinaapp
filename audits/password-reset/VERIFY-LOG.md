# PASSWORD-RESET verify — 2026-09-15T15:50:03.407Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/1eaeddfae542c1a87b38dbf681ca906a2934b8f7ca32f68baedce0ea8559cd31?error=short
- ✓ mismatched confirm rejected — /reset/1eaeddfae542c1a87b38dbf681ca906a2934b8f7ca32f68baedce0ea8559cd31?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
