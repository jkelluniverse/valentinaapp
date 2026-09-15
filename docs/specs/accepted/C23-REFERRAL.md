# C23-REFERRAL — attribution and the reason to share

**Spec:** C23-REFERRAL · **Depends-on:** C23-SIGNUP, C23-CAPTURE (`PractitionerProspect`, `referralCode` issued at creation, `referredByCode` first-touch-wins, `/admin/prospects`, `lib/platform-admin.ts`)
**Priority:** highest — third of the four event surfaces, and the one that decides whether the event's reach ends when the room empties.
**Architect:** decided 2026-09-05.

## Why this exists

Every prospect already carries a unique `referralCode`, and `?ref=` is already captured verbatim on both
`/join` and `/signup` with first-touch winning. What is missing is the half that makes any of it matter:
nobody can see whether their code did anything.

A code with no visible consequence is not an incentive; it is a string. This spec closes the loop —
attribution that is honest, and a surface where a founding partner can see that three people came in behind
them and pass the code to a fourth.

## The line this build does not cross

Jacob has ratified the offer as a **finished portal plus founding-partner recognition — no discount, no
promised reward.** So this build creates **no reward mechanism, no credits, no commission, no tier ladder,
and it promises the referrer nothing.** It shows what is true (people came in through you, and you are a
founding partner) and stops there.

That is a deliberate product position, not an oversight: §7 pricing is unratified, so any reward with a cash
value would be inventing a commercial term Jacob has not signed. If the copy you are about to write implies
a benefit, delete it. If the design feels like it needs a carrot to be worth building, raise an
ARCHITECT-REQUEST instead of adding one.

## Standing laws this build must honor

- **The public wall (C18 §2)** — the public referral landing follows the established pragma pattern; no
  data-reading imports on the public surface. `lint:wall` stays clean.
- **Bilingual parity (law #7)** — every string in `messages/{en,es}/`, `?lang=` mechanism.
- **No unratified price and no promised reward** — see above. No figure, no "free", no "earn".
- **Attributable audit (law #6)** — attribution events are auditable, metadata only.
- **Privacy of the referrer** — a visitor arriving on someone's code must NOT be shown that person's name,
  email, or practice. They were invited by "a founding partner", not by a named individual who never
  consented to being named to strangers.
- **Server-side enforcement** — attribution is computed server-side and never trusted from the client.

## Build order

### 1. Attribution, derived — no new model

Attribution is already recorded: `PractitionerProspect.referredByCode` is immutable first-touch, and
`status`/`tenantId` say whether that prospect converted. Derive counts from those columns rather than
introducing a parallel ledger that can disagree with them. Two sources of truth for the same fact is how
you get a referral dispute you cannot settle.

Add the index needed to make `referredByCode` lookups cheap. In `lib/referrals.ts`, expose: resolve a code to
its owning prospect, count that code's prospects split by `LEAD` vs `SIGNED_UP`, and list them for the owner's
own view (first names only — see §3).

**Integrity rules, all server-side:**
- **Self-referral refused.** A prospect's own code must never attribute to themselves — check at capture and
  at signup, and prove it in the gate.
- **An unknown or malformed code is ignored, never an error.** A visitor mistyping a code still gets to sign
  up; the code is simply stored as given and attributes to nobody. Losing a signup to a typo is the worse
  failure.
- **First touch is immutable** (already true) — confirm this build cannot break it.

### 2. Public referral landing

`?ref=CODE` on `/join` and `/signup` already works. Add, on both, a quiet in-language line when the code
resolves: *invited by a founding partner* — no name, no practice, no email. When the code does not resolve,
show nothing at all rather than an error or a warning; a visitor should never be made to feel they arrived
wrongly.

### 3. `/practitioner/referrals` — the referrer's own view

A **new route**, linked from practitioner settings. **Do not add anything to the practitioner dashboard or
any other screen covered by the 16-screen byte baseline** — a new route keeps this build clear of Valentina's
chrome entirely, which is the point.

Shows the signed-in practitioner: their code, a one-tap share (copy link, `mailto:`, `sms:` — the same
pattern `/join/thanks` uses), how many prospects arrived on their code and how many became practices, and
their founding-partner standing. Names shown to a referrer are **first name only** — enough to recognise
someone they invited, not a contact list they can export.

Bilingual. Honest when the count is zero: a plain invitation to share, never a fabricated milestone or a
progress bar toward a reward that does not exist.

### 4. Admin visibility

Extend `/admin/prospects` (existing `PLATFORM_ADMIN_EMAILS` gate, 404 for everyone else, no new role): a
top-referrers view — code, owner, prospects referred, conversions — and `referredByCode` already in the CSV.
This is how Jacob learns which founding partner is actually carrying the network.

## Verify (this list is the gate — evidence required per item)

Write `audits/referral/verify.ts` in house style: spawn `next start` on an unused fixed port, run against the
scratch DB, self-cleaning. Prove:

1. A code resolves to its owner; counts split `LEAD` vs `SIGNED_UP` correctly across a seeded fan-out of at
   least three prospects, one converted.
2. `/join?ref=CODE` and `/signup?ref=CODE` show the "invited by a founding partner" line in **both** locales,
   and **never** the referrer's name, email, or practice name — assert those strings are absent from the
   rendered HTML.
3. An unknown code and a malformed code both render **no** invited-by line and **no** error, and a signup
   with an unresolvable code still completes.
4. **Self-referral refused** at both `/join` and `/signup`: a prospect submitting their own code attributes
   to nobody, and no self-referential row survives.
5. First touch still immutable: a second `?ref=` never overwrites the first.
6. `/practitioner/referrals` renders for a signed-in practitioner showing their own code and counts; shows
   **only first names** of referred prospects (assert full surnames and emails absent); renders an honest
   zero state; **404s or redirects for a signed-out visitor**; and one practitioner can never see another's
   referral data (assert cross-tenant isolation explicitly).
7. No reward, price, or earning language anywhere in the new surfaces or catalogs — extend the money-language
   scanner from `audits/capture/verify.ts` with "earn", "reward", "commission", "bonus", "discount", "credit"
   and run it over every new page and both catalogs.
8. Admin top-referrers view renders for an allowlisted email, 404s otherwise, and its counts match the
   seeded fan-out.
9. `AuditEvent` for attribution is metadata-only.
10. Regression, non-negotiable: `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean ·
    `npm run build` succeeds · `smoke` + `smoke:writes` PASS · `audits/signup/verify.ts` **37/37** ·
    `audits/capture/verify.ts` **59/59** · `platform/phase5-verify` **17/17** · `c21-verify` **58/58** ·
    `c20-verify` **28/28** · `v31-verify` **32/32**. Moving any of those numbers means not done.

## Out of scope (do not build)

Any reward, credit, discount, commission, or tier mechanism · follow-up email sequences (C23-ENGAGE) ·
public leaderboards or anything that names one practitioner to another without consent · changes to the
practitioner dashboard or any baselined screen · pricing surfaces · a parallel attribution ledger.
