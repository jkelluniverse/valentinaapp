# task #78 — /practitioner/settings i18n — acceptance log

Run: 2026-09-05T23:26:37.024Z · `npx tsx audits/settings-i18n-verify.ts` against the BUILT app on :3131
Database: postgresql://postgres@localhost:5432/valentina_scratch?host=/tmp

# task #78 — /practitioner/settings i18n verify — 2026-09-05T23:26:36.610Z
- ✓ the two catalogs have IDENTICAL key sets — en=85 keys · es=85 keys · diff=none
- ✓ no catalog string is empty, and no Spanish string is a copy of the English one it translates — only the two language NAMES are legitimately identical in both catalogs
- ✗ EVERY English string is byte-identical (whitespace-normalised) to the pre-pass page — an i18n MOVE, not a copy rewrite — eyebrow → "Your practice" · intro → "Your account, your language, and the policies your practice runs on." · open → "Open →" · saved.password → "Password changed. Every other session has been signed out." · saved.email → "Check the new address for a confirmation link — nothing changes until it's confirmed." · saved.language → "Language saved."
~ starting built app on :3131
- ✓ the page renders for a signed-in practitioner (EN, User.locale) — status 200
- ✓ the page renders in Spanish with ?lang=es (ruling 14) — status 200
- ✓ EN: every unconditional catalog string appears on the rendered page — 62 strings present
- ✓ ES: every unconditional catalog string appears on the rendered page — 62 strings present
- ✓ the two renders are genuinely different documents (the ES page is not the EN page)
- ✓ no English label leaks into the Spanish render (the conspicuous section headings)
- ✓ the referrals link row is in the catalog in both languages (the row task #78 called out)
~ probe practitioner removed

1 CHECK(S) FAILED — 9/10
