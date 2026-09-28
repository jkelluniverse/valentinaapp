# PASSWORD-RESET verify — 2026-09-28T14:03:37.450Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/53807abd932a08d2cd6afc0cdb7c73b0643e4f9f5d1b11eb12bbd5f17e9dd6ad?error=short
- ✓ mismatched confirm rejected — /reset/53807abd932a08d2cd6afc0cdb7c73b0643e4f9f5d1b11eb12bbd5f17e9dd6ad?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
