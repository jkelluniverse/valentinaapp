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
