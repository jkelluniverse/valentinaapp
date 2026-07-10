import { createHmac, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

// Square, via plain REST (no SDK dependency — same posture as Resend). Square
// owns money movement; we hold only tokens, ids, and statuses. The access
// token stays server-side; card data never exists here at all — the Web
// Payments SDK tokenizes in the client's browser and we spend the single-use
// token. Logs: metadata only (ids and event types — no amounts).

export function squareConfigured(): boolean {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

function baseUrl(): string {
  return process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

// Public (browser-safe) config for the Web Payments SDK card form. Passed as
// props from server components — application id and location id are public.
export function squarePublicConfig() {
  const applicationId = process.env.SQUARE_APPLICATION_ID;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!applicationId || !locationId) return null;
  return {
    applicationId,
    locationId,
    scriptUrl:
      process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js",
  };
}

async function squareFetch(path: string, body: object): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-06-04",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

// Mirror a client as a Square Customer once (Customers API), so her Square
// dashboard shows the same people. Name/email go to her payment processor —
// the minimum a processor needs for receipts.
export async function ensureSquareCustomer(client: {
  id: string;
  name: string | null;
  email: string;
}): Promise<string | null> {
  if (!squareConfigured()) return null;
  const existing = await prisma.squareCustomerLink.findUnique({
    where: { clientId: client.id },
  });
  if (existing) return existing.squareCustomerId;

  try {
    const res = await squareFetch("/v2/customers", {
      idempotency_key: `veritas-cust-${client.id}`,
      given_name: client.name ?? undefined,
      email_address: client.email,
      reference_id: client.id,
    });
    if (!res.ok) {
      console.error(`[square] customer create failed client=${client.id} status=${res.status}`);
      return null;
    }
    const data = (await res.json()) as { customer?: { id: string } };
    const squareCustomerId = data.customer?.id;
    if (!squareCustomerId) return null;
    await prisma.squareCustomerLink.create({
      data: { clientId: client.id, squareCustomerId },
    });
    return squareCustomerId;
  } catch {
    console.error(`[square] customer create error client=${client.id}`);
    return null;
  }
}

export type PaymentResult =
  | { ok: true; paymentId: string; status: string }
  | { ok: false };

// Spend a single-use card token from the browser (CreatePayment). reference_id
// carries our charge id so the webhook can confirm the same charge later.
export async function createSquarePayment(args: {
  token: string;
  amountCents: number;
  currency: string;
  chargeId: string;
  squareCustomerId?: string | null;
}): Promise<PaymentResult> {
  if (!squareConfigured()) return { ok: false };
  try {
    const res = await squareFetch("/v2/payments", {
      idempotency_key: randomUUID(),
      source_id: args.token,
      amount_money: { amount: args.amountCents, currency: args.currency },
      location_id: process.env.SQUARE_LOCATION_ID,
      reference_id: args.chargeId,
      ...(args.squareCustomerId ? { customer_id: args.squareCustomerId } : {}),
    });
    if (!res.ok) {
      console.error(`[square] payment failed charge=${args.chargeId} status=${res.status}`);
      return { ok: false };
    }
    const data = (await res.json()) as { payment?: { id: string; status: string } };
    if (!data.payment) return { ok: false };
    console.log(`[square] payment charge=${args.chargeId} payment=${data.payment.id} status=${data.payment.status}`);
    return { ok: true, paymentId: data.payment.id, status: data.payment.status };
  } catch {
    console.error(`[square] payment error charge=${args.chargeId}`);
    return { ok: false };
  }
}

// Webhook signature (Square v2): base64(HMAC-SHA256(key, notificationUrl + rawBody))
// must equal the x-square-hmacsha256-signature header. Constant-time compare.
export function verifySquareSignature(
  rawBody: string,
  signatureHeader: string | null,
  notificationUrl: string,
): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signatureHeader) return false;
  const expected = createHmac("sha256", key).update(notificationUrl + rawBody).digest("base64");
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}
