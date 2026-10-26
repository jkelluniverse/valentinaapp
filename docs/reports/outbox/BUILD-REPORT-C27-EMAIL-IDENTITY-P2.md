# BUILD REPORT — C27-EMAIL-IDENTITY, Phase 2 (+ follow-ups F1/F2, + platform env confirmation)

**Status: COMPLETE.** Gate `audits/email-identity-verify.ts` **28/28** (was 22 — six
Phase 2/F1 checks added, zero existing assertions changed; ruling 38 accounting below).
settings-i18n **10/10**. Full regression green before merge. Checkpoint protocol followed.

## Phase 2 — what shipped

- **The resolver, not the call sites:** `sendEmail` with no explicit identity resolves the
  sender from the current scope's tenant, FRESH per send (no module state — item 6's guarantee
  by construction). Three outcomes: the DEFAULT tenant takes the exact pre-C27 path
  (byte-identical, item 3's fixture still pinned to `8a3f960` and green); a non-default
  practice sends AS ITSELF; an unconfigured practice sends AS NO ONE.
- **The practice identity:** `"Practice Name" <address of PLATFORM_FROM_EMAIL>` on the one
  verified platform sending domain (no per-practice DKIM, per spec), reply-to = the practice's
  own `practiceEmail` setting, the platform account's key, composed by the new
  `emails/practice-envelope.ts` — the practice's name in header/signature, footer =
  `name · postal address`, neutral chrome (not Warm Stone, not the platform indigo/gold),
  every identifying string DATA from the tenant row + PracticeSettings.
- **The silent-failure case (item 5):** no `practiceEmail` → `{ok:false, skipped:true}` + a
  log line, zero wire calls — the same honest shape as a missing credential. Any resolution
  error (including C26's `TenantUnresolvedError`) also skips: when we don't know who is
  sending, nobody sends.
- **`PRACTICE_EMAIL` retired as a global:** lib/agreements' `[practice email address]`
  placeholder fills from the per-practice setting; the env fallback survives ONLY behind the
  default-tenant guard (nothing regresses for Valentina); a non-default practice with no
  setting leaves the placeholder VISIBLY unfilled on previews — honest, prompting configuration
  — never another practice's address on legal text.
- **Settings UI:** `/practitioner/settings` gains "Practice contact" (email + postal address),
  both languages (`practiceContact.*`, 9 new catalog keys in both files, key sets still
  identical at 94/94), validation with a bilingual error, save confirmation.

## F1 — RESEND_API_URL hardened

Ignored whenever `RAILWAY_ENVIRONMENT_NAME=production`, regardless of being set.
Gate-asserted exactly as specified: with the override pointed at `localhost:9` AND the
environment production, the send reached the real endpoint.

## F2 — determined, real, NOT fixed (as instructed)

**On practice B's own subdomain, under healthy resolution, the marketing homepage served is
Valentina's practice marketing.** `app/(public)/page.tsx` is `force-static` over
`content/site-content.ts` — explicitly "Valentina's public marketing copy" (her name, "Meet
Valentina", her testimonials) — with no host awareness; identical bytes on every host. Every
event-minted practice serves her marketing at their root domain. The precision that matters
for the future spec: the booking funnel INSIDE that wrapper is tenant-correct (C26's healthy
control proved `/book` on B's host renders B's slots and stamps B) — the defect is the static
wrapper. Related pre-existing note: `/login` carries a hardcoded "veritas" wordmark on every
host. Recorded in BUILD-STATE as a FINDING awaiting your spec and priority call.

## Platform env values — confirmed as far as this session can see

All five `PLATFORM_*` variables are present in BOTH Railway environments (production
`ede9732a` and Staging `a13c26ff`; variable NAMES verified via the Railway API). By the
gate-proven logic, `platformEmailConfigured()` is therefore TRUE in production — it requires
exactly the four non-reply values, all present. Composition with those values is structurally
verbatim (the envelope renders config strings unchanged; the gate proves the rendering).
**One item I cannot deliver: the `PLATFORM_LEGAL_ENTITY` string itself.** My Railway
connector returns variable names only (`valuesRedacted: true`) — I can prove it is SET but
cannot read it. Rather than guess, the ledger carries a placeholder: **Jacob or the
Architect should paste the entity string into BUILD-STATE's env section** (it is not a
secret and it is the de facto sender-memo ownership answer). No production tick has logged
`configured=` since the latest deploy, so no runtime line was available to quote either.
**The engage gate remains CLOSED** — re-asserted by the gate on this build (zero
`engageEnabled` rows, env override off).

## Gate accounting (ruling 38)

email-identity 22 → **28**: +ITEM 4 (B's identity at the wire), +ITEM 5 (honest skip),
+ITEM 6 (A→B→A no crossing), +ITEM 7-per-practice-half (PRACTICE_EMAIL retirement,
structural), +F1, +the two-practices-exist rig check. One EXISTING check was corrected, not
relaxed: item 4's first draft asserted a footer line in the plain-TEXT part of an
envelope-less send — no path has ever rendered that (envelope-less sends keep the caller's
raw text; the html carries the footer), so the clause tested a behavior that never existed.
The DEMO-suppression check gained a configured practice email for the demo tenant so it
keeps proving SUPPRESSION rather than newly-proving unconfiguredness. settings-i18n 10/10
with two contract edits, both named in the gate: `NEW_SINCE_PASS` (new keys cannot appear in
the pinned pre-pass page; unlisted new keys still fail) and two new entries in the
CONDITIONAL render set (`saved./errors.practiceContact`).

One cross-gate contract edit, found by the regression sweep and disclosed:
`audits/fail-closed-tenancy-verify.ts` (C26) met Phase 2's designed behavior — its healthy
control booked on tenant B's host, and B's notifications were now HELD because the gate's rig
tenant had no `practiceEmail` (the honest skip doing its job against an unconfigured
practice). The gate follows the new contract: its rig gives tenant B a practice email and the
platform sending-domain fixtures, and the sink check is STRENGTHENED — the two notification
emails must now arrive carrying `"T26 Practice B"` as the from identity, so the C26 gate
independently proves Phase 2's practice identity end-to-end through a real spawned server.
Still 18/18.

## Decisions taken (for Architect ratification)

(a) Identity resolution lives INSIDE `sendEmail` (once), not at 63 call sites — the same
    "enforced in the layer" placement as C25/C26. Explicit identities (engage's platform
    identity) still win.
(b) The practice's from-ADDRESS is the address half of `PLATFORM_FROM_EMAIL` — one config
    value governs the sending domain for platform and practice mail alike.
(c) Practice mail requires `practiceEmail` (reply-to is the point of Phase 2); postal is
    optional and renders when present. Transactional practice mail carries no unsubscribe
    (unchanged); the platform sequences keep theirs.
(d) Envelope-less sends keep their raw text part (pre-existing behavior, both identities) —
    changing it would break item 3's byte-identity for the default tenant.
(e) The demo tenant in the gate now carries a practice email so the DEMO check still tests
    what its name says (disclosed above).
