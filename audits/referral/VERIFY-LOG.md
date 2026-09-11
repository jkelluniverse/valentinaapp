# C23-REFERRAL — acceptance log

Run: 2026-09-11T17:48:35.887Z · `npx tsx audits/referral/verify.ts` against the BUILT app on :3127
Database: postgresql://postgres:***@localhost:5432/veritas_scratch

Browser-driven (Playwright, headless Chromium) over two throwaway tenants;
self-cleaning — probe tenants, practitioners and prospects are removed on the way out.

- ✓ a code resolves to its owning prospect — REFOWNRA → owner
- ✓ the resolver returns NO identity (id + code + status only) — id,referralCode,status
- ✓ a lowercase code still resolves
- ✓ counts split LEAD vs SIGNED_UP across the fan-out — total 3 / leads 2 / signedUp 1
- ✓ the owner's list carries FIRST NAMES ONLY — Helena,Gustavo,Fiona
- ✓ an unknown code counts to zero, not an error
- ✓ a malformed code counts to zero, not an error
- ✓ /join en shows the invited-by line — status 200
- ✓ /join en never shows the referrer's name, email or practice — nothing leaked
- ✓ /join es shows the invited-by line — status 200
- ✓ /join es never shows the referrer's name, email or practice — nothing leaked
- ✓ /signup en shows the invited-by line — status 200
- ✓ /signup en never shows the referrer's name, email or practice — nothing leaked
- ✓ /signup es shows the invited-by line — status 200
- ✓ /signup es never shows the referrer's name, email or practice — nothing leaked
- ✓ /join with an unknown code renders no invited-by line — status 200
- ✓ /join with an unknown code shows no error — status 200, no alert region
- ✓ /signup with an unknown code renders no invited-by line — status 200
- ✓ /signup with an unknown code shows no error — status 200, no alert region
- ✓ /join with an malformed code renders no invited-by line — status 200
- ✓ /join with an malformed code shows no error — status 200, no alert region
- ✓ /signup with an malformed code renders no invited-by line — status 200
- ✓ /signup with an malformed code shows no error — status 200, no alert region
- ✓ a signup carrying an unresolvable code still completes — status SIGNED_UP / tenant created
- ✓ the unresolvable code is stored verbatim and attributes to nobody — stored ZZZZZZZZ, resolves to nobody
- ✓ /join accepts the submission (a self-referral is never an error the visitor reads) — /join/thanks?code=SELFJOIN
- ✓ /join self-referral attributes to nobody — null
- ✓ /signup completes for a self-referral — status SIGNED_UP
- ✓ /signup self-referral attributes to nobody — null
- ✓ no self-referential row survives anywhere in the ledger — 0 of 9 rows
- ✓ the first ?ref= is stored — FIRSTTCH
- ✓ a second ?ref= through /signup never overwrites the first — FIRSTTCH → FIRSTTCH
- ✓ the signup itself still completed — status SIGNED_UP
- ✓ /practitioner/referrals renders for a signed-in practitioner — status 200
- ✓ it shows their OWN code — REFOWNRA
- ✓ it shows the counts derived from the fan-out — 3 Arrived on your code / 1 Became practices
- ✓ it shows the referred people's FIRST names
- ✓ it shows NO surnames and NO emails of referred prospects — nothing leaked
- ✓ it shows their founding-partner standing
- ✓ /practitioner/referrals renders in Spanish — status 200
- ✓ the Spanish page shows the same code and counts
- ✓ an honest zero state renders (no fabricated milestone, no progress bar) — status 200
- ✓ /practitioner/referrals does not render for a signed-out visitor — status 307 → http://refprobea.platform.test/login
- ✓ practitioner B sees their OWN code and counts — status 200
- ✓ practitioner A never sees B's code or B's referred people
- ✓ practitioner B never sees A's code or A's referred people
- ✓ A's session on B's host does not render referral data at all — status 307 → /login
- ✓ /join en carries no reward, price or earning language
- ✓ /join es carries no reward, price or earning language
- ✓ /signup en carries no reward, price or earning language
- ✓ /signup es carries no reward, price or earning language
- ✓ /practitioner/referrals en carries no reward, price or earning language
- ✓ /practitioner/referrals es carries no reward, price or earning language
- ✓ /practitioner/referrals zero state carries no reward, price or earning language
- ✓ messages/en/referral.json carries no reward, price or earning language
- ✓ messages/es/referral.json carries no reward, price or earning language
- ✓ messages/en/capture.json carries no reward, price or earning language
- ✓ messages/es/capture.json carries no reward, price or earning language
- ✓ messages/en/signup.json carries no reward, price or earning language
- ✓ messages/es/signup.json carries no reward, price or earning language
- ✓ the admin top-referrers view renders for an allowlisted email — status 200
- ✓ its counts match the seeded fan-out (3 referred, 1 conversion) — REFOWNRA
- ✓ B's single referral is listed separately — REFOWNRB
- ✓ the admin top-referrers view 404s for a non-allowlisted signed-in practitioner — status 404
- ✓ referredByCode is in the CSV export — header + value present
- ✓ the capture AuditEvent records the attribution — FIRSTTCH
- ✓ the signup AuditEvent records the attribution — FIRSTTCH
- ✓ attribution AuditEvents are metadata only — no email, name or password material in meta

REFERRAL VERIFY PASS — 68/68
