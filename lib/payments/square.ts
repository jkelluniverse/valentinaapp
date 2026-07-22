import type { ConnectedAccountRef, PaymentProvider, RawRequest } from "./types";

// The ONLY file that knows Square exists (CLAUDE-BILLING §3.4). Endpoint
// shapes verified against the live docs on 2026-07-22:
//   authorize:  GET  {base}/oauth2/authorize?client_id&scope&state
//   token:      POST {base}/oauth2/token   (ObtainToken; grant_type
//               "authorization_code" | "refresh_token"; returns
//               access_token, refresh_token, expires_at, merchant_id)
//   revoke:     POST {base}/oauth2/revoke  (Authorization: Client <secret>)
//   merchant:   GET  {base}/v2/merchants/{merchant_id}
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

export class SquarePaymentProvider implements PaymentProvider {
  readonly name = "square";

  async createCheckout(): Promise<{ checkoutUrl: string; providerRef: string }> {
    throw new Error("checkout is Phase B2 — not built yet by decision");
  }

  async verifyAndParseWebhook(_req: RawRequest): Promise<null> {
    throw new Error("webhooks are Phase B2 — not built yet by decision");
  }

  async revoke(account: ConnectedAccountRef): Promise<void> {
    await revokeAccess(account.accessToken);
  }
}
