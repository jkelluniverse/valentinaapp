# THE TWO SQUARE WEBHOOK ENDPOINTS — Q1/Q2/Q3. Nothing deleted, nothing merged.

**Headline, and it inverts the obvious reading: the architecturally CORRECT endpoint
appears to be INERT in production, and the architecturally wrong one is the functional
one.** Neither is dead code, and they are not duplicates — they are two eras that
write different tables.

## Q1 — what each is, handles, and writes

### A. `/api/square/webhook` — the C13 era, HOST-resolved, **functional**
Route: `app/api/square/webhook/route.ts` (167 lines), scoped client (`@/lib/prisma`),
verify from `lib/square.ts:648`.
- **Handles:** `invoice.payment_made` / `invoice.canceled` (or status PAID/CANCELED),
  `payment.created`, `payment.updated`.
- **Writes (5):** `Charge.update` ×3, `Charge.updateMany`, `ExternalPayment.upsert`.
- **Jobs, per its own header:** confirm a Charge PAID when Square collects it, activate
  a package the charge bought, and stash a payment taken outside the app (POS/reader)
  as an `ExternalPayment` for one-tap matching in the ledger.
- **Tenant:** from the HOST (scoped client → `requestTenantId()`).
- **Signature:** `verifySquareSignature(raw, sig, notificationUrl)` where the route
  builds `notificationUrl` from **the request's own host+proto**.

### B. `/api/webhooks/square` — the Billing-B2 era, PAYLOAD-resolved, **apparently inert**
Route: `app/api/webhooks/square/route.ts` (30 lines) → `lib/payments/webhook.ts`, RAW
client.
- **Handles:** payment events via `ingestSquareEvent`.
- **Writes:** `WebhookEvent` (idempotency key), `Payment.create` / `Payment.update`;
  READS `ConnectedPaymentAccount`.
- **Tenant:** from the PAYLOAD — `merchant_id → ConnectedPaymentAccount.tenantId`,
  and unknown merchants are acknowledged and dropped, never guessed.
- **Signature:** `verifySquareSignature(rawBody, sig)` computing the HMAC over
  `notificationUrl() + rawBody`, where `notificationUrl()` is
  `SQUARE_WEBHOOK_NOTIFICATION_URL ?? "${PUBLIC_APP_URL}/api/webhooks/square"`.

**THE PROBLEM WITH B: neither variable is set in production.** The live variable list
contains `SQUARE_WEBHOOK_SIGNATURE_KEY` but NOT `SQUARE_WEBHOOK_NOTIFICATION_URL` and
NOT `PUBLIC_APP_URL`. So `notificationUrl()` evaluates to the bare string
`"/api/webhooks/square"`, and B's expected HMAC is computed over
`"/api/webhooks/square" + body` — which cannot match a signature Square computed over
the real subscribed URL. **Every event B receives should fail verification and return
401.** `webhookConfigured()` only checks the signing key, so B answers 200-ready and
then rejects everything: a silent failure of exactly the shape ruling 112 is about.

**This is INFERENCE from configuration, not an observation of B rejecting traffic.**
It needs one of: a Railway log search for `/api/webhooks/square` 401s, or Square's
dashboard showing delivery failures. Named as unproven.

### Do they overlap? No.
A writes `Charge` + `ExternalPayment`. B writes `WebhookEvent` + `Payment`. Different
tables, different features: A is the practitioner's charge/invoice lifecycle from the
single-merchant env-token era; B is the multi-tenant OAuth ledger that P6 is built
around. **Neither is dead code.** Deleting either would remove real behavior.

## Q2 — git history: one did NOT supersede the other

- `/api/square/webhook` — introduced **2026-07-22**, `874327a` (Platform Phase 1c).
- `/api/webhooks/square` + `lib/payments/webhook.ts` — introduced **2026-08-04**,
  `2a3db4d` ("Billing B2 — Layer 1 payments: checkout links, signed webhook, ledger").

B is newer and is the better design, but it was added **alongside** A for a different
layer, not as a replacement, and A was never retired. So this is not a deletion
question — it is a "which one is Square actually subscribed to, and does the other
still need to work" question. That is Q3.

## The security position, sharpened — and one correction to my own reasoning

Ruling 113 says host must never be a tenancy source for machine-to-machine callbacks.
That principle stands. But the concrete exploit on endpoint A is **blunted**, and the
report should say so rather than overstate:

Square signs `HMAC(key, subscribedURL + body)`. A recomputes using **the host the
request arrived on**. An attacker replaying a captured, validly-signed event at
`https://<another-tenant>.psychefolio.com/api/square/webhook` produces a DIFFERENT URL
string, so the HMAC mismatches and A returns 401. **Host-steering by replay fails.**

What remains true, and is why B's model is still the right one: the signing key is
**platform-wide** (one `SQUARE_WEBHOOK_SIGNATURE_KEY`), so a signature proves "Square
sent this to the subscribed URL", never "this belongs to tenant X". Attribution must
come from the payload. That is a partial answer to P6's A3: **the key is platform-wide,
not per-merchant.**

## Q3 — what Jacob checks, and what to capture

**Square (the one that matters).** Square Developer Dashboard → sign in →
**Applications** → select the Psychefolio/Veritas application → left sidebar
**Webhooks** → **Subscriptions**. Screenshot the whole list. For each subscription
capture: the **Notification URL** (the full https URL — this is the deciding fact),
which **event types** are subscribed, whether it is **Enabled**, and the **API
version**. Also note whether the app is in **Sandbox** or **Production** mode (toggle
top-left) — the subscription lists differ per mode.
- URL ending `/api/square/webhook` → endpoint **A** is live.
- URL ending `/api/webhooks/square` → endpoint **B** is live (and, per the above,
  probably failing every delivery — Square shows recent delivery attempts and response
  codes; screenshot those too, they settle the inference).
- Both subscribed → both are live and both matter.
- The **host** in that URL is the P3.3 decider: if it is not `valentinavelez.com`, that
  endpoint breaks at P3.3 unless exempted.

**The other three provider dashboards** — for each, capture WHERE the URL is set and
WHAT host it currently points to:
- **AssemblyAI** (transcription → `/api/webhooks/transcription`): the webhook URL is
  sent per-job by our code rather than configured in their dashboard, so the honest
  check is our own outbound config — but if a dashboard-level default exists under
  **Account/Settings → Webhooks**, capture it.
- **The recording provider** (→ `/api/recording/webhook`, gated by
  `RECORDING_WEBHOOK_SECRET`): wherever that integration's callback URL is configured,
  capture the full URL including host.
- **Resend inbound** (→ `/api/inbound/remarkable`, gated by `INBOUND_WEBHOOK_SECRET`):
  Resend dashboard → **Webhooks** (or the inbound/parse route config) → capture the
  endpoint URL.

For all four the question is identical and narrow: **what HOST is in the configured
URL?** Any host that is not `valentinavelez.com` rides the host-pattern fallback today
and refuses after P3.3 unless it is exempted or mapped.

## Recommendation, not a decision

Do not delete or merge either endpoint. Under ruling 114's transitional, both Square
routes go on the named exemption list with their tracking item pointing at P6 — which
already owns rebuilding Square tenancy properly. If Q3 shows B is subscribed AND
failing, that is a **live billing defect independent of P3** and should be raised as
its own item rather than folded into the platform split.
