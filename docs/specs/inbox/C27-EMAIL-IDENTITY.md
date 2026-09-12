# C27-EMAIL-IDENTITY — every message should say who actually sent it

**Spec:** C27-EMAIL-IDENTITY · **Depends-on:** C25 (per-practice `PracticeSetting` writes), C23-ENGAGE, PLATFORM Phases 0–5
**Priority:** Phase 1 is pre-event (it unblocks the engage gate). **Phase 2 is urgent-after-event and must land before any founding practitioner invites their first client.**
**Architect:** decided 2026-09-12.

## Why this exists

`lib/notify.ts` has exactly one sending identity for the entire application:

```
emailConfigured() = RESEND_API_KEY && NOTIFY_FROM_EMAIL
from:     process.env.NOTIFY_FROM_EMAIL      // one address, all mail
reply_to: process.env.REPLY_TO_EMAIL        // one reply path, all mail
```

…and `emails/envelope.ts` hardcodes `"Valentina Vélez · Veritas Consulting · Orlando, Florida"` into the
footer of **every message the platform sends**, across 63 `sendEmail` call sites. The only tenant-awareness
anywhere in the email layer is a DEMO-tenant send suppression.

Two consequences, both dormant until practice #2 exists — which the September 23 event creates:

1. **Practitioner follow-up signs as Valentina.** The engage sequences go to the platform's prospective
   customers, over her practice's letterhead. This is why the engage gate is still closed.
2. **Worse: a second practice's *client* mail would send from Valentina's address with her footer.** A
   founding practitioner invites their first client, and the client receives a booking confirmation from
   Valentina Vélez of Veritas Consulting — a practitioner they have never heard of. Reply-to goes to
   Valentina. This is the same shape as the C25 defect: invisible while there is one practice, wrong the
   moment there are two, and it fails *silently* rather than erroring.

There is a third, smaller instance of the same pattern: `PRACTICE_EMAIL` is a **global** env var
(`lib/agreements/index.ts:266`, falling back to `NOTIFY_FROM_EMAIL`) standing in for what is obviously a
per-practice value. BUILD-STATE has carried it as an unset env var awaiting Jacob; Phase 2 should retire it
rather than set it.

## Assumptions to verify, not trust

*(Ruling 18. My beliefs, not facts — this program has had three specs assert a false premise.)*

1. `NOTIFY_FROM_EMAIL` and `REPLY_TO_EMAIL` are read **only** in `lib/notify.ts` (plus `PRACTICE_EMAIL` in
   `lib/agreements/index.ts`). Enumerate every read before changing the contract.
2. All outbound mail funnels through `sendEmail` in `lib/notify.ts` — roughly 63 call sites, no direct
   Resend calls elsewhere. **Grep for direct API use**; a bypass would escape both phases.
3. `emails/envelope.ts` is the single place the practice footer is composed.
4. A single Resend API key can send from any domain verified in that Resend account, so **no second API key
   is needed** — only a second verified sending domain and a different `from`.
5. `EMAIL_TEAM_ALLOWLIST` + `RAILWAY_ENVIRONMENT_NAME` are what stop staging emailing real people. Whatever
   you change must keep that guard intact for both identities.

## Standing laws this build must honor

- **Bilingual parity (law #7)** — both identities, both languages.
- **Honest data posture (law #8)** — a footer must name the party that actually sent the message.
- **Verbatim legal text (law #4)** — agreement and consent emails carry attorney wording; the *chrome*
  around them may become per-practice, the wording may not change.
- **Kill-switch (law #10)** — the engage gate stays CLOSED throughout; this spec does not open it.
- **Valentina's client-facing mail must be byte-identical when nothing is configured for her practice.**
  She is tenant #1 and her portal is baselined; a refactor of the email layer must not change what her
  clients receive.

## Phase 1 — the platform identity (pre-event, small)

A **second envelope**, not an edit to the existing one. Platform-identity mail (the engage sequences) and
practice-identity mail (everything Valentina sends her clients) are different kinds of message and should be
composed by different code paths.

1. Platform envelope: sender name, footer entity, postal address and unsubscribe line come from
   platform-level config — `PLATFORM_FROM_EMAIL`, `PLATFORM_REPLY_TO`, `PLATFORM_LEGAL_ENTITY`,
   `PLATFORM_POSTAL_ADDRESS`. **No practice letterhead, no practitioner credential, no borrowed wordmark.**
2. `sendEmail` accepts an explicit identity rather than reading a single global `from`. Default behaviour
   with no identity passed must be exactly today's behaviour.
3. The engage sequences use the platform identity. Nothing else changes.
4. Exact copy — signature block, footer, EN and ES — comes from the approved decision memo. **Do not invent
   footer wording**; if the memo's `[ENTITY]` or `[POSTAL ADDRESS]` blanks are still unfilled, stop and raise
   an ARCHITECT-REQUEST rather than guessing. A footer that names the wrong legal entity is a legal problem,
   not a copy problem.

## Phase 2 — per-practice identity (before any founding practitioner invites a client)

**Do not attempt per-practice custom sending domains.** Sending as `hello@herownpractice.com` requires
per-practice DKIM verification and an onboarding flow to collect and verify a domain — that is its own
track, and it is not what the harm requires.

What the harm requires is that the message look like it came from the right practice and that replies reach
them. So:

1. **One verified platform sending domain**, with the *practice* as the display name and the practice's own
   address as reply-to:
   `"Practice Name" <notifications@mail.psychefolio.com>`, `reply_to: <the practice's email>`.
   This is ordinary multi-tenant SaaS practice, needs no per-practice DNS, and fixes the actual defect.
2. **The footer becomes the practice's**, composed from the tenant row (`displayName`,
   `branding.portalTitle`) plus per-practice `PracticeSetting` values for the practice email and postal
   address. C25 made `PracticeSetting` per-practice, so this is now safe to store there.
3. **Retire `PRACTICE_EMAIL`** as a global in favour of the per-practice setting, with the env var kept only
   as a fallback for the default tenant so nothing regresses.
4. A practice with no email configured must **fail closed or degrade honestly** — never silently fall back
   to another practice's identity. Falling back to Valentina is the bug.
5. Practitioners need somewhere to set their practice email and postal address — extend
   `/practitioner/settings`, in both languages.

## Verify (this list is the gate — evidence required per item)

Write `audits/email-identity-verify.ts` in house style, self-cleaning, passing **with no `RESEND_API_KEY`
present** (assert at an injected transport boundary, as `audits/engage/verify.ts` does).

1. Each of the five assumptions confirmed or corrected in writing.
2. **Phase 1:** an engage message carries the platform identity — platform `from`, platform reply-to,
   platform footer — and contains **none** of `Veritas`, `VIIIV`, `Valentina`, or her credential line.
   Assert those strings absent from both the HTML and the text part, in both locales.
3. **Phase 1 regression:** a practice→client message (a booking confirmation) is **byte-identical** to its
   pre-change output for the default tenant. Capture before and after; pin the comparison to a **commit**,
   never to `HEAD` (ruling 35).
4. **Phase 2:** practice B's client booking email carries B's display name, B's reply-to and B's footer —
   and contains none of Valentina's identity strings.
5. **Phase 2, the silent-failure case:** a practice with no email configured does not send as another
   practice. Assert what it does instead, and that it is honest.
6. Two practices sending in the same process do not cross identities — send for A, then B, then A again,
   and assert each message's identity at the transport.
7. Agreement/consent emails: the attorney wording is **unchanged**, only the chrome differs. Diff the legal
   body against its committed fixture.
8. `EMAIL_TEAM_ALLOWLIST` still blocks non-fixture recipients on a non-production `RAILWAY_ENVIRONMENT_NAME`
   — for **both** identities. A refactor that leaks staging mail to real practitioners is worse than the bug
   being fixed.
9. DEMO-tenant suppression still holds for both identities.
10. Every platform message still carries a working unsubscribe; the money/reward scanner stays clean in both
    languages.
11. Regression, non-negotiable: `lint:wall` · `guard-prisma` · `tsc` · `build` · `smoke` · `smoke:writes` ·
    signup **37/37** · capture **59/59** · referral **68/68** · engage **172/172** · tenant-scope **48/48** ·
    nested-stamp **43/43** · settings-i18n **10/10** · practice-setting **47/47** · platform phase2
    **16/16**, phase3 **11/11**, phase5 **17/17** + verify · c21 **58/58** · c20 **28/28** · v31 **32/32** ·
    c12x · onboarding 16/16, 17/17, 7/7, 10/10, 19/19 · password-reset · amd06 · stamp audit **exit 0** last.

## Out of scope (do not build)

Per-practice custom sending domains and their DKIM onboarding (its own track) · opening the engage gate ·
changing any attorney-drafted wording · open/click tracking · a second transport or a second Resend key ·
touching Valentina's client-visible portal chrome.
