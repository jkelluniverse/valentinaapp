// CLAUDE-BILLING §3.4 — the PaymentProvider adapter surface (Layer 1).
// Square is implementation #1; Stripe Connect is the planned #2 — the
// interface must not preclude it. Checkout and webhooks are Phase B2;
// they are declared here so B2 implements rather than redesigns.

export type ConnectedAccountRef = {
  tenantId: string;
  provider: string;
  merchantId: string;
  locationId: string | null;
  accessToken: string; // decrypted at call time, server memory only
};

export type PaymentEvent = {
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  clientRef: string | null; // our client id, echoed back by the provider
  /** Provider order reference — Square quick-pay links echo order_id, not
   *  metadata; the pending Payment row created at link time is keyed on it. */
  orderRef: string | null;
  status: "PENDING" | "COMPLETED" | "REFUNDED" | "FAILED";
  occurredAt: Date;
  raw: unknown;
};

export type RawRequest = { headers: Record<string, string>; body: string };

export interface PaymentProvider {
  readonly name: string;

  createCheckout(input: {
    account: ConnectedAccountRef;
    amountCents: number;
    currency: string;
    description: string;
    clientRef: string;
    redirectUrl: string;
  }): Promise<{ checkoutUrl: string; providerRef: string }>;

  /** Signature-verified webhook parse; null = not a payment event. */
  verifyAndParseWebhook(req: RawRequest): Promise<PaymentEvent | null>;

  /** Revoke the connection provider-side (privacy + clean disconnect). */
  revoke(account: ConnectedAccountRef): Promise<void>;
}
