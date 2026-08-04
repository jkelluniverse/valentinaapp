import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import type { ConnectedAccountRef, PaymentEvent, PaymentProvider, RawRequest } from "./types";

// The ONLY file that knows Square exists (CLAUDE-BILLING §3.4). Endpoint
// shapes verified against the live docs on 2026-07-22 (OAuth) and
// 2026-08-04 (checkout + webhooks):
//   authorize:  GET  {base}/oauth2/authorize?client_id&scope&state
//   token:      POST {base}/oauth2/token   (ObtainToken; grant_type
//               "authorization_code" | "refresh_token"; returns
//               access_token, refresh_token, expires_at, merchant_id)
//   revoke:     POST {base}/oauth2/revoke  (Authorization: Client <secret>)
//   merchant:   GET  {base}/v2/merchants/{merchant_id}
//   locations:  GET  {base}/v2/locations
//   pay link:   POST {base}/v2/checkout/payment-links
//               { idempotency_key, quick_pay: { name, price_money:
//                 { amount, currency }, location_id }, checkout_options:
//                 { redirect_url } } → { payment_link: { id, url, order_id } }
//   webhooks:   HMAC-SHA256(signature key, notification URL + raw body),
//               base64, in header `x-square-hmacsha256-signature`;
//               event { merchant_id, type, event_id, created_at,
//               data: { object: { payment: { id, order_id, amount_money,
//               status } } } }
// Access tokens expire after 30 days; code-flow refresh tokens don't expire.
//
// The developer app is not registered yet — everything here reads env at
// call time (SQUARE_APP_ID / SQUARE_APP_SECRET / SQUARE_OAUTH_SCOPES), and
// SQUARE_OAUTH_BASE_URL overrides the host so the flow runs end-to-end
// against a mock or the sandbox without code changes. Nothing blocks on
// the paperwork; when the real credentials land, they are env values only.

export function squareConfigured(): boolean {
  return Boolean(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET);
}

function base(): string {
  if (process.env.SQUARE_OAUTH_BASE_URL) return process.env.SQUARE_OAUTH_BASE_URL;
  return process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

const appId = () => process.env.SQUARE_APP_ID ?? "";
const appSecret = () => process.env.SQUARE_APP_SECRET ?? "";
// Minimum scopes for the features in flight (verify names in the developer
// dashboard when the app is registered — env-overridable on purpose).
const scopes = () =>
  (process.env.SQUARE_OAUTH_SCOPES ?? "MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE").split(/[\s,+]+/).filter(Boolean);

export function authorizeUrl(state: string): string {
  const u = new URL(`${base()}/oauth2/authorize`);
  u.searchParams.set("client_id", appId());
  u.searchParams.set("scope", scopes().join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  merchantId: string;
};

async function obtainToken(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${base()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: appId(), client_secret: appSecret(), ...body }),
  });
  if (!res.ok) throw new Error(`square token endpoint: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_at?: string;
    merchant_id: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
    merchantId: data.merchant_id,
  };
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  return obtainToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshAccess(refreshToken: string): Promise<TokenSet> {
  return obtainToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function revokeAccess(accessToken: string): Promise<void> {
  const res = await fetch(`${base()}/oauth2/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Client ${appSecret()}` },
    body: JSON.stringify({ client_id: appId(), access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`square revoke endpoint: ${res.status}`);
}

export async function fetchMerchantName(merchantId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${base()}/v2/merchants/${merchantId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { merchant?: { business_name?: string } };
    return data.merchant?.business_name ?? null;
  } catch {
    return null;
  }
}

// Phase B2 — the merchant's first active location (quick-pay links require
// one; B1 never needed it, so the row may not carry it yet).
export async function fetchMainLocationId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${base()}/v2/locations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { locations?: { id: string; status?: string }[] };
    const active = data.locations?.find((l) => (l.status ?? "ACTIVE") === "ACTIVE") ?? data.locations?.[0];
    return active?.id ?? null;
  } catch {
    return null;
  }
}

// Phase B2 — webhook signature: HMAC-SHA256(signature key, notification URL
// + raw body), base64. The URL is the SUBSCRIBED notification URL (config),
// not whatever host the request appears to arrive on.
export function webhookConfigured(): boolean {
  return Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
}

function notificationUrl(): string {
  return (
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ??
    `${process.env.APP_BASE_URL ?? ""}/api/webhooks/square`
  );
}

export function verifySquareSignature(rawBody: string, signatureHeader: string): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signatureHeader) return false;
  const expected = createHmac("sha256", key).update(notificationUrl() + rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const STATUS_MAP: Record<string, PaymentEvent["status"]> = {
  COMPLETED: "COMPLETED",
  APPROVED: "PENDING",
  PENDING: "PENDING",
  CANCELED: "FAILED",
  FAILED: "FAILED",
};

export class SquarePaymentProvider implements PaymentProvider {
  readonly name = "square";

  async createCheckout(input: {
    account: ConnectedAccountRef;
    amountCents: number;
    currency: string;
    description: string;
    clientRef: string;
    redirectUrl: string;
  }): Promise<{ checkoutUrl: string; providerRef: string }> {
    if (!input.account.locationId) throw new Error("square checkout requires a location id");
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("amount must be positive integer cents");
    }
    const res = await fetch(`${base()}/v2/checkout/payment-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        quick_pay: {
          name: input.description.slice(0, 255),
          price_money: { amount: input.amountCents, currency: input.currency },
          location_id: input.account.locationId,
        },
        checkout_options: { redirect_url: input.redirectUrl },
        // Our client id rides the note for human traceability in the Square
        // dashboard; authoritative mapping is the pending row keyed on
        // order_id (quick-pay links don't echo metadata).
        payment_note: `client:${input.clientRef}`,
      }),
    });
    if (!res.ok) throw new Error(`square payment-links endpoint: ${res.status}`);
    const data = (await res.json()) as { payment_link?: { id: string; url: string; order_id: string } };
    if (!data.payment_link?.url || !data.payment_link.order_id) {
      throw new Error("square payment-links: malformed response");
    }
    return { checkoutUrl: data.payment_link.url, providerRef: data.payment_link.order_id };
  }

  /** Signature-verified parse. Throws on a bad signature (→ 403 upstream);
   *  returns null for verified events that aren't payments (→ 200 ignore). */
  async verifyAndParseWebhook(req: RawRequest): Promise<PaymentEvent | null> {
    const sig =
      req.headers["x-square-hmacsha256-signature"] ??
      req.headers["X-Square-Hmacsha256-Signature"] ??
      "";
    if (!verifySquareSignature(req.body, sig)) throw new Error("bad webhook signature");
    const event = JSON.parse(req.body) as {
      type?: string;
      event_id?: string;
      created_at?: string;
      data?: { object?: { payment?: { id: string; order_id?: string; amount_money?: { amount?: number; currency?: string }; status?: string; created_at?: string } } };
    };
    if (!event.type?.startsWith("payment.")) return null;
    const payment = event.data?.object?.payment;
    if (!payment?.id) return null;
    return {
      providerPaymentId: payment.id,
      amountCents: payment.amount_money?.amount ?? 0,
      currency: payment.amount_money?.currency ?? "USD",
      clientRef: null,
      orderRef: payment.order_id ?? null,
      status: STATUS_MAP[payment.status ?? ""] ?? "PENDING",
      occurredAt: new Date(payment.created_at ?? event.created_at ?? Date.now()),
      raw: event,
    };
  }

  async revoke(account: ConnectedAccountRef): Promise<void> {
    await revokeAccess(account.accessToken);
  }
}
