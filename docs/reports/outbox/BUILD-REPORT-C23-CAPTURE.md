# BUILD-REPORT — C23-CAPTURE

- **Spec:** C23-CAPTURE — the event floor · **Status:** VERIFIED
- **Gate:** `audits/capture/verify.ts` — **59/59 PASS**. Full regression list (item 11) re-run: all
  numbers held (signup 37/37 · phase5 17/17 · c21 58/58 · c20 28/28 · v31 32/32 · smokes PASS ·
  wall/guard/tsc/build clean).
- Built on the scratch DB (`valentina_scratch`, migration 45 applied). No migration added — the
  spec's model already existed. Tree left dirty and uncommitted for Architect review.

## Built

**§1 The capture form**
- `app/(public)/join/page.tsx` — one screen, phone-first. Required: name, email. Optional: practice
  name, phone, "what brings you?". Derived: `source` from `?src=` (default `web`), `referredByCode`
  from `?ref=`. **Zero client components in the route** — plain server-rendered form posting to a
  server action, so it submits before any bundle arrives (proved with `javaScriptEnabled: false`).
  Time-trap timestamp is stamped on the SERVER at render time for the same reason. Bilingual via the
  ratified `?lang=` mechanism + on-screen EN/ES toggle. `noindex` (ruling #4).
- `app/(public)/join/thanks/page.tsx` — success state: renders their own `referralCode` big, plus
  one-tap sharing as plain `mailto:` / `sms:` hrefs (no clipboard API, no Web Share API, no
  hydration) with the full link also printed as text. Route to `/signup` carried through.
- Handoff: the `/signup` link on `/join` carries `?ref=` **and** `?src=`. To make that non-lossy,
  `/signup` now reads `?src=` and passes it to the prospect row (see Discrepancies #1 — smallest
  possible change to a shipped build, 3 lines).

**§2 The server action**
- `app/(public)/join/actions.ts` — first line `// wall-allow: capture writes only the platform
  prospect ledger; no client data`. Honeypot + time-trap + sliding-window caps on **both** IP (12/h)
  and email (5/h). Caps are higher than signup's on purpose: a conference NAT is legitimately many
  practitioners.
- `lib/prospect-capture.ts` — `captureProspect()`. Server-authoritative validation (name present,
  email shape, every optional field length-capped), upsert by lowercased email, `AuditEvent`.
  Invariants: a `SIGNED_UP` prospect is **never** downgraded and never loses `tenantId` /
  `convertedAt`; the **first** `referredByCode` wins; `referralCode` is issued once and never
  reissued; an optional field absent from a second submission does not blank the stored one.
  (Named `prospect-capture` because `lib/capture.ts` is the SESSION pipeline's capture service —
  untouched.)
- Uses the **scoped** client `@/lib/prisma`, not the raw one: `PractitionerProspect` is
  platform-level (outside `SCOPED_MODEL_SET`) so it passes through, and the `AuditEvent` gets
  stamped with the request's tenant. Nothing is cross-tenant, so **no new `guard-prisma` allowlist
  entry for product code** — the only allowlist addition is the acceptance harness.

**§3 `/admin/prospects`**
- `app/admin/prospects/page.tsx` — every column the spec lists (name, email, phone, practice, note,
  status, source, referredByCode, their own referralCode, tenant slug if converted, created),
  newest first, filterable by status and source, searchable by email, with counts by status and by
  source over the current filter plus a total.
- `app/admin/prospects/export/route.ts` — CSV of the current filter; RFC 4180 quoting on every
  field; `text/csv; charset=utf-8` + `attachment`.
- `lib/prospects.ts` — the shared query layer (page and export cannot disagree) + the CSV writer.
- `lib/platform-admin.ts` — `isPlatformAdmin(email)` reading the existing `PLATFORM_ADMIN_EMAILS`
  env allowlist. **No new role invented**; identical rule to `/admin/tenants/new`, extracted only
  so the three new surfaces cannot drift. 404 (not 403) for everyone else, including the CSV route.

**§4 The event QR**
- `app/admin/prospects/qr/page.tsx` — `qrcode` → `toString({ type: "svg" })`, server-side, inline in
  the page's own HTML. Error-correction level H, pure black on white, print styles, bilingual
  heading. Target URL printed underneath at 2xl–3xl mono. `?src=` overridable, default
  `event-sept23` from `lib/capture-config.ts`. Host from `PLATFORM_DOMAIN`, falling back to the
  request origin so a printed code is never a relative path.
- `package.json`: `qrcode ^1.5.4` (dep) + `@types/qrcode ^1.5.6` (dev). Nothing else added.

**Copy** — `messages/en/capture.json` + `messages/es/capture.json`, full parity, every string in
both. Honest data posture (law #8) stated on the screen in both languages: what the email is used
for, and that the form is not for client information. No dollar figure, no "free", no rate.

## Verification — `audits/capture/verify.ts`, 59/59

Written in `audits/signup/verify.ts` house style: spawns `next start` on unused fixed port 3124,
runs against the scratch DB, throwaway prospects + two throwaway practitioners, self-cleaning.

| # | Spec verify item | Result | Evidence |
|---|---|---|---|
| 1 | `/join` 200 both locales, no price | **PASS** | `status 200` for `/join` and `/join?lang=es` with in-language markers; the 8-pattern money regex finds nothing in either rendered page or either catalog |
| 2 | Minimum submission → LEAD + unique non-empty code, shown on screen | **PASS** | Submitted with **JS disabled** → `/join/thanks?code=DZ3H2SQ3`; row `status LEAD`, code `DZ3H2SQ3` present on the screen; `phone/practiceName/note` all null; `source` defaulted to `web` |
| 3 | `?src=event-sept23&ref=ABC123` lands | **PASS** | row reads `event-sept23 / ABC123`; optional fields stored verbatim |
| 4 | Re-submit upserts | **PASS** | one row for that email (second pass used an UPPERCASE address), name+phone updated, `BCF9BDB6 → BCF9BDB6` unchanged, first `FIRSTREF` survived `SECONDREF`, thanks screen shows the same code |
| 5 | `SIGNED_UP` prospect not downgraded | **PASS** | after submit: `status SIGNED_UP`, `tenantId tnt_valentina_000000001`, `convertedAt` unchanged, `referralCode PROBECNV` not reissued — and the new name/phone still landed |
| 6 | Missing name / bad email refused server-side, client validation bypassed | **PASS** | `required`/`maxlength`/`type=email` stripped + `novalidate`; `error=missing` and `error=email`; zero rows created by either |
| 7 | Rate limit trips; honeypot refused | **PASS** | honeypot filled by script → `/join?error=rate`, nothing written; repeated submissions refused at attempt 6 (per-email cap 5) |
| 8 | `AuditEvent`, capture metadata only | **PASS** | 2 rows `action=prospect-capture`; meta keys exactly `created,hasNote,hasPhone,prospectId,referralCode,referredByCode,source,status`; blob contains no email, phone, note body or name; rows tenant-stamped (`tnt_valentina_000000001`, so no new null-tenant rows) |
| 9 | `/admin/prospects` gating, counts, CSV | **PASS** | 200 + "Practitioner prospects" for the allowlisted admin; **404** for a signed-in non-allowlisted PRACTITIONER (and 404 for the CSV route, 307 for signed-out); filtered page shows `Total 3` / `2 LEAD` / `1 SIGNED_UP` / `3 capture-probe-csv` matching the seeded rows; email search `Total 1`; CSV `200 text/csv; charset=utf-8` + attachment, headers exactly the 11 documented columns, 3 data rows for 3 prospects; `O'Brien, "Ana" Núñez`, `Zoë Müller`, `Carl Ø Ærø` and a note reading `Said "yes, maybe", then left` all round-trip byte-identical through an independent RFC 4180 parser; converted row exports `tenantSlug=valentina` |
| 10 | QR page: inline SVG, no external request, encodes the URL, URL as text | **PASS** | 200; `<svg>` in the page's own HTML with no `<img>`; Playwright request listener recorded **0** non-same-origin requests; the page's path data matches an independently regenerated `QRCode.toString(https://platform.test/join?src=event-sept23)` (2241 chars compared); that URL also present as page text; 404 for a non-allowlisted signed-in practitioner |
| 11 | Regression, non-negotiable | **PASS** | `lint:wall` "public wall intact" · `guard-prisma` "clean" · `tsc --noEmit` silent · `npm run build` "Compiled successfully" · `smoke` "SMOKE PASS" · `smoke:writes` "WRITE SMOKE PASS" · `audits/signup/verify.ts` **37/37** · `platform/phase5-verify` **17/17** · `c21-verify` **58/58** · `c20-verify` **28/28** · `v31-verify` **32/32** |

Extra checks beyond the list (same harness): the `/signup` handoff link really carries both
`?ref=` and `?src=` (`href="/signup?ref=ABC123&src=event-sept23"`).

### Standing gates not in item 11
- `audits/tenant-stamp-audit.ts` — **FAIL, pre-existing and unchanged**: the same 2 null-tenant rows
  (`handwrittenNote` 1, `appointment` 1) BUILD-STATE task #75 records from other harnesses' probes.
  Neither is a prospect or a capture audit row; capture's own audit rows are tenant-stamped (proved
  above). Not worsened, not fixed.
- `audits/platform/verify.ts` — isolation, host resolution and all-79-table cross-tenant checks
  PASS; the single failing check is the same null-tenant count above. It rewrote its own gitignored
  `audits/platform/isolation-verify.out.md`.
- 16-screen byte baseline (`scripts/baseline.ts --diff`) — **all 15 comparable screens differ,
  including `/login` and every `/space` screen, none of which this build touches.** The baseline is
  stale relative to this scratch dataset/clock, exactly as the script's own header warns ("a reseed
  invalidates the baseline… the clock invalidates it too"). No portal/client code was modified by
  this build (see the file list — nothing under `app/practitioner`, `app/space`, `components/` or
  Valentina's chrome). I did **not** recapture it: a fresh baseline is a deliberate act on a
  known-good dataset, not a side effect of a feature build. Flagged rather than smoothed over.

## Discrepancies & decisions needed

1. **`/signup` now reads `?src=` (a 3-line change to a shipped build).** §1 requires the handoff to
   `/signup` to carry `?ref=` and `?src=` "so attribution is not lost". As shipped, `/signup`
   ignored `?src=` and hardcoded `source = ref ? "referral" : "web"`, so a link carrying `src`
   into a page that discards it would satisfy the letter and not the requirement. Changed:
   `app/(public)/signup/page.tsx` reads `?src=` (capped 120) and passes it through; `SignupForm.tsx`
   sets the hidden `source` to `src || (refCode ? "referral" : "web")`; the locale toggle preserves
   it. Signup gate still 37/37. **Question:** confirm this is the intended reading, or should the
   handoff drop `src` instead and leave C23-SIGNUP untouched?
2. **`AuditEvent.actorId` for a capture.** The schema requires `actorId`, and a capture has no
   signed-in actor. I set `actorId = prospect.id` (the row that acted), `action =
   "prospect-capture"`. The alternative was a sentinel string like `"anonymous"`, which is less
   attributable. No spec text covers it. **Question:** ratify `actorId = prospect.id`, or specify a
   sentinel.
3. **In-memory rate limiting, stated plainly as C23-SIGNUP did.** `IP_HITS`/`EMAIL_HITS` are
   per-process maps. On one instance they are a real speed bump; behind more than one instance, or
   after a restart, they reset, and a distributed submitter gets N× the cap. Not a fortress. A
   shared store (Redis/DB) is a platform decision, not this build's — raising it, not building it.
4. **Caps chosen, not specified.** IP 12/h, email 5/h, 1-hour window; field caps name 120, email
   200, phone 40, practice 160, note 500, source 120, ref 64 (`lib/capture-config.ts`). Numbers are
   mine — a lead form on conference NAT needs more headroom than tenant creation. Say the word if
   any is wrong.
5. **Counts are scoped to the current filter, not global.** §3 asks the page to answer "how many did
   we get" without arithmetic; unfiltered it shows the whole ledger, filtered it shows that slice.
   That seemed strictly more useful than a fixed global tally. Flagging in case the intent was
   always-global counts alongside a filtered table.

Nothing in the "Out of scope" list was built: no referral attribution or rewards, no leaderboard,
no follow-up sequences, no offline/PWA capture, no change to Valentina's client-visible chrome, no
pricing surface.

## Cost / ops notes

- **New dependency:** `qrcode ^1.5.4` + `@types/qrcode ^1.5.6` (dev). Pure JS, no native build, no
  network at render time. `package.json` / `package-lock.json` changes are limited to exactly these.
- **No new env var.** `PLATFORM_ADMIN_EMAILS` and `PLATFORM_DOMAIN` are both existing; the QR page
  degrades to the request origin when `PLATFORM_DOMAIN` is unset. **Ops action before Sept 23:**
  `PLATFORM_ADMIN_EMAILS` must contain Jacob's real address in production, or `/admin/prospects`
  404s for him.
- **No migration.** `PractitionerProspect` + migration 45 shipped with C23-SIGNUP; this build only
  writes to it.
- **No vendor touched.** No email is sent on capture (deliberate — `C23-ENGAGE` owns follow-up), so
  no Resend dependency and nothing to configure for the event.
- **`guard-prisma` allowlist:** one addition, `audits/capture/verify.ts` (acceptance harness,
  browser-driven, self-cleaning), justified in `scripts/guard-prisma.ts` and
  `docs/PRISMA-ALLOWLIST.md`. Product code needed none.
- `STRUCTURE.md` updated with C23-SIGNUP and C23-CAPTURE rows, closing ruling #6's deferred item.
- **Print check still owed by a human:** the QR was proven to encode the right URL and to make no
  third-party request, but nobody has put it through an actual black-and-white printer. Ten minutes
  with the office printer before the event.
