# PSYCHEFOLIO BUILD STATE

## Active track: (none — C23-SIGNUP accepted by the Architect 2026-09-05; next: C23-CAPTURE)

## Queue (dependency order):
1. (awaiting spec) C23-CAPTURE — event lead-capture form (out of scope for C23-SIGNUP)
2. (awaiting spec) C23-REFERRAL — referral attribution + rewards. UNBLOCKED by C23-SIGNUP:
   every `PractitionerProspect` is issued a unique `referralCode` at creation and `?ref=` is
   captured verbatim into `referredByCode`. Attribution logic deliberately NOT built.
3. (awaiting spec) C23-ENGAGE — follow-up sequences

## Built & verified: (list as completed)
Seeded 2026-09-05 from the repo's verify logs (audits/*/VERIFY-LOG.md) so the
PM starts with the true ledger, not an empty one.
- C1–C15, UI-1..3, P-1..3, AMD-05/06 — core product through messaging (2026-06/07)
- C12X intelligence layer + C12r reading + C13-PACKAGES/POLICY/BILLING-2/DASH
- C14-REMARKABLE R.1–R.5 · C19-RECORDING REC.1–REC.5 scaffold (consent-first, RecordingProvider adapter)
- SESSION-PIPELINE Phases 1–2 (AssemblyAI transcription, vendor-copy deletion, DRAFT extraction inbox) — 2026-07-22
- ONBOARDING v1.1 incl. §6 discovery layer — 2026-08-04
- PLATFORM Phases 0–5 (tenancy, scoping, guard, ReadingProvider, tools, provisioning + demo tenants) — 2026-08
- BILLING B1–B4 (Square OAuth, checkout links + webhook ledger, Stripe tenant subscriptions, hardening) — 2026-08
- C20-AGREEMENTS G.1–G.4 (send/sign/seal/keep) — 2026-08-04
- C20 v3.1 attorney master installed verbatim as DRAFT + engine gaps (initials, key-terms freeze, Addenda P/R/M wiring) — 2026-08-05
- C21 DOCSIGN (uploads, one-off email sends, direct sign links, stored practitioner signature, docx→fillable conversion, upload preview) — 2026-08-06/12
- C21.4/.5 payment authorization (es, card-free v2) — 2026-08-12
- C22/.1/.2 paper signing experience, drawn-signature-required, action-first desk — 2026-08-12
- C23-SIGNUP — the public front door: `PractitionerProspect` + migration 45, chosen-password
  provisioning, `app/(public)/signup` (bilingual, Warm Stone), wall-allowed server action with
  reserved-slug + rate limits + full rollback, confirmation screen, footer reachability
  (2026-09-05) — `audits/signup/verify.ts` **37/37**; report in docs/reports/outbox/.
  DECISIONS IN FORCE: `PractitionerProspect` is platform-level (outside SCOPED_MODEL_SET, outside
  the null-tenant audit); signups are ACTIVE + FOUNDING_COMP + journey-v1/warm-clay + the three
  standard modules (body-graph, archetypal-keys, values-spiral); reserved-slug list lives in
  `lib/signup-config.ts` (95 entries + `demo-` prefix + every existing tenant slug); password
  floor 8 (house floor); public locale via `?lang=`.

## Architect rulings — 2026-09-05 (C23-SIGNUP review, gates independently re-run: signup 37/37,
## c21 58/58, phase5 17/17, smoke + write smoke PASS, wall/guard/tsc clean, build clean)
1. **Public locale = `?lang=` + `Accept-Language` fallback + on-screen EN/ES toggle. RATIFIED
   as shipped.** Locale-prefixed public routes (`/es/...`) are a whole-public-tree decision with
   SEO and marketing-site consequences; they do not belong inside a signup build eighteen days
   from the event. Bilingual parity is satisfied — both catalogs ship and the gate proves both
   render. A future PUBLIC-I18N spec may migrate the whole public surface; until then `?lang=`
   is the sanctioned mechanism and new public copy follows it.
2. **`lib/signup.ts` + `audits/signup/verify.ts` allowlist entries RATIFIED.** Tenant-creation
   ingress is cross-tenant by nature: the request arrives on one tenant's host and creates rows
   belonging to a tenant that does not exist yet. A scoped client cannot perform the global
   `User.email` pre-check (email is platform-unique, so a scoped read misses another practice's
   owner and the duplicate surfaces as a mid-provision P2002 — the half-built practice the spec
   forbids), cannot roll back rows it does not own, and cannot write the new tenant's audit row.
   Structurally identical to the already-allowlisted `lib/payments/webhook.ts` and
   `lib/billing/lifecycle.ts`. Additions only; no rule weakened; both entries carry justifications
   in `docs/PRISMA-ALLOWLIST.md`.
3. **Password floor stays 8, matching `/must-change`. RATIFIED.** One floor in one constant beats
   two defensible numbers. Raising it is a product decision with real friction on a phone at an
   event; composition rules and breach-list checks are deliberately not invented here.
4. Signup screens stay `noindex` until Jacob launches publicly — a pre-launch acquisition surface
   should not be indexed by accident. One line to revert when he wants it found.
5. `messages/{locale}/{ns}.json` namespacing confirmed as the house convention; `branding.portalTitle
   = practiceName` confirmed (unset falls back to our internal "veritas" wordmark, which a
   practitioner must never see); the three standard modules confirmed as body-graph,
   archetypal-keys, values-spiral.
6. Deferred, deliberately: `STRUCTURE.md` is now slightly stale on the new routes/libs — folded
   into the next cycle rather than held against this build.
- Standing gates on every build: c21-verify 58/58 · v31-verify 32/32 · c20-verify 28/28 ·
  16-screen visual baseline · GET/write smokes · tenant-stamp audit · platform isolation verify

## Blocked / awaiting Architect:
- (code, low priority) task #76 — `/admin/tenants/new` shares the latent flaw C23-SIGNUP works around:
  `provisionTenant()` called inside a request checks practitioner-email uniqueness only within
  the request's tenant scope, so a cross-tenant duplicate would surface as a mid-provision P2002.
  Reachable only by the PLATFORM_ADMIN_EMAILS allowlist. Signup itself is immune (global
  pre-check + rollback).
- (Jacob/counsel) v3.0 sections for the v3.1 master; Spanish legal translation; Ch. 490 blessing;
  PRACTICE_EMAIL env; Addendum P election default; Addendum R retention confirmation; then flip
  `client-services-agreement` DRAFT→ACTIVE (deliberate DB act, excluded from upload-confirm path)
- (Architect) C19 continuation spec — pipeline Phase 3+ / Pocket capture layer (adapter seam ready)
- (Jacob go-ahead, no spec needed) C22 phase 2 — uploaded-PDF render-and-fill (pdf.js + pdf-lib,
  drag-drop field placement, coordinate stamping)
- (Jacob acceptance) PLATFORM Phase 6 canvas-v1 — spec held; gated on acceptance of Phases 0–5
- (code, anytime) task #75 — auto-stamp nested relation writes with tenantId (nightly audit is the net)
- (Jacob decision) Cloudflare R2 storage cutover (local driver live; config swap)

## Standing laws: specs are law; verbatim legal text; evidence-mandatory AI; no invented features;
   kill-switches & gates per spec; report discrepancies, never silently resolve them.
Additional standing decisions already in force (from prior builds):
- Drawn signature REQUIRED to sign (Jacob, 2026-08-12) — UI + server enforced
- E-records disclosure wording approved as written (Jacob, 2026-08-12)
- No PAN/CVV/bank-account capture anywhere — instruments live in Square (PCI)
- Client-visible chrome changes require explicit acceptance; 16-screen byte baseline enforces it
- Every raw-prisma access is allowlisted with justification (scripts/guard-prisma.ts, prebuild gate)
