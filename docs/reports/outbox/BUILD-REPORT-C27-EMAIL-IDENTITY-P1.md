# BUILD REPORT — C27-EMAIL-IDENTITY, Phase 1 only

**Status: COMPLETE (Phase 1). Phase 2 NOT BUILT, as dispatched.**
Gate `audits/email-identity-verify.ts` **22/22** (self-cleaning, passes with no
`RESEND_API_KEY`, writes its own VERIFY-LOG per ruling 17). Full regression re-run
before merge — numbers at the end. **The engage gate was not opened**: the gate's
final section asserts zero `engageEnabled` rows and the env override off.
**Built against the corrected spec** — the Architect's assumption-4 correction
(separate Resend account → per-identity credential) landed mid-build and is
implemented, see A4 below.

## ⚠ THE THREE FOOTER BLANKS — decision-memo values NOT in hand (ARCHITECT/JACOB)

The mechanism is complete and **fail-closed**: until all three exist in production
config, `platformEmailConfigured()` is false and every due engage step records
`UNCONFIGURED` (re-sendable) — nothing can send under a practice's letterhead, and
nothing sends at all. The values, when decided, are pure config — no deploy beyond
setting them:

1. **`PLATFORM_FROM_EMAIL`** — display name + address on the verified platform
   sending domain, e.g. `"<sender name>" <notifications@mail.psychefolio.com>`.
   The display-name half is ALSO the signature: the platform envelope signs every
   message with exactly this name (a message signs as the identity it is sent
   from — nothing is invented in code).
2. **`PLATFORM_LEGAL_ENTITY`** — the memo's `[ENTITY]` blank. A footer that names
   the wrong legal entity is a legal problem, so the code refuses to send without it.
3. **`PLATFORM_POSTAL_ADDRESS`** — the memo's `[POSTAL ADDRESS]` blank (CAN-SPAM
   requires a physical address on commercial mail).

(`PLATFORM_REPLY_TO` is optional — omitted, no reply-to header is set on platform
mail; it never falls back to `REPLY_TO_EMAIL`.)

A FOURTH production value is required but is a credential, not a memo blank:
**`PLATFORM_RESEND_API_KEY`** — the platform Resend account's key (assumption-4
correction; the account whose verified domain is psychefolio.com). All four must
exist before `platformEmailConfigured()` is true.

## The five assumptions (item 1) — confirmed or corrected, with evidence

1. **A1 CONFIRMED, with one precision:** `process.env` READS of
   `NOTIFY_FROM_EMAIL`/`REPLY_TO_EMAIL`/`PRACTICE_EMAIL` exist in exactly
   `lib/notify.ts` and `lib/agreements/index.ts:266`. One additional file matches
   textually — `app/practitioner/schedule/page.tsx:196` — but it only NAMES the
   vars in help copy; it reads nothing. Asserted by the gate, not just grepped once.
2. **A2 CONFIRMED:** `api.resend.com` appears only in `lib/notify.ts`. Every other
   "resend" in the app is the English word (`resendInvite`, `resendReceipt`). No
   bypass; both phases' contract holds.
3. **A3 CONFIRMED for email:** `emails/envelope.ts` is the single email-footer
   composer. "Veritas Consulting" also appears in PDFs (invoice, reading), sign
   pages and the C21 legal-document bodies — none of them email, all deliberately
   untouched (the legal bodies are verbatim attorney text, law #4).
4. **A4 CORRECTED BY THE ARCHITECT MID-BUILD (2026-09-12), and the build follows
   the correction:** psychefolio.com lives in a SEPARATE Resend account, so the
   platform identity carries its OWN `PLATFORM_RESEND_API_KEY`. Implemented and
   asserted behaviorally: the wire's `Authorization` header is per-identity
   (platform sends authenticate with the platform key, practice sends with the
   practice key); a missing platform key degrades exactly like a missing practice
   key (UNCONFIGURED, no exception, no borrowed credential) and the same rows flip
   to SENT once the key exists, with no duplicate row; account independence holds
   both ways (a platform send succeeds with NO practice key present). The spec's
   DNS facts (send.psychefolio.com SPF/MX, DKIM at resend._domainkey, DMARC
   p=none, Zoho on the apex — never add a second v=spf1 there) are recorded in
   the accepted spec; nothing in this build touches DNS.
5. **A5 CONFIRMED:** the `EMAIL_TEAM_ALLOWLIST` + `RAILWAY_ENVIRONMENT_NAME` guard
   lives in `sendEmail` and runs BEFORE the identity branch, so it is
   identity-independent by construction — and item 8's behavioral check proves it
   for both identities (real recipient refused on staging, zero wire calls).

## What was built

- **`emails/platform-envelope.ts`** — the second envelope. Header and signature =
  the display-name half of `PLATFORM_FROM_EMAIL`; footer = `PLATFORM_LEGAL_ENTITY ·
  PLATFORM_POSTAL_ADDRESS` verbatim; unsubscribe anchor in html + labeled URL in
  text. No practice letterhead, no credential line, no wordmark string anywhere in
  code. Visual chrome uses the platform brand tokens (BRAND_HANDOFF §2 indigo/gold)
  without asserting any name.
- **`lib/notify.ts`** — `sendEmail` accepts an explicit `identity?: PlatformIdentity`.
  No identity → byte-for-byte today's behaviour (same envelope, same `from`, same
  JSON body shape at the wire). With identity → identity's from/reply-to and the
  platform envelope. New `platformIdentity()` (null unless from + entity + postal
  all exist) and `platformEmailConfigured()`.
- **`lib/engage.ts`** — the engine's "configured" is now `platformEmailConfigured()`
  (engage mail is platform mail), every send carries the platform identity, and the
  identity is re-read at the send moment: if it vanished mid-run the step records
  `UNCONFIGURED` (re-sendable) rather than ever reaching the transport without an
  identity. Falling back to Valentina is structurally unreachable on this path.
- **`audits/engage/verify.ts`** — contract-following edit, disclosed: the
  configured-transport section now also sets the four fixture `PLATFORM_*` values
  (and asserts `platformEmailConfigured()`); the no-credential scrubs delete them.
  Same throwaway-fixture pattern the gate already used for `RESEND_API_KEY`.
  Still **172+ green** (see regression numbers) and the no-key seam is unchanged.

## Verify items — where each landed

- **1** assumptions: above, each a gate check (A4 an honest log line).
- **2** platform identity: asserted at BOTH boundaries — the engage engine's
  injected-transport seam (identity object on every step, both locales) and the
  WIRE (mocked fetch capturing the exact Resend request: platform from, platform
  reply-to, and html/text/subject containing none of Veritas / VIIIV / Valentina /
  Neuropsych / Psych-K, both locales).
- **3 (BLOCKING) — PASS:** the default practice's booking confirmation (both sends:
  practitioner notify + lead confirmation) is **byte-identical** to the fixture
  captured at commit **`8a3f960`** (`audits/email-identity/booking-confirmation.fixture.json`,
  11,334 canonical bytes covering from, reply_to, subject, text, html and the ICS
  attachment). Capture was proven deterministic (two captures, identical bytes)
  before any code changed. Pinned to the commit, never HEAD (ruling 35);
  `--capture-fixture` re-pins only as a deliberate act and warns off-pin.
- **8** staging allowlist: both identities refused for a real recipient on a
  non-production `RAILWAY_ENVIRONMENT_NAME`, zero wire calls; fixture address sends.
- **9** DEMO suppression: both identities suppressed on a DEMO tenant's host,
  asserted inside a verified simulated request scope.
- **10** unsubscribe: real `<a>` in html + labeled URL in text on every platform
  message, both locales. The money/reward-language scanner runs in the engage gate,
  which is green in the regression set.
- **4 / 5 / 6 / per-practice half of 7 — PHASE 2, NOT BUILT**, logged as such by
  the gate. The attorney-wording half of 7 is protected in Phase 1 by the
  byte-identity fixture (agreement mail rides the unchanged practice envelope).

## Regression (item 11) — all green before merge

lint:wall · guard-prisma · tsc · build · smoke · smoke:writes · signup 37/37 ·
capture 59/59 · referral 68/68 · **engage (with the C27 contract edits)** ·
tenant-scope 48/48 · nested-stamp 43/43 · settings-i18n 10/10 · practice-setting
47/47 · platform phase2 16/16 / phase3 11/11 / phase5 17/17 / verify ALL PASS ·
c21 58/58 · c20 28/28 · v31 32/32 · c12x · onboarding 16/16, 17/17, 7/7, 10/10,
19/19 · password-reset · amd06 · email-identity **19/19** · stamp audit exit 0,
run LAST. (Exact counts in the committed run output; engage's count grows by the
two added platform-configured checks.)

NOT VERIFIED — vendor credential required (unchanged): `pipeline/p12`,
`fixtures/values-verify`, `c12x-ai-pass/*`, `remarkable-recording`.

## Decisions taken (for Architect ratification)

(a) The platform envelope signs with the display name of `PLATFORM_FROM_EMAIL`
    rather than a separate configured signature string — the message signs as the
    identity it is sent from, no fifth config value, nothing invented. If the memo
    wants a signature different from the sender name, that is one small change.
(b) `platformEmailConfigured()` requires legal entity + postal address, not just
    the from — a sendable-but-footerless state cannot exist (law #8).
(c) The engage engine re-reads the identity at the send moment and downgrades to
    `UNCONFIGURED` if it vanished — closes the plan-time/send-time gap.
(d) The engage gate's contract edits (PLATFORM_* fixtures in its configured
    section) — the sanctioned follow-the-contract kind, same pattern as
    c20-verify gaining `drawn:` when drawn-required landed.
(e) `PLATFORM_REPLY_TO` optional: absent, platform mail carries NO reply-to header
    rather than falling back to `REPLY_TO_EMAIL` (which is Valentina's).
(f) Found in the regression sweep and fixed per ruling 34: the C25 gate's A4 check
    asserted "C25 changed zero lines of lib/engage.ts" against the WORKING TREE —
    a historical claim on a moving target, which this build's legitimate engage.ts
    change tripped. Re-pinned commit-to-commit (`a6c8bd8` vs `b23d8d2`, still
    byte-identical, so C25's fact stands forever); the live claim (kill-switch
    reads are filter-form findFirst) still runs against the working tree.
    practice-setting 47/47 after; engage is now **173/173** (+1: the new
    platformEmailConfigured check).
