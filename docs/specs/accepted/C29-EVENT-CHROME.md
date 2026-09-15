# C29-EVENT-CHROME — a founding practitioner should never see someone else's brand

**Spec:** C29-EVENT-CHROME · **Depends-on:** C26 (typed resolution), PLATFORM Phase 5 (tenant-aware portal shells), C23-SIGNUP
**Priority:** **event-day. Ahead of C28.** Freeze deadline **Sept 18.**
**Architect:** decided 2026-09-14 on the F2 determination in BUILD-REPORT-C27-EMAIL-IDENTITY-P2.

## Why this exists

The F2 finding is on the demo path, which the report understated.

The September 23 demo is: a practitioner signs up in the room, then goes to their own portal. The screen
they meet on the way in is `/login` — and it renders the literal string `veritas ✧`, hardcoded, on every
host. So the first thing a founding practitioner sees after signing up is **another practice's brand**.

Two separate defects, one cause:

1. **The auth screens hardcode the wordmark.** `app/login/page.tsx:51`, `app/forgot/page.tsx:19`,
   `app/must-change/page.tsx:29`, `app/reset/[token]/page.tsx:31` all print `veritas ✧` as a literal.
   Meanwhile the **portal shells already do this correctly** — `app/practitioner/layout.tsx:39` and
   `app/space/intake/page.tsx:193` both read `(tenant.branding ?? {}).portalTitle || "veritas"`. So the
   pattern exists and is proven; the auth screens simply never adopted it.
2. **A non-default tenant's public root serves Valentina's marketing copy.** `app/(public)/page.tsx` is
   force-static over her copy with no host awareness — identical bytes on every host. The booking funnel
   *inside* that wrapper is tenant-correct (C26's control proved it), so the defect is the static wrapper,
   not the data.

**Why PLATFORM Phase 5 is not to blame.** Its verify log records a deliberate decision that "the auth screen
deliberately stays platform-branded." That was correct when the platform's brand *was* veritas. The mark has
since moved to Psychefolio (USPTO approved, assets committed under `public/brand/`), so the decision is now
stale rather than wrong.

## The design, and why it needs no acceptance gate from Valentina

`/login` is **client-visible** — her clients sign in there, and it is one of the 16 baselined screens. The
standing decision says client-visible chrome changes require Jacob's explicit acceptance. So the obvious fix
(put the Psychefolio lockup on the auth screens) is the wrong one: it would show her clients a vendor's brand
and it would break her byte baseline.

Do this instead: **make the auth screens resolve the wordmark exactly as the portal shells already do.**

- Her host resolves to the default tenant, whose `branding.portalTitle` **is** `"veritas"` → her auth
  screens render **byte-identical** output. No baseline change, no acceptance needed, nothing her clients
  see changes.
- Practice B's host resolves to B → B's own wordmark. The defect is gone.
- A platform host (`psychefolio.com`, once it points at the app) is the only place the Psychefolio identity
  belongs. If that host does not resolve to a tenant today, use the platform identity there — and if that
  turns out to require brand-web work not yet done, **say so and leave it**; it is not event-critical.

For the public root, **redirect rather than design.** A non-default tenant's root goes to that practice's own
booking page, which is already tenant-correct. Do **not** invent a per-practice marketing page — what a
practice's public site should say is a product decision belonging to the brand-web track, not a bug fix four
days before a freeze. The default tenant's root stays exactly as it is.

## Assumptions to verify, not trust

*(Ruling 18.)*

1. The four auth files listed above are the complete set of hardcoded `veritas ✧` wordmarks in user-facing
   chrome. **Sweep for others** — the grep above also found the string in `.ics` UIDs, filenames and a
   webhook header, which are **not** chrome and must be left alone.
2. `branding.portalTitle` for the default tenant is exactly `"veritas"`, so resolving it yields
   byte-identical auth screens for her hosts. Prove this rather than assume it; the whole no-acceptance
   argument rests on it.
3. The auth screens can read the resolved tenant without violating the public wall or the C26 typed
   resolution — `/login` is not under `app/(public)/`, so check what the wall actually covers before
   assuming either way.
4. Under C26's `unresolved`, the auth screens must behave as C26 specifies (neutral, no borrowed identity) —
   confirm this spec does not reopen the hole C26 closed.
5. A non-default tenant has a reachable booking page to redirect to. If a practice with no availability
   configured would land on something broken or empty, say so and propose the honest alternative.

## Standing laws this build must honor

- **Server-side enforcement (law #5)** — resolve the wordmark server-side; no client-side brand swap.
- **Bilingual parity (law #7)** — any new or changed copy ships EN and ES.
- **Client-visible chrome requires acceptance** — which is precisely why the default tenant's output must be
  byte-identical. If any change to her screens proves unavoidable, **STOP and raise an ARCHITECT-REQUEST**
  rather than shipping it.
- **Kill-switch thinking (law #10)** — the root redirect should be trivially revertible.

## Build order

1. Auth screens (`/login`, `/forgot`, `/reset/[token]`, `/must-change`) resolve the wordmark from the
   request's tenant, reusing the portal shells' existing expression rather than inventing a second one.
2. Platform hosts get the Psychefolio identity **only** where a host genuinely resolves to no tenant and the
   assets already committed under `public/brand/` suffice. No new brand system work.
3. Non-default tenant public root redirects to that practice's booking page. Default tenant root untouched.
4. Nothing else. This is a four-day-before-freeze change on client-visible surfaces.

## Verify (this list is the gate — evidence required per item)

Write `audits/event-chrome-verify.ts` in house style, self-cleaning:

1. Each of the five assumptions confirmed or corrected in writing.
2. **The default tenant's `/login`, `/forgot`, `/reset/[token]` and `/must-change` are BYTE-IDENTICAL** to
   their pre-change output. Pin the comparison to a commit, never `HEAD` (ruling 37's scanner will catch you
   otherwise). This is the item that decides whether this ships at all.
3. Practice B's `/login` renders B's wordmark and the string `veritas` appears **nowhere** in the response.
4. Practice B's public root does not serve Valentina's marketing copy; it lands on B's own booking surface.
5. The default tenant's public root is byte-identical to its pre-change output.
6. An unknown slug behaves exactly as it does today.
7. Under C26's injected resolution failure, the auth screens and the root still fail closed as C26
   requires — no borrowed wordmark, no cross-practice content.
8. The 16-screen byte baseline: state explicitly whether it is affected. Per ruling 11 it is a
   within-session differential gate — capture after seeding and **before** touching code, then diff.
9. Regression, non-negotiable: the full standing set, including `email-identity` **28/28**,
   `fail-closed-tenancy` **18/18**, `practice-setting` **47/47**, `tenant-scope` **48/48**, `engage`
   **173/173**, `signup` **37/37**, `capture` **59/59**, `referral` **68/68**, `settings-i18n`,
   `gate-hygiene`, platform phases, c20/c21/v31, onboarding, password-reset, amd06, c12x — then the stamp
   audit **exit 0**, last.

## Out of scope (do not build)

A per-practice marketing homepage · the PSYCHEFOLIO-BRAND-WEB track · any change to Valentina's
client-visible chrome · a new brand token system · touching the non-chrome `veritas` strings in `.ics` UIDs,
export filenames, or the transcription webhook header.
