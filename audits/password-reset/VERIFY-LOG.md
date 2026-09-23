# PASSWORD-RESET verify — 2026-09-23T18:52:37.894Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/cb70bdebe07d5c1cf392f4795b94aa72e459dbd85f94b1f005cda554b237e88d?error=short
- ✓ mismatched confirm rejected — /reset/cb70bdebe07d5c1cf392f4795b94aa72e459dbd85f94b1f005cda554b237e88d?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
