# BILLING Phase B4 (hardening) verify — 2026-08-04

Harness: `b4-verify.ts`. The daily token-health job is B1's
refreshDueTokens (already verified + running in the tick).

- ✓ WebhookEvent pruning (tick, 90-day window): old processed rows go;
  old UNPROCESSED rows kept as evidence; recent rows kept
- ✓ integer-cents invariant: fractional/zero/negative amounts rejected
  before any provider call (plus Int columns and the single Math.round
  boundary, documented in the runbook)
- ✓ copy audit: zero platform-billing language on all 11 client surfaces
  (phrase-specific by design — "invoice" in a client's OWN reflection is
  their words, not ours)
- Runbook: docs/BILLING-RUNBOOK.md — env matrix, reconnect walkthrough,
  Jacob's SUSPENDED/CANCELED playbook, comp/adjust, webhook replay.

ALL CHECKS PASS — 7/7 · CLAUDE-BILLING is fully built (B1–B4).

---

# BILLING Phase B3 (Layer 2 subscriptions) verify — 2026-08-04

Harness: `b3-verify.ts` against the built app + a local mock of Stripe
(shapes verified in the live docs 2026-08-04: form-encoded /v1/customers,
/v1/subscriptions, /v1/billing_portal/sessions; `Stripe-Signature:
t=,v1=` = HMAC-SHA256(endpoint secret, `t.body`), 5-min tolerance).

- ✓ FOUNDING_COMP/DEMO provisioning: comped row, ZERO Stripe objects
- ✓ CARE_99 provisioning: Customer + Subscription, ACTIVE with period end
- ✓ billing settings page shows plan/status; Customer Portal round-trip
  (session url + return_url) works
- ✓ invoice.payment_failed → PAST_DUE + 14-day grace; dashboard banner
  "Payment issue"; the practice fully works
- ✓ tick grace sweep: expired grace → SUSPENDED
- ✓ SUSPENDED soft gates: newActivityAllowed false (createInvite +
  startUploadCapture both guard on it); reading intact; banner says data
  stays safe; client login unaffected with ZERO billing language anywhere
- ✓ invoice.paid → ACTIVE, grace cleared, activity resumes
- ✓ replay idempotent (WebhookEvent lock); tampered signature → 403
- ✓ customer.subscription.deleted → CANCELED (same soft-gate posture)
- ✓ no-row tenant (Valentina) reads "Founding partner — no platform
  charges", pinned ACTIVE, never touches Stripe

Gates on the same run: baseline 16/16 byte-identical, GET smoke
(+ /practitioner/settings/billing), write smoke, tenant-stamp audit,
platform isolation verify (B-fixture extended with tenantBilling).

ALL CHECKS PASS — 24/24

---

# BILLING Phase B2 (Layer 1 payments) verify — 2026-08-04

Harness: `b2-verify.ts` against the built app + a local mock of Square
(endpoint shapes verified in the live docs 2026-08-04: `POST
/v2/checkout/payment-links` quick_pay, `GET /v2/locations`, webhook
signature = HMAC-SHA256(signature key, notification URL + raw body) in
`x-square-hmacsha256-signature`). B1's log lives in its commit message;
its harness (`b1-verify.ts`) remains runnable.

## Checkout links
- ✓ checkout link created (service layer, as the server action calls it)
- ✓ quick_pay carries integer cents + currency
- ✓ idempotency_key sent
- ✓ location backfilled lazily from /v2/locations and persisted
- ✓ pending Payment row keyed on order id, attributed to the client

## Client pay flow
- ✓ client pay page redirects into the Square-hosted checkout
- ✓ paid page shows the settled state (no re-redirect)

## Webhook (signature + idempotency)
- ✓ signed webhook completes the payment with the real provider id
- ✓ replaying the exact same event: 200, no second row, one WebhookEvent
- ✓ tampered signature → 403, zero trace
- ✓ event for an unmatched merchant → acknowledged, dropped, no payment

## Graceful degradation (§3.3)
- ✓ new links pause on NEEDS_RECONNECT (typed reason, never a throw)
- ✓ client sees "temporarily unavailable — reach out to {practitioner}"
- ✓ practitioner ledger banners the one-tap re-connect

## Ledger
- ✓ /practitioner/payments lists the payment with client name, amount,
  status; client/date filters; linked from payment settings (no global
  nav change — Valentina's chrome untouched)

## Notes
- Webhook ingestion is cross-tenant by design: tenant = the event's
  merchant_id via ConnectedPaymentAccount, never the request host
  (lib/payments/webhook.ts, allowlisted). A processing failure releases
  the WebhookEvent lock so the provider's retry can land.
- Valentina's env-legacy arrangement never touches this path; baseline
  16/16 byte-identical, GET+write smoke, tenant-stamp audit, platform
  isolation verify all green on the same run.

ALL CHECKS PASS — 22/22
