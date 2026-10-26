# C23-ENGAGE — what happens after the room empties

**Spec:** C23-ENGAGE · **Depends-on:** C23-SIGNUP, C23-CAPTURE, C23-REFERRAL (`PractitionerProspect`, `lib/prospects.ts`, `lib/referrals.ts`, `lib/platform-admin.ts`, `lib/notify.ts`)
**Priority:** highest — last of the four event surfaces. Capture without follow-up is a spreadsheet nobody opens.
**Architect:** decided 2026-09-05.

## Why this exists

On September 23 a stack of practitioners will hand over their email. Some will sign up in the room; most will
not. What decides whether that list becomes practices is what arrives in their inbox over the following two
weeks — and whether it arrives at all, in their language, without Jacob hand-writing forty emails on a Friday.

C23-CAPTURE deliberately sends nothing. This spec is where that decision gets paid off.

## The constraint that shapes the whole build

**There is no `RESEND_API_KEY` in the build environment, and there will not be one during verification.**
So the build must be split at exactly that seam:

- **Everything except transmission is verifiable now** — sequence definition, scheduling, eligibility,
  rendering in both languages, suppression, idempotency, the audit trail, and the admin view. This is the
  large majority of the work and all of the risk.
- **Transmission is a configured-only edge.** `lib/notify.ts` already exposes `emailConfigured()`; when it
  returns false, sends resolve to a recorded no-op, never an exception and never a silent data loss.

Build it so that adding the key in production is the *only* remaining step, and prove that with a gate that
passes with no key present. Do not stub a fake transport that "succeeds" — a queue that lies about delivery
is worse than one that admits it never sent.

## Standing laws this build must honor

- **Bilingual parity (law #7)** — every sequence step exists in EN and ES. A prospect's language is a
  property of the prospect, not of the sender's convenience; capture records what they used, and follow-up
  honors it.
- **No unratified price, no reward language** — the money-language scanner from `audits/referral/verify.ts`
  runs over every template in both languages. Founding-partner recognition only.
- **Honest data posture (law #8)** — never imply protections we do not offer. This is marketing email to
  professionals, not clinical communication.
- **Consent and suppression** — one-click unsubscribe on every message, honored permanently and server-side,
  before any send. A prospect who opts out is never contacted again by any sequence, present or future.
- **Attributable audit (law #6)** — every send decision (sent, skipped, suppressed, unconfigured) is
  recorded with its reason. Metadata only.
- **Kill-switch (law #10)** — the whole engine ships behind a feature gate Jacob can close without a deploy,
  plus a global pause. An automated mailer with no off switch is an incident waiting for a bad template.

## Build order

### 1. `ProspectMessage` model + migration `47_prospect_message`

The send ledger — append-only in spirit, one row per (prospect, sequence step): `id`, `prospectId`,
`sequenceKey`, `stepKey`, `locale`, `status` (`PENDING | SENT | SKIPPED | SUPPRESSED | UNCONFIGURED`),
`reason?`, `scheduledFor`, `sentAt?`, `createdAt`. **Unique on (prospectId, sequenceKey, stepKey)** — that
constraint, not application care, is what makes double-sending impossible.

Add `unsubscribedAt?` and `locale?` to `PractitionerProspect` if not already present (migration in the same
folder). Platform-level, like the prospect ledger.

### 2. The sequence definition — data, not code paths

In `lib/engage-sequences.ts`, define sequences as plain data: key, audience predicate, and ordered steps with
an offset in days and a template key. Ship exactly two:

- **`event-lead`** — for `status: LEAD` with `source` starting `event-`. Three steps: same-day thank-you with
  their referral code and the signup link; +3 days, what the platform actually does for a practice; +10 days,
  a plain last note. Three is a decision: enough to be useful, few enough to respect a professional's inbox.
- **`founding-welcome`** — for `status: SIGNED_UP`. Two steps: immediate welcome with their portal address
  and first-steps orientation, +7 days a check-in.

A prospect who converts mid-sequence **stops receiving `event-lead`** and picks up `founding-welcome`. That
transition is the one piece of sequencing logic most likely to embarrass us — someone who just signed up
receiving "still thinking it over?" — so it gets its own Verify item.

### 3. Templates

`lib/engage-templates.ts` + `messages/{en,es}/engage.json`. Plain, short, signed by a person. Warm Stone
palette if HTML, but a text part is mandatory — some practitioners' clients are on mail clients that will
mangle anything clever, and this is a professional audience, not a newsletter.

Every template carries the unsubscribe link. Merge fields limited to: first name, referral code, signup URL,
portal URL. No invented claims about the product, no testimonials, no metrics.

### 4. The engine

`lib/engage.ts`: given "now", compute the due steps for eligible prospects, and for each one atomically claim
its ledger row (the unique constraint is the claim), decide, then act:

- suppressed (`unsubscribedAt` set) → `SUPPRESSED`, never sent
- sequence gated off or globally paused → `SKIPPED` with reason
- `emailConfigured() === false` → `UNCONFIGURED`, recorded, no exception
- otherwise render in the prospect's locale and send via `lib/notify.ts`, then `SENT`

**Idempotent by construction:** running the engine twice for the same "now" must produce no second message.
Prove it by running it twice in the gate.

Driven by the existing `/api/jobs/tick` pattern with `JOBS_SECRET` (C13-PACKAGES already establishes this) —
do not invent a second scheduler. Accept an explicit "as of" time for testability.

### 5. Admin surface

Extend `/admin/prospects` (existing `PLATFORM_ADMIN_EMAILS` gate, 404 otherwise): per-prospect message
history with status and reason, a queue view of what is due next, the kill-switch/pause state, and a
**dry-run** that shows exactly what the next tick would do without doing it. Jacob should be able to read the
sequence before it reaches forty people.

### 6. Unsubscribe

`app/(public)/unsubscribe/[token]` — one click, no login, no confirmation step, works in both languages.
Token is unguessable and single-purpose. Sets `unsubscribedAt` and says so plainly. Follows the wall pattern.

## Verify (this list is the gate — evidence required per item)

Write `audits/engage/verify.ts` in house style, self-cleaning, **passing with no `RESEND_API_KEY` present**:

1. Sequence definitions are well-formed: every step has a template that renders in **both** locales; no step
   references a missing merge field.
2. Eligibility: an `event-` LEAD gets `event-lead`; a `SIGNED_UP` prospect gets `founding-welcome`; a
   non-event LEAD (`source: web`) gets neither. Assert the negative case explicitly.
3. Scheduling honors offsets against an injected "as of" time — step 2 is not due on day 0 and is due on day 3.
4. **Idempotency: two ticks for the same "as of" produce exactly one ledger row per step.** Then prove the
   unique constraint itself refuses a duplicate insert.
5. **Mid-sequence conversion:** a LEAD partway through `event-lead` who becomes `SIGNED_UP` receives no
   further `event-lead` step and does receive `founding-welcome`. No "still thinking?" after signup.
6. Locale: an ES prospect's rendered message is Spanish; an EN prospect's is English; a prospect with no
   recorded locale gets a defined default rather than an empty string or a crash.
7. Suppression: an unsubscribed prospect's due steps record `SUPPRESSED` and **no send is attempted** — assert
   at the transport boundary, not just on the row.
8. Unsubscribe route: one click sets `unsubscribedAt`, renders in both languages, is idempotent when clicked
   twice, and a forged or unknown token neither unsubscribes anyone nor 500s.
9. Kill-switch: with the gate closed, a full tick sends nothing and records `SKIPPED` with a reason; with the
   global pause on, likewise.
10. **No-credential behavior: with `emailConfigured()` false, a full tick records `UNCONFIGURED` for every due
    step, throws nothing, and leaves the rows re-sendable once configured** — a prospect must not be
    permanently marked as messaged by a tick that never sent anything. This item is the whole point of the
    seam; be precise about it.
11. Every template in both languages passes the extended money/reward-language scanner; every message carries
    an unsubscribe link.
12. `AuditEvent` rows are metadata-only — no template bodies, no email addresses in the meta blob.
13. Admin: message history, queue, and dry-run render for an allowlisted email and 404 otherwise; the dry-run
    creates **no** ledger rows (assert the count before and after).
14. Regression, non-negotiable: `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean ·
    `npm run build` succeeds · `smoke` + `smoke:writes` PASS · `signup` **37/37** · `capture` **59/59** ·
    `referral` **68/68** · `platform/phase5-verify` **17/17** · `c21-verify` **58/58** · `c20-verify`
    **28/28** · `v31-verify` **32/32**.

## Out of scope (do not build)

Open/click tracking or any per-recipient telemetry (a deliberate posture decision — raise an
ARCHITECT-REQUEST if Jacob wants it) · SMS · in-app notifications · sequences beyond the two defined ·
reward mechanisms · changes to Valentina's client-visible chrome or any baselined screen · a second
scheduler.
