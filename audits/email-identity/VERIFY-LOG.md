# C27-EMAIL-IDENTITY Phase 1 verify — 2026-09-12T20:29:25.409Z
RESEND_API_KEY present in this environment: no — as the spec requires

## Item 1 — the five assumptions, confirmed or corrected (ruling 18)
- ✓ A1 CONFIRMED — the sender env vars are READ only in lib/notify.ts and lib/agreements/index.ts (one page mentions the names in copy, reads nothing) — process.env reads: lib/agreements/index.ts, lib/notify.ts · name-in-copy only: app/practitioner/schedule/page.tsx
- ✓ A2 CONFIRMED — api.resend.com is called ONLY from lib/notify.ts; every other 'resend' in the app is the English word (resendInvite, resendReceipt) — no bypass — all mail funnels through sendEmail
- ✓ A3 CONFIRMED — emails/envelope.ts is the single place the practice footer is composed for EMAIL (other 'Veritas Consulting' sites are PDFs and sign pages, out of scope) — emails/envelope.ts
- ~ A4 was CORRECTED BY THE ARCHITECT (2026-09-12, in the spec, before build-on): psychefolio.com lives in a SEPARATE Resend account, so the platform identity carries its OWN credential (PLATFORM_RESEND_API_KEY). The per-identity key is asserted BEHAVIORALLY below: at the wire's Authorization header, in the missing-key degradation, and in both directions of account independence.
- ✓ A5 CONFIRMED — EMAIL_TEAM_ALLOWLIST + RAILWAY_ENVIRONMENT_NAME live in sendEmail and run BEFORE any identity branch, so the staging guard is identity-independent by construction — asserted again behaviorally in item 8 below

## Item 3 — the BLOCKING byte-identity: a default-practice booking confirmation, against the fixture captured at 8a3f960
- ✓ the booking path produced exactly its two sends (practitioner notify + lead confirmation) through the real sendEmail, captured at the wire — 2 wire call(s): t27-practitioner@fixture.test · t27-lead@fixture.test
- ✓ BLOCKING — the default practice's booking emails are BYTE-IDENTICAL to the 8a3f960 fixture: from, reply_to, subject, text, html, attachments — what Valentina's clients receive did not change — byte-identical (11334 canonical bytes) · fixture pinned at 8a3f960

## Item 2 — the platform identity: fail-closed config, the engage engine's identity, and the wire
- ✓ platformEmailConfigured() is FALSE with no platform values set — the engage gate cannot fall back to Valentina's identity (falling back is the bug) — unset PLATFORM_* → null identity, unconfigured
- ✓ …and TRUE once all five platform values exist; the identity carries them — INCLUDING its own account's credential — verbatim — from=T27 Platform <t27-platform-from@fixture.test>
- ✓ …and a MISSING legal entity fails closed again — a footer that names no entity must not send (spec Phase 1 §4) — PLATFORM_LEGAL_ENTITY removed → unconfigured
- ✓ A4-correction — a missing PLATFORM key fails closed the same way, even with the PRACTICE key present: the other account's credential is never borrowed — PLATFORM_RESEND_API_KEY removed (practice RESEND_API_KEY still set) → unconfigured
- ✓ with NO platform key, every due step records UNCONFIGURED — no exception, no send, no borrowed credential (degrades exactly as a missing practice key does today) — tick configured=false · transport calls=0 · ledger: UNCONFIGURED|2
- ✓ …and once the platform key exists, the SAME re-sendable rows flip to SENT (no third row) with the PLATFORM identity — its own key included — on every step, both locales (injected-transport seam) — 2 sends: en→T27 Platform · es→T27 Platform · ledger rows=2 · tick configured=true
- ✓ at the WIRE: platform from + platform reply-to + the PLATFORM account's Authorization, and the html, text and subject contain NONE of Veritas / VIIIV / Valentina / her credential line — both locales — from=T27 Platform <t27-platform-from@fixture.test> · reply_to=t27-platform-reply@fixture.test · auth=platform key · forbidden-string scan clean=true
- ✓ A4-correction — account independence: a platform send succeeds with NO practice RESEND_API_KEY present, authenticating with the platform account's own key — ok=true · auth=platform key
- ✓ …and the platform footer names the configured legal entity and postal address in html AND text (no practice letterhead, no borrowed wordmark) — entity + postal present in both parts of both locales
- ✓ item 10 — every platform message still carries a working unsubscribe link: a real <a> in the html and the labeled URL in the text part — anchor + text line present in both locales
- ✓ with NO identity passed, sendEmail behaves exactly as before: NOTIFY_FROM_EMAIL from, REPLY_TO_EMAIL reply-to, the PRACTICE account's Authorization, the practice Envelope (Valentina's footer intact for HER mail) — from=Valentina Vélez <t27-practice-from@fixture.test> · auth=practice key · footer=practice

## Item 8 — the staging allowlist blocks non-fixture recipients for BOTH identities
- ✓ on a non-production RAILWAY_ENVIRONMENT_NAME, a real recipient is refused for the practice identity AND the platform identity — zero wire calls; a fixture address still sends — blocked practice=true · blocked platform=true · fixture sent=true · wire calls=1

## Item 9 — DEMO-tenant suppression holds for BOTH identities
- ✓ the simulated request scope is real (host readable via next/headers) before any check is built on it — verified
- ✓ on a DEMO tenant's host, a real recipient is suppressed for BOTH identities — zero wire calls — practice=true · platform=true · wire calls=0

## The engage gate stays CLOSED (law #10) — this build opens nothing
- ✓ no engageEnabled PracticeSetting row exists and the env override is off — the production gate is exactly as closed as before this build — rows=0 · env=off (the tick above ran on an in-process env override, removed)

## Phase 2 — NOT BUILT HERE, honestly: items 4 (per-practice identity), 5 (silent-failure case), 6 (two practices in one process), and the per-practice half of item 7. The attorney-wording half of 7 is protected in Phase 1 by the byte-identity fixture (agreement mail rides the unchanged practice envelope).
- ✓ SELF-CLEANING — every fixture row this gate created is gone, and the environment is restored — rows 0 · env restored

EMAIL-IDENTITY VERIFY PASS — 22/22
