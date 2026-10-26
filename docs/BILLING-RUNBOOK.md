# BILLING RUNBOOK

Operations guide for both billing layers. Layer 1 = practitioners getting
paid by their clients (Square, their own account, their money). Layer 2 =
tenants paying the platform (Stripe subscriptions). Valentina is
FOUNDING_COMP: pinned ACTIVE, no Stripe objects, and her pre-OAuth Square
arrangement (env token) is untouched by all of this.

## Env vars (all optional until the paperwork lands)

| Var | Layer | Purpose |
|---|---|---|
| `SQUARE_APP_ID` / `SQUARE_APP_SECRET` | 1 | OAuth app (developer.squareup.com, the LLC's account) |
| `SQUARE_OAUTH_SCOPES` | 1 | Override the default scope list if the dashboard disagrees |
| `SQUARE_ENVIRONMENT` | 1 | `production` flips off the sandbox host |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | 1 | From the webhook subscription in the developer console |
| `SQUARE_WEBHOOK_NOTIFICATION_URL` | 1 | The EXACT subscribed URL (signature covers it); default `${APP_BASE_URL}/api/webhooks/square` |
| `PAYMENT_TOKEN_ENC_KEY` | 1 | 64-hex AES-256-GCM key for tokens at rest |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 2 | The LLC's Stripe account + endpoint signing secret |
| `STRIPE_PRICE_CARE_99` / `_125` / `_149` | 2 | Price ids from the Stripe dashboard |
| Mock overrides: `SQUARE_OAUTH_BASE_URL`, `STRIPE_BASE_URL` | — | Point either layer at a mock/sandbox |

## Reconnect walkthrough (practitioner asks "payments stopped working")

1. Their dashboard shows the banner "Your Square connection needs a quick
   re-connect" (status `NEEDS_RECONNECT` — set by a failed refresh in the
   daily tick, or a revocation from Square's side).
2. They tap **Reconnect** (Settings → Getting paid, or the banner) → the
   normal OAuth flow → status returns to CONNECTED. Nothing else to do;
   paused payment-link creation resumes immediately.
3. While disconnected, their clients see "online payment is temporarily
   unavailable — reach out to {practitioner}" instead of an error, and the
   pay links resume working after reconnect (the portal link
   `/space/pay-link/{id}` re-checks live status on every visit).

## What Jacob does on SUSPENDED / CANCELED (Layer 2)

- `PAST_DUE` needs nothing from you: Stripe Smart Retries runs, the
  practitioner sees the update-card banner, everything works for 14 days.
- `SUSPENDED` (grace expired): the app has already soft-gated NEW invites
  and NEW session processing; reading/export/client logins are untouched.
  Your move: reach out personally before anything else. If they pay, the
  `invoice.paid` webhook reactivates automatically.
- `CANCELED` (subscription deleted): same posture as SUSPENDED. To
  reactivate, re-provision billing (below) — a fresh Customer/Subscription
  is cleaner than resurrecting the old one.
- Manual override (break glass): set `TenantBilling.status` directly —
  every gate reads the row, so an `ACTIVE` write un-gates instantly.

## Comp / adjust a tenant

- Comp: set `plan = "FOUNDING_COMP"`, `status = ACTIVE`, null the Stripe
  ids in `TenantBilling` (and cancel the subscription in the Stripe
  dashboard). The billing page switches to "Founding partner" copy.
- Plan change: v1 policy is plan changes go through you, not self-serve —
  change the subscription's price in the Stripe dashboard, then update
  `TenantBilling.plan` to match the new label.

## Webhook replay / debugging

- Both endpoints are idempotent on the provider event id (`WebhookEvent`):
  replaying a delivery is always safe. Square: resend from the developer
  console. Stripe: resend from the workbench/webhooks screen.
- A delivery that failed mid-processing released its lock (the row is
  deleted), so the provider's own retry re-applies it. A row with
  `processedAt` set means the event fully applied.
- Signature failures return 403 and touch nothing. First things to check:
  the signature key envs, and for Square that
  `SQUARE_WEBHOOK_NOTIFICATION_URL` is byte-identical to the subscribed
  URL (the signature covers the URL string itself).
- Pruning: processed events older than 90 days are removed by the daily
  tick; unprocessed rows are kept as evidence.

## Money invariants (B4)

- Amounts are integer cents end-to-end: DB columns are `Int`
  (`Payment.amountCents`), the checkout service rejects non-integer or
  non-positive amounts before any provider call, and the only
  dollars→cents conversion is `Math.round(Number(input) * 100)` at the
  form boundary. Never introduce floats past that line.
- No client-facing surface renders billing language, ever (§B4 copy rule;
  asserted in `b4-verify.ts`).
- The platform never holds anyone's money: Layer 1 settles into the
  practitioner's own Square account; Layer 2 is the platform's own
  subscription revenue.
