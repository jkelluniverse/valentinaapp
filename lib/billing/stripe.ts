import { createHmac, timingSafeEqual } from "crypto";

// BILLING §4 — the ONLY file that knows Stripe exists. Endpoint shapes
// verified against the live docs on 2026-08-04:
//   customers:  POST /v1/customers            (form-encoded; name, email,
//               metadata[tenantId]) → { id }
//   subs:       POST /v1/subscriptions        (customer, items[0][price])
//               → { id, status, current_period_end }
//   portal:     POST /v1/billing_portal/sessions (customer, return_url)
//               → { url }
//   webhooks:   header `Stripe-Signature: t=<ts>,v1=<hex>`;
//               v1 = HMAC-SHA256(endpoint signing secret, `${t}.${body}`)
// The Stripe account isn't opened yet (Jacob's paperwork) — everything
// reads env at call time (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET /
// STRIPE_PRICE_* ids), and STRIPE_BASE_URL overrides the host so the whole
// lifecycle runs against a mock. Nothing blocks on the paperwork; real
// credentials land as env values only.

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function base(): string {
  return process.env.STRIPE_BASE_URL ?? "https://api.stripe.com";
}

// Stripe's API is form-encoded, never JSON.
async function post(path: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
  if (!res.ok) throw new Error(`stripe ${path}: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

// Plan → Stripe price id, all env-supplied (Jacob creates the real prices).
export function priceIdFor(plan: string): string | null {
  const map: Record<string, string | undefined> = {
    CARE_99: process.env.STRIPE_PRICE_CARE_99,
    CARE_125: process.env.STRIPE_PRICE_CARE_125,
    CARE_149: process.env.STRIPE_PRICE_CARE_149,
  };
  return map[plan] ?? null;
}

export async function createCustomer(args: { tenantId: string; name: string; email: string }): Promise<string> {
  const customer = await post("/v1/customers", {
    name: args.name,
    email: args.email,
    "metadata[tenantId]": args.tenantId,
  });
  return String(customer.id);
}

export async function createSubscription(customerId: string, priceId: string): Promise<{ id: string; currentPeriodEnd: Date | null }> {
  const sub = await post("/v1/subscriptions", {
    customer: customerId,
    "items[0][price]": priceId,
  });
  const end = typeof sub.current_period_end === "number" ? new Date(sub.current_period_end * 1000) : null;
  return { id: String(sub.id), currentPeriodEnd: end };
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await post("/v1/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
  return String(session.url);
}

// Webhook signature: v1 = HMAC-SHA256(secret, `${t}.${rawBody}`), hex.
// Tolerance guards against replayed old signatures.
const TOLERANCE_SECONDS = 5 * 60;

export function verifyStripeSignature(rawBody: string, header: string, nowMs?: number): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = new Map(
    header.split(",").map((p) => {
      const eq = p.indexOf("=");
      return [p.slice(0, eq).trim(), p.slice(eq + 1).trim()] as const;
    })
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs((nowMs ?? Date.now()) / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(v1, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
