# C23-SIGNUP verify log

## 2026-09-05 — `audits/signup/verify.ts` → PASS 37/37

Built app on :3123, browser-driven (Playwright, 390×844), `PLATFORM_DOMAIN=platform.test`,
scratch DB, self-cleaning (throwaway tenants `signupprobe*`/`signuprate*` and
`signup-probe*@fixture.test` prospects removed on exit).

Covers the spec's Verify list 1–9:

- both locales render 200 with no price / "free" / dollar figure (screens **and** both catalogs)
- reachability: `/signup` linked from the public site
- happy path → `Tenant` ACTIVE on the chosen slug, 3 `TenantModule` rows, `TenantBilling`
  FOUNDING_COMP/ACTIVE with **zero Stripe objects**, practitioner `mustChangePassword=false`
  who really signs in with the CHOSEN password (wrong password still refused)
- the new portal serves on `<slug>.platform.test` wearing the practice's own wordmark, no DEMO banner
- confirmation screen names the portal address and the referral code
- `?ref=ABC123` → `referredByCode`; prospect SIGNED_UP with `tenantId` + `convertedAt`; codes unique
- `AuditEvent action="practitioner-signup"` attributed to the new practitioner, no password material
- duplicate slug and duplicate email each refused with their specific message, leaving **no orphan
  tenant** and no `SIGNED_UP` prospect
- every reserved slug refused (7 via the real form on distinct IPs+emails, all 95 via `checkSlug`)
- sub-floor password refused server-side with `required`/`minlength`/`pattern`/`novalidate` stripped
- rate limit trips (refused at attempt 4 — per-email cap)

Item 10 (regression) run separately, all at their pinned numbers: `lint:wall` clean ·
`guard-prisma` clean · `tsc --noEmit` clean · `npm run build` compiled · `smoke` PASS ·
`smoke:writes` PASS · `platform/phase5-verify` 17/17 · `c21-verify` 58/58 · `c20-verify` 28/28 ·
`v31-verify` 32/32 · `b3-verify` 24/24.

Pre-existing, unrelated: `tenant-stamp-audit` reports 2 null-tenant rows (`handwrittenNote`,
`appointment`) from other harnesses' probes — BUILD-STATE task #75. `PractitionerProspect` is
platform-level and cannot contribute to that audit.
