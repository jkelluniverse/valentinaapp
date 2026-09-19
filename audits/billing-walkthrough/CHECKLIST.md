# Billing Go-Live — Staging Walkthrough Checklist

Working copy of BILLING-GO-LIVE.md Phases 1–3, prefilled with what has been
verified programmatically and what needs a human at the browser. File evidence
(screenshots) beside this file as you go.

## Phase 0 — build-state gate (verified in-repo, 2026-07-17)

| Item | State |
|---|---|
| `syncSquareCustomer()` on acceptance | ✅ built (idempotent, `reference_id` = user id; fire-and-forget) |
| Package + SessionCredit + derived counters | ✅ built · **proven**: `npm run verify:packages` all green |
| Reserve / consume / release + tick auto-complete | ✅ built · proven in the same harness |
| In-portal purchase (Web Payments SDK) + signature-verified webhook | ✅ built |
| Invoices create→publish + webhook consumption | ✅ built (works for Leads via `lead:<id>`) |
| Late-fee engine + settings | ✅ built · exactly-24h-free boundary + idempotency proven |
| Renewal notices + reminders | ✅ built, now on the branded Envelope templates |
| 24h session reminder | ✅ built (tick, `reminderSentAt` dedup) |
| Staging email allowlist | ✅ built — non-production sends only to `@fixture.test` + `EMAIL_TEAM_ALLOWLIST` |

**Env-name mapping vs the playbook:** scheduler secret is `JOBS_SECRET` (not
CRON_SECRET). Staging Square vars are `SQUARE_SANDBOX_ACCESS_TOKEN` /
`SQUARE_SANDBOX_APPLICATION_ID` (used whenever `SQUARE_ENVIRONMENT` ≠
production; location auto-discovers). Webhook key: `SQUARE_WEBHOOK_SIGNATURE_KEY`.

**Known deviations / flags (accepted or open):**
- *Fee kill-switch (F6):* there is no separate `feeEnabled` toggle — setting the
  late fee to **$0** in Settings silences fee creation entirely (`applyLateFee`
  no-ops at ≤ 0). Cutoff/amount edits apply to the next action, as specced.
- *Webhook replay (H2):* no event-id store; instead every handler is
  **idempotent by construction** (PAID-guard, upserts, unique keys) — a replay
  re-runs to the same state. Verify with a manual double-send in H2.
- *Square-down queue (H3):* sync is non-blocking (onboarding never fails) but
  there is **no retry queue** — a missed sync self-heals on the next profile
  edit or payment. Open item if stricter recovery is wanted.
- *Change-awareness (F7):* client + practitioner email/push on every change ✅;
  the Portrait timeline line + calendar-delta wording are **not built** — log
  as a follow-up, not a blocker.
- *Invite "Opened" state:* deliberately not tracked (no pixels; Resend click
  events not wired). States are Invited → Accepted, with loud send-failure.

## Phase 1 — seed & baseline (staging shell)

- [ ] `SEED_ENV=staging npm run fixtures:seed:staging`
- [ ] Ledger opens clean · cast present: María (packages) · Ben (singles) ·
      Ana (pending — must NOT sync to Square) · you'll create "Test Cliente"
      live · create Lead Carmen via the public /book funnel on staging
- [ ] Railway DB snapshot noted (re-run point)
- Sandbox values: card `4111 1111 1111 1111` · any future exp · CVV `111` ·
  ZIP `94103`. Declines: CVV `911`, ZIP `99999`.

## Phase 2 — the matrix (screenshot every ✓)

A. Customer sync: A1 ☐ · A2 ☐ · A3 ☐ · A4 ☐
B. Single sessions: B1 ☐ · B2 ☐ · B3 ☐ · B4 ☐
C. Packages & credits: C1 ☐ · C2 ☐ · C3 ☐ · C4 ☐ · C5 ☐ (1 credit + 3 bookings
   — already proven mechanically; confirm through the UI) · C6 ☐ · C7 ☐
D. Renewals: D1 ☐ · D2 ☐ · D3 ☐
E. Invoices: E1 ☐ · E2 ☐ · E3 ☐ (Lead Carmen) · E4 ☐
F. Late fees: F1 ☐ · F2 ☐ · F3 ☐ · F4 ☐ · F5 ☐ · F6 ☐ ($0 = off) · F7 ☐ (partial — see flags)
G. Reminders: G1 ☐ · G2 ☐
H. Hostile: H1 ☐ · H2 ☐ · H3 ☐ · H4 ☐

Tip for C3/D1/D2/G2: "advance the tick" = open
`https://<staging>/api/jobs/tick?secret=<JOBS_SECRET>` — each visit is one run.

## Phase 3 — fix & re-run
Anything red: fix, add a regression check, re-run the whole section from the
Phase-1 snapshot. Zero red boxes before Phase 4.

## Phase 4 — production go-live
Follow BILLING-GO-LIVE.md §Phase 4 verbatim (real tokens → prod webhook →
$1 round-trip to Jacob's card → her real PriceBook → she drives one sale).
Rollback: remove the four production Square vars.
