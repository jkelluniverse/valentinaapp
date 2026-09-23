# C23-CAPTURE verify log

## 2026-09-05 — `audits/capture/verify.ts` → PASS 59/59

Built app on :3124, browser-driven (Playwright, 390×844), `PLATFORM_DOMAIN=platform.test`,
`PLATFORM_ADMIN_EMAILS=capture-admin@fixture.test`, scratch DB, self-cleaning (throwaway
`capture-probe*@fixture.test` prospects, their `prospect-capture` audit rows, and the two
throwaway practitioners removed on exit).

Covers the spec's Verify list 1–10:

- `/join` renders 200 in **both** locales with no price / "free" / dollar figure (screens **and**
  both catalogs)
- minimum submission (name + email) submitted with **JavaScript disabled** → `/join/thanks`,
  `LEAD` prospect, unique non-empty `referralCode` shown on the success screen, nothing optional
  invented, `source` defaulted to `web`
- `?src=event-sept23&ref=ABC123` → `source` + `referredByCode`; optional fields stored verbatim
- re-submitting the same email (UPPERCASE the second time) upserts: one row, fields updated,
  `referralCode` unchanged, the FIRST `referredByCode` preserved
- a `SIGNED_UP` prospect who submits `/join` keeps `status`, `tenantId`, `convertedAt` and code —
  and the new details still land
- missing name → `error=missing`, malformed email → `error=email`, both with
  `required`/`maxlength`/`type=email` stripped and `novalidate` set; neither wrote a row
- honeypot submission refused and wrote nothing; rate limit trips (refused at attempt 6 —
  per-email cap 5)
- `AuditEvent action="prospect-capture"` per capture, meta keys exactly
  `created,hasNote,hasPhone,prospectId,referralCode,referredByCode,source,status`, no email /
  phone / note body / name anywhere in the row, tenant-stamped (no new null-tenant rows)
- `/admin/prospects` 200 for the allowlisted admin, **404** for a signed-in non-allowlisted
  practitioner (CSV route too; 307 for signed-out); filtered counts `Total 3` / `2 LEAD` /
  `1 SIGNED_UP` / `3 capture-probe-csv` match the seeded rows; email search returns `Total 1`
- CSV export `text/csv; charset=utf-8` + attachment, headers exactly the 11 documented columns,
  one row per prospect; `O'Brien, "Ana" Núñez`, `Zoë Müller`, `Carl Ø Ærø` and a note reading
  `Said "yes, maybe", then left` round-trip byte-identical through an independent RFC 4180 parser;
  converted row exports `tenantSlug=valentina`
- QR page: inline `<svg>` in the page's own HTML, **0** third-party requests recorded by a
  Playwright request listener, path data matching an independently regenerated
  `QRCode.toString("https://platform.test/join?src=event-sept23")`, that URL also present as
  page text, 404 for a non-allowlisted signed-in practitioner
- extra: the `/join` → `/signup` handoff link carries both `?ref=` and `?src=`

Item 11 (regression) run separately, all at their pinned numbers: `lint:wall` clean ·
`guard-prisma` clean · `tsc --noEmit` clean · `npm run build` compiled · `smoke` PASS ·
`smoke:writes` PASS · `audits/signup/verify.ts` 37/37 · `platform/phase5-verify` 17/17 ·
`c21-verify` 58/58 · `c20-verify` 28/28 · `v31-verify` 32/32.

Pre-existing, unrelated: `tenant-stamp-audit` and `audits/platform/verify.ts` both report the same
2 null-tenant rows (`handwrittenNote`, `appointment`) from other harnesses' probes — BUILD-STATE
task #75. Capture's own audit rows are tenant-stamped and `PractitionerProspect` is platform-level,
so neither can contribute to that count. The 16-screen byte baseline is stale against this scratch
dataset/clock (all 15 comparable screens differ, including screens this build cannot touch) — see
the build report.
