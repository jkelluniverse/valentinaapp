# C23-ENGAGE — acceptance log

Run: 2026-09-11T17:48:39.795Z · `npx tsx audits/engage/verify.ts` against the BUILT app on :3129
RESEND_API_KEY present: no — the seam is the path under test


## 0. the premise
- ✓ no RESEND_API_KEY is present in this environment — absent, as the spec requires
- ✓ emailConfigured() is false, so the seam is the path under test

## 1. sequence definitions are well-formed
- ✓ exactly the two specified sequences ship — event-lead(3), founding-welcome(2)
- ✓ event-lead has THREE steps at +0/+3/+10 days — ["thanks+0","what-it-does+3","last-note+10"]
- ✓ founding-welcome has TWO steps at +0/+7 days — ["welcome+0","check-in+7"]
- ✓ step keys are unique within each sequence
- ✓ event-lead/thanks has a template in en — eventLeadThanks
- ✓ event-lead/thanks (en) references only real merge fields — firstName,referralCode,signupUrl
- ✓ event-lead/thanks (en) renders subject + heading + text — subject "Thank you for leaving your name" / 508 chars of text
- ✓ event-lead/thanks (en) leaves no unfilled placeholder — none
- ✓ event-lead/thanks (en) carries the unsubscribe link
- ✓ event-lead/thanks has a template in es — eventLeadThanks
- ✓ event-lead/thanks (es) references only real merge fields — firstName,referralCode,signupUrl
- ✓ event-lead/thanks (es) renders subject + heading + text — subject "Gracias por dejarnos tu nombre" / 496 chars of text
- ✓ event-lead/thanks (es) leaves no unfilled placeholder — none
- ✓ event-lead/thanks (es) carries the unsubscribe link
- ✓ event-lead/thanks EN and ES copy genuinely differ — "Thank you for leaving your name" vs "Gracias por dejarnos tu nombre"
- ✓ event-lead/what-it-does has a template in en — eventLeadWhatItDoes
- ✓ event-lead/what-it-does (en) references only real merge fields — firstName,signupUrl
- ✓ event-lead/what-it-does (en) renders subject + heading + text — subject "What the platform actually does" / 592 chars of text
- ✓ event-lead/what-it-does (en) leaves no unfilled placeholder — none
- ✓ event-lead/what-it-does (en) carries the unsubscribe link
- ✓ event-lead/what-it-does has a template in es — eventLeadWhatItDoes
- ✓ event-lead/what-it-does (es) references only real merge fields — firstName,signupUrl
- ✓ event-lead/what-it-does (es) renders subject + heading + text — subject "Qué hace la plataforma en realidad" / 636 chars of text
- ✓ event-lead/what-it-does (es) leaves no unfilled placeholder — none
- ✓ event-lead/what-it-does (es) carries the unsubscribe link
- ✓ event-lead/what-it-does EN and ES copy genuinely differ — "What the platform actually does" vs "Qué hace la plataforma en realidad"
- ✓ event-lead/last-note has a template in en — eventLeadLastNote
- ✓ event-lead/last-note (en) references only real merge fields — firstName,signupUrl
- ✓ event-lead/last-note (en) renders subject + heading + text — subject "A last note" / 504 chars of text
- ✓ event-lead/last-note (en) leaves no unfilled placeholder — none
- ✓ event-lead/last-note (en) carries the unsubscribe link
- ✓ event-lead/last-note has a template in es — eventLeadLastNote
- ✓ event-lead/last-note (es) references only real merge fields — firstName,signupUrl
- ✓ event-lead/last-note (es) renders subject + heading + text — subject "Una última nota" / 549 chars of text
- ✓ event-lead/last-note (es) leaves no unfilled placeholder — none
- ✓ event-lead/last-note (es) carries the unsubscribe link
- ✓ event-lead/last-note EN and ES copy genuinely differ — "A last note" vs "Una última nota"
- ✓ founding-welcome/welcome has a template in en — foundingWelcome
- ✓ founding-welcome/welcome (en) references only real merge fields — firstName,portalUrl
- ✓ founding-welcome/welcome (en) renders subject + heading + text — subject "Your practice is set up" / 570 chars of text
- ✓ founding-welcome/welcome (en) leaves no unfilled placeholder — none
- ✓ founding-welcome/welcome (en) carries the unsubscribe link
- ✓ founding-welcome/welcome has a template in es — foundingWelcome
- ✓ founding-welcome/welcome (es) references only real merge fields — firstName,portalUrl
- ✓ founding-welcome/welcome (es) renders subject + heading + text — subject "Tu práctica ya está configurada" / 605 chars of text
- ✓ founding-welcome/welcome (es) leaves no unfilled placeholder — none
- ✓ founding-welcome/welcome (es) carries the unsubscribe link
- ✓ founding-welcome/welcome EN and ES copy genuinely differ — "Your practice is set up" vs "Tu práctica ya está configurada"
- ✓ founding-welcome/check-in has a template in en — foundingCheckIn
- ✓ founding-welcome/check-in (en) references only real merge fields — firstName,portalUrl
- ✓ founding-welcome/check-in (en) renders subject + heading + text — subject "How is the first week going?" / 551 chars of text
- ✓ founding-welcome/check-in (en) leaves no unfilled placeholder — none
- ✓ founding-welcome/check-in (en) carries the unsubscribe link
- ✓ founding-welcome/check-in has a template in es — foundingCheckIn
- ✓ founding-welcome/check-in (es) references only real merge fields — firstName,portalUrl
- ✓ founding-welcome/check-in (es) renders subject + heading + text — subject "¿Cómo va la primera semana?" / 574 chars of text
- ✓ founding-welcome/check-in (es) leaves no unfilled placeholder — none
- ✓ founding-welcome/check-in (es) carries the unsubscribe link
- ✓ founding-welcome/check-in EN and ES copy genuinely differ — "How is the first week going?" vs "¿Cómo va la primera semana?"
- ✓ an unknown template key throws rather than sending an empty email

## 2. eligibility (including the negative case)
- ✓ an event- LEAD gets event-lead — ["event-lead"]
- ✓ a SIGNED_UP prospect gets founding-welcome — ["founding-welcome"]
- ✓ a NON-event LEAD (source: web) gets NEITHER — []
- ✓ a LEAD with no source at all gets neither — []
- ✓ a DECLINED prospect gets neither — []

## 3. scheduling honours the offsets against an injected as-of
- ✓ at as-of = T0 the event LEAD's step 1 is due — ["event-lead/thanks"]
- ✓ at as-of = T0 step 2 (+3 days) is NOT due
- ✓ at as-of = T0+3d step 2 IS due — ["event-lead/thanks","event-lead/what-it-does"]
- ✓ at as-of = T0+3d step 3 (+10 days) is still NOT due
- ✓ at as-of = T0+10d all three steps are due — ["event-lead/thanks","event-lead/what-it-does","event-lead/last-note"]
- ✓ the SIGNED_UP prospect's welcome is due immediately — ["founding-welcome/welcome"]
- ✓ the SIGNED_UP prospect's check-in (+7d) is not due at T0
- ✓ the NON-event LEAD is planned NOTHING at any as-of — web-sourced lead never enters a sequence

## 9. kill-switch and global pause (over HTTP, real tick)
- ✓ the tick refuses an unauthenticated caller — status 401
- ✓ with NO switch row at all the gate is CLOSED by default — {"ok":true,"at":"2026-09-11T17:48:38.459Z","only":"engage","engage":"considered=7 sent=0 skipped=6 suppressed=1 unconfigured=0 gate=closed paused=false configured=false"}
- ✓ with the gate closed a full tick SENDS NOTHING — event-lead/thanks=SKIPPED event-lead/thanks=SKIPPED event-lead/thanks=SKIPPED event-lead/thanks=SUPPRESSED founding-welcome/welcome=SKIPPED event-lead/thanks=SKIPPED event-lead/thanks=SKIPPED
- ✓ …and records SKIPPED with a reason for every due step — 6 rows, reason engine-gate-closed
- ✓ …and the unsubscribed prospect is SUPPRESSED even with the gate closed — event-lead/thanks=SUPPRESSED
- ✓ with the gate OPEN but the global pause ON the tick still sends nothing — {"ok":true,"at":"2026-09-11T17:48:38.555Z","only":"engage","engage":"considered=6 sent=0 skipped=6 suppressed=0 unconfigured=0 gate=open paused=true configured=false"}
- ✓ …and records SKIPPED with the pause as its reason — event-lead/thanks=SKIPPED
- ✓ …re-deciding a step did NOT create a second ledger row — 1 row(s)

## 10. no-credential behaviour (the seam)
- ✓ a full tick with no email credential returns 200 and throws nothing — {"ok":true,"at":"2026-09-11T17:48:38.613Z","only":"engage","engage":"considered=6 sent=0 skipped=0 suppressed=0 unconfigured=6 gate=open paused=false configured=false"}
- ✓ the tick reports itself as unconfigured
- ✓ EVERY due step for EVERY eligible prospect records UNCONFIGURED — 6 prospects, all UNCONFIGURED
- ✓ no UNCONFIGURED row claims a sentAt
- ✓ nothing anywhere is marked SENT — event-lead/thanks=SUPPRESSED event-lead/thanks=UNCONFIGURED event-lead/thanks=UNCONFIGURED event-lead/thanks=UNCONFIGURED founding-welcome/welcome=UNCONFIGURED event-lead/thanks=UNCONFIGURED event-lead/thanks=UNCONFIGURED
- ✓ the ledger did not grow by re-deciding SKIPPED rows into UNCONFIGURED — 7 → 7 rows

## 4. idempotency
- ✓ two ticks for the same as-of produce exactly ONE ledger row per step — 7 → 7 rows
- ✓ no (prospect, sequence, step) triple has more than one row — 7 distinct steps, max 1
- ✓ the UNIQUE constraint itself refuses a duplicate insert — prisma error P2002

## 6/7/10b. a CONFIGURED transport — injected, never Resend
- ✓ emailConfigured() now reports true for this process
- ✓ THE SEAM: the UNCONFIGURED rows were still re-sendable — they now send — SENT 6 of 6 due prospects
- ✓ …and no prospect was permanently marked as messaged by the empty tick: NO new rows — 7 → 7 rows
- ✓ …the once-UNCONFIGURED row is now SENT with a sentAt — event-lead/thanks=SENT
- ✓ SUPPRESSED: the unsubscribed prospect's step never reached the transport — 6 transport calls, none to the unsubscribed address
- ✓ …and its ledger row says SUPPRESSED with a reason — event-lead/thanks=SUPPRESSED
- ✓ the non-event LEAD never reached the transport either
- ✓ an eligible prospect DID reach the transport (so the boundary check means something) — engage-lead-en@fixture.test, engage-lead-es@fixture.test, engage-lead-nolocale@fixture.test, engage-signedup@fixture.test, engage-converter@fixture.test, engage-unsub-probe@fixture.test
- ✓ an EN prospect's message is English — Thank you for leaving your name
- ✓ an ES prospect's message is Spanish — Gracias por dejarnos tu nombre
- ✓ a prospect with NO recorded locale gets the defined default (en), not an empty string — Thank you for leaving your name / ledger locale en
- ✓ engageLocale() never yields an empty locale, whatever it is handed — defaults to en
- ✓ the SIGNED_UP prospect's welcome carries their own portal address — https://engprobe.platform.test.
- ✓ an event LEAD's message carries their referral code and the signup link — ENGLEDEN
- ✓ EVERY message carries an unsubscribe link in BOTH the text and the HTML part — 6 messages checked
- ✓ no rendered message carries reward, price or earning language — 6 messages scanned
- ✓ the plain-text part is mandatory and present on every message — shortest 689 chars
- ✓ a THIRD tick at the same as-of sends nothing more (SENT is terminal) — 0 new transport calls
- ✓ …and still no new ledger rows — 7 → 7

## 5. mid-sequence conversion
- ✓ the converting prospect received event-lead step 1 while still a LEAD
- ✓ after signup NO further event-lead step is ever created — event-lead/thanks=SENT founding-welcome/welcome=SENT
- ✓ no 'still thinking it over' message reached the transport after signup — Thank you for leaving your name | Your practice is set up
- ✓ they DO pick up founding-welcome instead — event-lead/thanks=SENT founding-welcome/welcome=SENT
- ✓ the welcome was anchored on conversion, not on capture — 2026-09-12T17:47:36.871Z
- ✓ the still-LEAD prospect DID advance to step 2 at T0+3d — event-lead/thanks=SENT event-lead/what-it-does=SENT
- ✓ the tick at T0+3d reported its work — SENT 5
- ✓ at T0+10d the last note goes out, and the sequence then stops — event-lead/thanks=SENT event-lead/what-it-does=SENT event-lead/last-note=SENT
- ✓ event-lead never produces a fourth step
- ✓ the harness returned to the no-credential state for the remaining items

## 8. the unsubscribe route
- ✓ the token is unguessable (id + a 32-char HMAC) and single-purpose — 58 chars
- ✓ a token minted for one prospect does not verify for another
- ✓ one click sets unsubscribedAt — status 200, unsubscribedAt 2026-09-11T17:48:38.969Z
- ✓ …and says so plainly in English — Done — you are unsubscribed
- ✓ a second click is idempotent — it changes nothing and says so — status 200, timestamp unchanged: true
- ✓ the route renders in Spanish too — Ya estabas dado de baja
- ✓ the unsubscribe page (en) carries no reward or price language
- ✓ the unsubscribe page (es) carries no reward or price language
- ✓ a forged signature token does not 500 — status 200
- ✓ a forged signature token renders the plain "not valid" page
- ✓ a unknown id token does not 500 — status 200
- ✓ a unknown id token renders the plain "not valid" page
- ✓ a no signature token does not 500 — status 200
- ✓ a no signature token renders the plain "not valid" page
- ✓ a path traversal token does not 500 — status 200
- ✓ a path traversal token renders the plain "not valid" page
- ✓ a empty-ish token does not 500 — status 404
- ✓ no forged or unknown token unsubscribed anybody — 2 → 2 unsubscribed
- ✓ the late prospect has step 1 recorded (and steps 2-3 not yet) — event-lead/thanks=UNCONFIGURED
- ✓ the late prospect unsubscribes with one click mid-sequence — status 200
- ✓ a prospect who unsubscribes mid-sequence is SUPPRESSED from then on — every remaining step — event-lead/thanks=SUPPRESSED event-lead/what-it-does=SUPPRESSED event-lead/last-note=SUPPRESSED

## 12. AuditEvent rows are metadata only
- ✓ every send decision is recorded as an AuditEvent — 50 rows
- ✓ every audit row carries a reason
- ✓ no email address, name, subject or template body appears in the meta blob — metadata only
- ✓ the unsubscribe itself is audited
- ✓ no engage audit row is left with a null tenantId (the stamp audit stays clean) — 0 null-tenant rows

## 13. the admin surface
- ✓ /admin/prospects renders for an allowlisted email — status 200
- ✓ the follow-up section renders
- ✓ the kill-switch and pause state are shown — Feature gate OPEN — sending allowed engageEnabled Global pause not paused
- ✓ the queue view renders what is due next (due now AND upcoming) — due now engage-queue-probe@fixture.test event-lead / thanks en 2026-09-11 17:47 nothing yet upcoming engage-queue-probe@fixture
- ✓ per-prospect message history renders with status and reason — event-lead / thanks SENT · delivered-to-transport
- ✓ /admin/prospects 404s for a signed-in practitioner who is not allowlisted — status 404
- ✓ …and does not render for a signed-out visitor — status 307
- ✓ the dry-run renders what the next tick would do — status 200
- ✓ the dry-run creates NO ledger rows — 23 → 23 ProspectMessage rows
- ✓ the dry-run creates NO audit rows either — 48 → 48 engage-message audit rows
- ✓ the dry-run 404s for a non-allowlisted practitioner — status 404

## 11. the money / reward-language scanner over both catalogs
- ✓ messages/en/engage.json carries no reward, price or earning language
- ✓ messages/es/engage.json carries no reward, price or earning language
- ✓ event-lead/thanks (en) passes the scanner
- ✓ event-lead/what-it-does (en) passes the scanner
- ✓ event-lead/last-note (en) passes the scanner
- ✓ founding-welcome/welcome (en) passes the scanner
- ✓ founding-welcome/check-in (en) passes the scanner
- ✓ event-lead/thanks (es) passes the scanner
- ✓ event-lead/what-it-does (es) passes the scanner
- ✓ event-lead/last-note (es) passes the scanner
- ✓ founding-welcome/welcome (es) passes the scanner
- ✓ founding-welcome/check-in (es) passes the scanner
- ✓ both catalogs expose exactly the same template keys (bilingual parity) — eventLeadThanks,eventLeadWhatItDoes,eventLeadLastNote,foundingWelcome,foundingCheckIn
- ✓ both catalogs expose the same unsubscribe + page keys

ENGAGE VERIFY PASS — 172/172
