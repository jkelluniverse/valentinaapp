# PASSWORD-RESET verify — 2026-09-18T00:09:57.086Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/290d25cbf7b9b6968d25752bdb1d51fad84db6eb1804bb134de9e3ff5d496a5f?error=short
- ✓ mismatched confirm rejected — /reset/290d25cbf7b9b6968d25752bdb1d51fad84db6eb1804bb134de9e3ff5d496a5f?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
