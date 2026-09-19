# PASSWORD-RESET verify — 2026-09-19T22:12:54.229Z

## Request
- ✓ known address → quiet success — /forgot?sent=1
- ✓ token row created (hashed, 60min expiry)
- ✓ unknown address → the SAME quiet success (no enumeration) — /forgot?sent=1
- ✓ deactivated account → quiet success, but NO token
- ✓ malformed address → format error — /forgot?error=format

## Reset
- ✓ too-short password rejected — /reset/2203f1ceecd0cb7b66b0ec68939ac6bbd30ea3d5eaa4c6d0d66dc1da822f0428?error=short
- ✓ mismatched confirm rejected — /reset/2203f1ceecd0cb7b66b0ec68939ac6bbd30ea3d5eaa4c6d0d66dc1da822f0428?error=match
- ✓ valid reset lands on sign-in with the banner — /login?reset=1
- ✓ new password actually set
- ✓ sessionVersion bumped — every open session revoked
- ✓ ALL outstanding reset links burned (including the emailed one)
- ✓ second use of the same link → expired — /forgot?error=expired
- ✓ expired link → expired — /forgot?error=expired
- ✓ unknown link → expired (no oracle) — /forgot?error=expired

ALL CHECKS PASS
