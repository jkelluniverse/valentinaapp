# C23-CAPTURE — the event floor

**Spec:** C23-CAPTURE · **Depends-on:** C23-SIGNUP (`PractitionerProspect`, `lib/signup-config.ts`, the `?lang=` locale mechanism, the wall-allow precedent)
**Priority:** highest — second of the four event surfaces. C23-SIGNUP catches the practitioner who commits in the room; this catches everyone else, and everyone else is most of them.
**Architect:** decided 2026-09-05.

## Why this exists

At a training event most interested practitioners will not sign up on the spot. They are between sessions,
their hands are full, the wifi is bad, and committing to a new platform is not a thing people do standing up.
If the only path is full signup, those people leave as a memory instead of a record.

So: a ten-second capture. Name and email, everything else optional, and a lead in the ledger Jacob can work
the following week. `PractitionerProspect` already exists with `status: LEAD` and a `referralCode` issued at
creation — this spec builds the surface that creates those rows, and the admin view that makes them useful.

It must also survive the room: a conference network, a borrowed phone, one hand.

## Standing laws this build must honor

- **The public wall (C18 §2)** — same pattern as C23-SIGNUP: a narrow server action whose FIRST line is
  `// wall-allow: <reason>`, writing only `PractitionerProspect`. `npm run lint:wall` stays clean.
- **Bilingual parity (law #7)** — every string in `messages/{en,es}/`, using the `?lang=` mechanism ratified
  for the public surface. At a bilingual event with majority-Hispanic attendance this is a working
  requirement, not a checkbox.
- **No unratified price** — no dollar figure, no "free", no promised rate. Founding-partner language only.
- **Attributable audit (law #6)** — capture writes an `AuditEvent`. Metadata only.
- **Honest data posture (law #8)** — this is a marketing lead form, NOT client data and not HIPAA-adjacent.
  Say plainly what the email will be used for. Never imply protections we do not offer.
- **Server-side enforcement** — every validation authoritative on the server.

## Build order

### 1. `app/(public)/join` — the capture form

One screen, phone-first, thumb-reachable. **Required: name, email.** Optional: practice name, phone,
"what brings you?". Hidden/derived: `source` (from `?src=`, defaulting to `web`), `referredByCode` (from
`?ref=`).

Constraints that matter more than polish here:
- Minimal JavaScript. It must submit on a saturated conference network — a plain form post that works
  without client-side hydration, not a fetch-driven SPA flow.
- Success state renders the person's own `referralCode` and a one-tap way to pass it on. This is the moment
  they are most willing to share; make sharing possible without an account.
- A visitor who arrives already wanting an account gets an obvious route to `/signup`, carrying `?ref=` and
  `?src=` through so attribution is not lost at the handoff.
- Submitting twice with the same email is upsert-idempotent, not a duplicate row and not an error the
  visitor has to understand.

### 2. The server action

First line `// wall-allow: capture writes only the platform prospect ledger; no client data`.

1. Validate: name present, email shape. Everything else optional and length-capped.
2. Upsert `PractitionerProspect` by lowercased email. **Never downgrade a `SIGNED_UP` prospect back to
   `LEAD`** — someone who already owns a practice and later fills the form must keep their tenant link.
   Preserve the first `referredByCode` and the existing `referralCode`; do not reissue.
3. Write the `AuditEvent`.
4. Reuse `lib/signup.ts`'s rate limiting shape (per-IP and per-email), honeypot, and time-trap. State the
   in-memory-per-instance limitation in the report, as C23-SIGNUP did — do not pretend it is a fortress.

### 3. `/admin/prospects` — the list Jacob works

Gated by the existing `PLATFORM_ADMIN_EMAILS` allowlist, exactly as `/admin/tenants/new` is: renders for the
allowlist, 404 for everyone else, and **no new role is invented**.

Shows every prospect: name, email, phone, practice, note, status, source, `referredByCode`, their own
`referralCode`, tenant link if converted, created date. Newest first, filterable by status and source,
searchable by email. Include a count by status and by source — after the event Jacob's first question is
"how many did we get," and the page should answer it without arithmetic.

**CSV export** of the current filter. This is the follow-up list; it has to leave the building.

### 4. The event QR

Add the `qrcode` dependency and render, server-side on an admin page, a printable QR for
`/join?src=event-sept23` (host from `PLATFORM_DOMAIN`) as inline SVG — no external image service, no
client-side generation, no third-party request from the page. Show the target URL in large plain text
beneath it, because a QR that fails leaves the URL, and a URL that fails leaves nothing.

Print-friendly: a page that survives a black-and-white printer at arm's length on a table.

## Verify (this list is the gate — evidence required per item)

Write `audits/capture/verify.ts` in house style: spawn `next start` on an unused fixed port, run against the
scratch DB, self-cleaning. Prove:

1. GET `/join` renders 200 in both locales; no price, no "free", no dollar figure in either.
2. Minimum submission (name + email only) creates a `LEAD` prospect with a unique non-empty `referralCode`;
   the success screen shows that code.
3. `?src=event-sept23&ref=ABC123` lands in `source` and `referredByCode`.
4. Re-submitting the same email upserts: still one row, fields updated, `referralCode` unchanged.
5. **A `SIGNED_UP` prospect who submits `/join` is NOT downgraded** — status and `tenantId` survive.
6. Missing name or malformed email refused server-side with the client validation bypassed.
7. Rate limit trips; honeypot submission refused.
8. `AuditEvent` written, containing no more than capture metadata.
9. `/admin/prospects` renders for an allowlisted email and **404s for a non-allowlisted signed-in user**;
   counts match the seeded rows; CSV export returns correct headers and one row per prospect, with commas,
   quotes and non-ASCII names surviving the round trip.
10. The QR page renders inline SVG (no external requests) encoding the expected URL, with the URL also
    present as text.
11. Regression, non-negotiable: `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean ·
    `npm run build` succeeds · `smoke` + `smoke:writes` PASS · `audits/signup/verify.ts` still **37/37** ·
    `platform/phase5-verify` **17/17** · `c21-verify` **58/58** · `c20-verify` **28/28** ·
    `v31-verify` **32/32**. Moving any of those numbers means not done.

## Out of scope (do not build)

Referral attribution, reward logic, or a referrer leaderboard (C23-REFERRAL) · follow-up email sequences
(C23-ENGAGE) · offline/PWA capture with background sync (raise an ARCHITECT-REQUEST if the room genuinely
demands it rather than building it here) · any change to Valentina's client-visible chrome · pricing surfaces.
