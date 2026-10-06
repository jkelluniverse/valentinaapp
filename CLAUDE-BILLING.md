# CLAUDE-BILLING.md — Billing Build File (v1.0)
### Practitioner Portal · Two-layer billing · Square OAuth (practitioner payments) · Stripe Billing (tenant subscriptions)
Companion to `CLAUDE-PLATFORM.md` (v1.0), `CLAUDE.md` (session pipeline v1.1), `CLAUDE-client-onboarding.md` (v1.1). All standing rules from those files apply. Build AFTER Platform Phase 2; the Connect flow should exist before the demo tenants (Platform Phase 5) so demos can show it.

---

## 0. STANDING RULES — READ FIRST, APPLY ALWAYS

1. **Two layers, never mixed.** Layer 1 = practitioners collecting from THEIR clients (their own Square account, their money, never touches ours). Layer 2 = the platform charging tenants monthly (the venture's own Stripe account). Separate code paths, separate webhooks, separate credentials, separate dashboards. No shared abstractions between layers beyond generic utilities.
2. **The platform never holds client payments.** Layer 1 charges settle directly into the practitioner's own processor account. We store references and statuses, never balances. This is a legal posture (money-transmitter avoidance), not a style choice.
3. **Practitioners never see an API key.** Layer 1 connection is OAuth only: "Connect Square" → their Square login → approve → done.
4. **Adapter discipline.** Layer 1 goes behind a `PaymentProvider` interface (`lib/payments/`) exactly like transcription and readings. Square is implementation #1; Stripe Connect is the planned #2 (do not build it yet — the interface just must not preclude it).
5. **Verify against live docs before writing integration code.** Square: `https://developer.squareup.com/docs` (OAuth, Subscriptions, Payments, Webhooks). Stripe: `https://docs.stripe.com` (Billing, Checkout, Customer Portal, webhook signatures). Do not rely on memorized endpoint shapes, scope names, or webhook event names — both APIs version aggressively.
6. **Valentina's payments do not change.** Her existing Square arrangement keeps working exactly as-is. Phase B1 migrates her setup INTO the connected-account structure with zero behavior change (platform Rule 0.1 extends to money). Her tenant subscription is grandfathered per config (`billing.plan: "FOUNDING_COMP"` — see 4.4).
7. **Never hold client data hostage.** A past-due tenant gets banners and gentle restriction of NEW activity — never loss of access to existing client data, and their CLIENTS never see billing state at all. Practitioners are mid-relationship with vulnerable people; our dunning must never leak into that room.
8. **Tokens are credentials.** Layer 1 OAuth tokens are encrypted at rest (app-level encryption, key in env), never logged, never sent to the browser, and revocable from both sides with a clean reconnect path.
9. **All money amounts are integer cents** in DB and code. No floats, ever.
10. **Webhooks are the source of truth for state**, in both layers. UI actions request; webhooks confirm. Every webhook handler is idempotent (event-id dedupe table) and signature-verified.

---

## 1. WHAT WE'RE BUILDING

```
LAYER 1 — Practitioner ← Client payments (their Square)
┌───────────────────────────────────────────────────────┐
│ Practitioner settings: [Connect Square] ──► Square    │
│ OAuth ──► tokens stored (encrypted) on                │
│ ConnectedPaymentAccount                               │
│                                                       │
│ Client portal checkout (sessions, packages) ──►       │
│ PaymentProvider.charge / checkoutLink ──► money lands │
│ in PRACTITIONER's Square ──► webhook ──► Payment row  │
│ + practitioner "Payments" view                        │
└───────────────────────────────────────────────────────┘

LAYER 2 — Platform ← Tenant subscriptions (our Stripe)
┌───────────────────────────────────────────────────────┐
│ Provisioning creates Stripe Customer + Subscription   │
│ (Setup fee + Care Plan price)                         │
│                                                       │
│ Tenant settings ► Billing ► [Manage billing] ──►      │
│ Stripe hosted Customer Portal (card, invoices, plan)  │
│                                                       │
│ Stripe webhooks ──► TenantBilling.status lifecycle    │
│ (ACTIVE / PAST_DUE grace / SUSPENDED) ──► banner &    │
│ soft degradation per Rule 0.7                         │
└───────────────────────────────────────────────────────┘
```

---

## 2. DATA MODEL

```prisma
// ---------- LAYER 1 ----------
model ConnectedPaymentAccount {
  id             String   @id @default(cuid())
  tenantId       String   @unique          // one connected account per tenant (v1)
  provider       String                    // "square" ("stripe-connect" future)
  merchantId     String                    // Square merchant/location identity
  locationId     String?
  accessTokenEnc String                    // encrypted; never plaintext at rest
  refreshTokenEnc String?
  scopes         String[]
  status         ConnAccountStatus         // CONNECTED | NEEDS_RECONNECT | REVOKED
  connectedAt    DateTime
  lastVerifiedAt DateTime?                 // daily token health check
}

model Payment {                            // Layer 1 records — references, never balances
  id            String   @id @default(cuid())
  tenantId      String
  clientId      String?
  provider      String
  providerPaymentId String @unique
  amountCents   Int
  currency      String   @default("USD")
  purpose       String                     // "session" | "package" | tenant-defined
  status        PaymentStatus              // PENDING | COMPLETED | REFUNDED | FAILED
  occurredAt    DateTime
  raw           Json                       // provider payload, archived
  @@index([tenantId, clientId])
}

// ---------- LAYER 2 ----------
model TenantBilling {
  id                   String   @id @default(cuid())
  tenantId             String   @unique
  stripeCustomerId     String   @unique
  stripeSubscriptionId String?
  plan                 String                 // "CARE_99" | "CARE_125" | "CARE_149" |
                                              // "FOUNDING_99" | "FOUNDING_COMP"
  status               BillingStatus          // ACTIVE | PAST_DUE | SUSPENDED | CANCELED
  graceUntil           DateTime?              // set on PAST_DUE
  currentPeriodEnd     DateTime?
}

model WebhookEvent {                          // idempotency, BOTH layers
  id         String   @id                     // provider event id
  layer      String                           // "square" | "stripe"
  receivedAt DateTime @default(now())
  processedAt DateTime?
}
```

All models tenant-scoped through the DAL per platform rules (TenantBilling/ConnectedPaymentAccount are root-tenant tables).

---

## 3. LAYER 1 — SQUARE OAUTH & PRACTITIONER PAYMENTS

### 3.1 Platform prerequisite (Jacob, one-time, not code)
Register ONE Square application for the venture (developer.squareup.com, under the NEW LLC's Square developer account — entity separation). Configure OAuth redirect URL `${APP_BASE_URL}/api/payments/square/callback`. Store `SQUARE_APP_ID`, `SQUARE_APP_SECRET` in Railway env. Request the minimum scopes the features need (payments read/write, subscriptions/customers as needed) — verify current scope names in live docs.

### 3.2 Connect flow
1. Practitioner settings → Payments → **Connect Square** button (plus honest copy: "You'll log into your own Square account. Payments from your clients go directly to you.").
2. Redirect to Square authorize URL with `state` = signed nonce bound to tenantId (CSRF protection; verify on callback).
3. Callback: exchange code → tokens; encrypt; store `ConnectedPaymentAccount` (status CONNECTED); fetch merchant/location for display ("Connected as {business name}").
4. Settings page thereafter shows connection status + **Disconnect** (revokes token via Square API AND deletes local tokens).

### 3.3 Token lifecycle (the unglamorous 30% — build it properly)
- Refresh: Square OAuth tokens expire; a daily job refreshes proactively and sets `lastVerifiedAt`. Refresh failure → status `NEEDS_RECONNECT`.
- `NEEDS_RECONNECT` UX: banner on practitioner dashboard ("Your Square connection needs a quick re-connect") + email (once). Client-facing checkout for that tenant shows a graceful "online payment is temporarily unavailable — contact {practitioner}" instead of an error.
- Revocation from Square's side (practitioner revokes in Square dashboard): detected via failed API call or webhook → same `NEEDS_RECONNECT` path.
- Encryption: AES-GCM app-level with `PAYMENT_TOKEN_ENC_KEY` env var; tokens decrypted only in server memory at call time.

### 3.4 PaymentProvider adapter
```typescript
// lib/payments/types.ts
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    account: ConnectedAccountRef;        // decrypted at call time
    amountCents: number;
    currency: string;
    description: string;
    clientRef: string;                   // our client id, echoed back in webhook
    redirectUrl: string;
  }): Promise<{ checkoutUrl: string; providerRef: string }>;
  verifyAndParseWebhook(req: RawRequest): Promise<PaymentEvent | null>; // sig-verified
  revoke(account: ConnectedAccountRef): Promise<void>;
}
```
- `lib/payments/square.ts` — only file that knows Square. Prefer Square's hosted **Payment Links / Checkout** for v1 (client clicks "Pay", lands on Square-hosted page, pays, returns) — zero PCI surface, no card UI to build. Embedded Web Payments SDK is a later enhancement, not v1.
- Webhook (`/api/webhooks/square`): signature verification per live docs; idempotent via `WebhookEvent`; payment completion → `Payment` row → shows in practitioner's Payments view and on the client's record.

### 3.5 What Layer 1 v1 includes / excludes
Includes: connect/disconnect, one-off checkout links for tenant-defined purposes (session fee, package), payments ledger view (filter by client/date), webhook-driven statuses.
Excludes (later): practitioner-side recurring client subscriptions, refund initiation from our UI (link to Square dashboard for now), invoicing, Stripe Connect implementation, platform application fees.

---

## 4. LAYER 2 — STRIPE BILLING FOR TENANT SUBSCRIPTIONS

### 4.1 Platform prerequisite (Jacob, one-time, not code)
Open a Stripe account under the NEW LLC. In the Stripe dashboard create Products/Prices: `setup-standard` ($1,500 one-time), `setup-founding` ($1,000 one-time), `care-99`, `care-125`, `care-149` (monthly). Enable the hosted **Customer Portal** in Stripe settings (allow: payment method update, invoice history; disallow: self-serve plan switching for v1 — plan changes go through Jacob). Store `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in Railway env.

### 4.2 Provisioning hook
Extending Platform Section 7: provisioning step gains a Billing step — pick plan (or FOUNDING_COMP) → create Stripe Customer (+ Subscription unless comped; setup fee as a one-time invoice item or Checkout) → `TenantBilling` row. DEMO tenants get NO Stripe objects (`plan: "FOUNDING_COMP"`, status ACTIVE, flagged demo).

### 4.3 Tenant billing settings page
- Shows: current plan (display name), status, next renewal date, and ONE button: **Manage billing** → creates a Stripe Customer Portal session → redirects. Card updates, invoice downloads, receipts: all Stripe-hosted, nothing built by us.
- Visible only to the practitioner-owner role, never to clients.

### 4.4 Status lifecycle (webhook-driven)
- `invoice.paid` → ACTIVE, clear `graceUntil`.
- `invoice.payment_failed` → PAST_DUE, `graceUntil = now + 14 days`. Stripe Smart Retries handles re-attempts; we do NOT build dunning emails beyond Stripe's.
- PAST_DUE behavior (Rule 0.7): dashboard banner for the practitioner ("Payment issue — update your card" + Manage billing link). Everything else works. Clients see nothing.
- `graceUntil` passed & still unpaid → SUSPENDED: practitioner can log in, read everything, export everything; NEW activity gated (no new client invites, no new session processing) with a clear banner. Client logins and existing data remain untouched.
- `customer.subscription.deleted` → CANCELED: same access posture as SUSPENDED + export prompt. Reactivation = Jacob re-provisions billing.
- FOUNDING_COMP (Valentina): no Stripe subscription; status pinned ACTIVE; her billing page says "Founding partner — no platform charges" (final copy pending the Valentina agreement).

### 4.5 Webhook endpoint
`/api/webhooks/stripe`: signature-verified (`STRIPE_WEBHOOK_SECRET`), idempotent via `WebhookEvent`, minimal event set subscribed (verify exact event names in live docs). Local dev via Stripe CLI forwarding.

---

## 5. BUILD PHASES & ACCEPTANCE CRITERIA

**Phase B1 — Layer 1 foundation + Valentina zero-change migration**
- [ ] Square app registered (Jacob); env vars set
- [ ] Connect flow end-to-end on a DEMO tenant against Square Sandbox (connect, status display, disconnect+revoke)
- [ ] Token encryption at rest verified (DB dump inspection shows no plaintext tokens); refresh job + NEEDS_RECONNECT path exercised (force-expire in sandbox)
- [ ] Valentina's existing Square arrangement represented as her ConnectedPaymentAccount with ZERO behavior change to her current payment flows (screenshot/behavior gate applies)

**Phase B2 — Layer 1 payments**
- [ ] Checkout link creation + client-facing pay flow (sandbox) → webhook → Payment row → practitioner Payments view
- [ ] Webhook signature + idempotency proven (replay the same event; one Payment row)
- [ ] Graceful checkout-unavailable state when account is NEEDS_RECONNECT

**Phase B3 — Layer 2 subscriptions**
- [ ] Stripe products/prices created (Jacob); provisioning billing step creates Customer+Subscription; DEMO tenants create no Stripe objects
- [ ] Billing settings page + Customer Portal round-trip works (test mode)
- [ ] Full lifecycle proven with Stripe test clocks or simulated events: ACTIVE → PAST_DUE (banner, everything works) → SUSPENDED (soft gates verified: no new invites/sessions, full read+export intact, client login unaffected) → payment → ACTIVE
- [ ] FOUNDING_COMP tenant shows correct state and never touches Stripe

**Phase B4 — Hardening**
- [ ] Daily token health job; WebhookEvent table pruning; payment amounts audited as integer cents end-to-end
- [ ] Copy audit: no billing language ever renders in any client-facing surface
- [ ] Runbook in `/docs/BILLING-RUNBOOK.md`: reconnect walkthrough for practitioners, what Jacob does on SUSPENDED/CANCELED, how to comp/adjust a tenant, webhook replay steps

---

## 6. OUT OF SCOPE — DO NOT BUILD

- Stripe Connect implementation (interface-compatible, deferred until a practitioner needs it)
- Platform application fees on Layer 1 payments (future revenue decision, not code)
- Practitioner-side recurring client billing, invoicing, or refund initiation UI
- Self-serve plan upgrades/downgrades (Jacob-mediated for v1)
- Custom dunning email sequences (Stripe Smart Retries only)
- Usage-based/metered billing
- Any hard lockout that removes read/export access to existing data, at any billing status, ever
