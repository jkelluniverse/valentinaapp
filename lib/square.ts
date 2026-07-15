import { createHmac, randomUUID, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// Square, via plain REST (no SDK dependency — same posture as Resend). Square
// owns money movement; we hold only tokens, ids, and statuses. The access
// token stays server-side; card data never exists here at all — the Web
// Payments SDK tokenizes in the client's browser and we spend the single-use
// token. Logs: metadata only (ids and event types — no amounts).
//
// Environments: production creds win when SQUARE_ENVIRONMENT=production;
// otherwise the SQUARE_SANDBOX_* variables are honored so staging runs against
// the Sandbox with zero config overlap (C13-PACKAGES: Sandbox end-to-end
// before real keys).

function accessToken(): string | undefined {
  if (process.env.SQUARE_ENVIRONMENT === "production") return process.env.SQUARE_ACCESS_TOKEN;
  return process.env.SQUARE_SANDBOX_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN;
}

function applicationId(): string | undefined {
  if (process.env.SQUARE_ENVIRONMENT === "production") return process.env.SQUARE_APPLICATION_ID;
  return process.env.SQUARE_SANDBOX_APPLICATION_ID || process.env.SQUARE_APPLICATION_ID;
}

function isProduction(): boolean {
  return process.env.SQUARE_ENVIRONMENT === "production";
}

export function squareConfigured(): boolean {
  return Boolean(accessToken());
}

function baseUrl(): string {
  return isProduction()
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

async function squareFetch(
  path: string,
  body?: object,
  method: "GET" | "POST" | "PUT" = body ? "POST" : "GET",
): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-06-04",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
}

// The location id: from env when set, else discovered once from the account's
// main location and cached (module + PracticeSetting) — so adding only the
// sandbox token + app id is enough to go live on staging.
let locationCache: string | null = null;

export async function resolveLocationId(): Promise<string | null> {
  const fromEnv = isProduction()
    ? process.env.SQUARE_LOCATION_ID
    : process.env.SQUARE_SANDBOX_LOCATION_ID || process.env.SQUARE_LOCATION_ID;
  if (fromEnv) return fromEnv;
  if (locationCache) return locationCache;
  if (!squareConfigured()) return null;
  const settingKey = isProduction() ? "squareLocationId" : "squareSandboxLocationId";
  try {
    const stored = await prisma.practiceSetting.findUnique({ where: { key: settingKey } });
    if (stored?.value) {
      locationCache = stored.value;
      return stored.value;
    }
    const res = await squareFetch("/v2/locations");
    if (!res.ok) {
      console.error(`[square] locations fetch failed status=${res.status}`);
      return null;
    }
    const data = (await res.json()) as { locations?: { id: string; status?: string }[] };
    const loc = data.locations?.find((l) => l.status === "ACTIVE") ?? data.locations?.[0];
    if (!loc) return null;
    locationCache = loc.id;
    await prisma.practiceSetting.upsert({
      where: { key: settingKey },
      update: { value: loc.id },
      create: { key: settingKey, value: loc.id },
    });
    return loc.id;
  } catch {
    console.error("[square] location resolution error");
    return null;
  }
}

// Public (browser-safe) config for the Web Payments SDK card form. Passed as
// props from server components — application id and location id are public.
export async function squarePublicConfig() {
  const appId = applicationId();
  const locationId = await resolveLocationId();
  if (!appId || !locationId) return null;
  return {
    applicationId: appId,
    locationId,
    scriptUrl: isProduction()
      ? "https://web.squarecdn.com/v1/square.js"
      : "https://sandbox.web.squarecdn.com/v1/square.js",
  };
}

// ---------------------------------------------------------------------------
// Customers (C13-PKG §2) — one writer. Idempotent: search by reference_id
// first (adopt, never twin), deterministic idempotency key on create, updates
// sync name/email/phone. Failure is non-blocking by design — callers fire and
// forget; a person joining the practice outranks a CRM row.

type CustomerBits = {
  referenceId: string; // our durable link: User.id (clients) or "lead-<id>"
  name: string | null;
  email: string;
  phone?: string | null;
};

function splitName(name: string | null): { given?: string; family?: string } {
  if (!name?.trim()) return {};
  const parts = name.trim().split(/\s+/);
  return { given: parts[0], family: parts.slice(1).join(" ") || undefined };
}

async function findCustomerByReference(referenceId: string): Promise<string | null> {
  const res = await squareFetch("/v2/customers/search", {
    query: { filter: { reference_id: { exact: referenceId } } },
    limit: 1,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { customers?: { id: string }[] };
  return data.customers?.[0]?.id ?? null;
}

async function upsertSquareCustomer(bits: CustomerBits): Promise<string | null> {
  if (!squareConfigured()) return null;
  const { given, family } = splitName(bits.name);
  const existing = await findCustomerByReference(bits.referenceId);
  if (existing) {
    // Keep it current — one PUT, tolerated to fail quietly.
    await squareFetch(`/v2/customers/${existing}`, {
      given_name: given,
      family_name: family,
      email_address: bits.email,
      ...(bits.phone ? { phone_number: bits.phone } : {}),
    }, "PUT").catch(() => undefined);
    return existing;
  }
  const res = await squareFetch("/v2/customers", {
    idempotency_key: `veritas-cust-${bits.referenceId}`,
    given_name: given,
    family_name: family,
    email_address: bits.email,
    ...(bits.phone ? { phone_number: bits.phone } : {}),
    reference_id: bits.referenceId,
  });
  if (!res.ok) {
    console.error(`[square] customer create failed ref=${bits.referenceId} status=${res.status}`);
    return null;
  }
  const data = (await res.json()) as { customer?: { id: string } };
  return data.customer?.id ?? null;
}

// The ONE writer for client↔Square customer sync (C13-PKG §2). Called at
// invite acceptance and on profile changes. Never throws.
export async function syncSquareCustomer(userId: string): Promise<string | null> {
  if (!squareConfigured()) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, profile: { select: { phone: true } } },
    });
    if (!user || user.role !== "CLIENT") return null;
    const link = await prisma.squareCustomerLink.findUnique({ where: { clientId: user.id } });
    const squareCustomerId = await upsertSquareCustomer({
      referenceId: user.id,
      name: user.name,
      email: user.email,
      phone: user.profile?.phone ?? null,
    });
    if (!squareCustomerId) return link?.squareCustomerId ?? null;
    if (!link) {
      await prisma.squareCustomerLink.create({
        data: { clientId: user.id, squareCustomerId },
      });
    } else if (link.squareCustomerId !== squareCustomerId) {
      await prisma.squareCustomerLink.update({
        where: { clientId: user.id },
        data: { squareCustomerId },
      });
    }
    console.log(`[square] customer synced client=${user.id}`);
    return squareCustomerId;
  } catch {
    console.error(`[square] customer sync error client=${userId}`);
    return null;
  }
}

// Back-compat shim for the portal payment path — resolves through the link
// first, then the one writer.
export async function ensureSquareCustomer(client: {
  id: string;
  name: string | null;
  email: string;
}): Promise<string | null> {
  const existing = await prisma.squareCustomerLink.findUnique({
    where: { clientId: client.id },
  });
  if (existing) return existing.squareCustomerId;
  return syncSquareCustomer(client.id);
}

// A Square customer for a Lead (C13-PKG §8 — invoice a prospect
// post-discovery, pre-portal). Not persisted locally; reference_id makes the
// lookup idempotent.
export async function ensureSquareCustomerForLead(lead: {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}): Promise<string | null> {
  if (!squareConfigured()) return null;
  try {
    return await upsertSquareCustomer({
      referenceId: `lead-${lead.id}`,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    });
  } catch {
    console.error(`[square] lead customer error lead=${lead.id}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Payments

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
  const locationId = await resolveLocationId();
  if (!locationId) return { ok: false };
  try {
    const res = await squareFetch("/v2/payments", {
      idempotency_key: randomUUID(),
      source_id: args.token,
      amount_money: { amount: args.amountCents, currency: args.currency },
      location_id: locationId,
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

// ---------------------------------------------------------------------------
// Invoices (C13-PKG §8) — Square does the hard parts: hosts payment, receipts,
// and delivery. We create the order + invoice from our UI and publish; the
// webhook flips our Charge to PAID when it's paid.

export type InvoiceResult =
  | { ok: true; invoiceId: string; publicUrl: string | null }
  | { ok: false; error: string };

export async function sendSquareInvoice(args: {
  chargeId: string; // our Charge — becomes the durable link via squareInvoiceId
  squareCustomerId: string;
  title: string; // line item, e.g. "6-session package"
  amountCents: number;
  currency: string;
  dueDate?: string | null; // "YYYY-MM-DD"
  note?: string | null; // her voice, on the invoice
}): Promise<InvoiceResult> {
  if (!squareConfigured()) return { ok: false, error: "config" };
  const locationId = await resolveLocationId();
  if (!locationId) return { ok: false, error: "location" };
  try {
    // 1. An order to invoice against.
    const orderRes = await squareFetch("/v2/orders", {
      idempotency_key: `veritas-ord-${args.chargeId}`,
      order: {
        location_id: locationId,
        reference_id: args.chargeId,
        line_items: [
          {
            name: args.title,
            quantity: "1",
            base_price_money: { amount: args.amountCents, currency: args.currency },
          },
        ],
      },
    });
    if (!orderRes.ok) {
      console.error(`[square] order create failed charge=${args.chargeId} status=${orderRes.status}`);
      return { ok: false, error: "order" };
    }
    const orderData = (await orderRes.json()) as { order?: { id: string } };
    if (!orderData.order?.id) return { ok: false, error: "order" };

    // 2. The invoice, delivered by Square via email, card payment on.
    const invoiceRes = await squareFetch("/v2/invoices", {
      idempotency_key: `veritas-inv-${args.chargeId}`,
      invoice: {
        location_id: locationId,
        order_id: orderData.order.id,
        primary_recipient: { customer_id: args.squareCustomerId },
        delivery_method: "EMAIL",
        title: args.title,
        ...(args.note ? { description: args.note } : {}),
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: args.dueDate ?? new Date().toISOString().slice(0, 10),
            automatic_payment_source: "NONE",
          },
        ],
        accepted_payment_methods: { card: true },
      },
    });
    if (!invoiceRes.ok) {
      console.error(`[square] invoice create failed charge=${args.chargeId} status=${invoiceRes.status}`);
      return { ok: false, error: "invoice" };
    }
    const invData = (await invoiceRes.json()) as {
      invoice?: { id: string; version: number };
    };
    if (!invData.invoice) return { ok: false, error: "invoice" };

    // 3. Publish — Square emails the hosted invoice + payment page.
    const pubRes = await squareFetch(`/v2/invoices/${invData.invoice.id}/publish`, {
      idempotency_key: `veritas-pub-${args.chargeId}`,
      version: invData.invoice.version,
    });
    if (!pubRes.ok) {
      console.error(`[square] invoice publish failed charge=${args.chargeId} status=${pubRes.status}`);
      return { ok: false, error: "publish" };
    }
    const pubData = (await pubRes.json()) as {
      invoice?: { id: string; public_url?: string };
    };
    console.log(`[square] invoice published charge=${args.chargeId} invoice=${invData.invoice.id}`);
    return {
      ok: true,
      invoiceId: invData.invoice.id,
      publicUrl: pubData.invoice?.public_url ?? null,
    };
  } catch {
    console.error(`[square] invoice error charge=${args.chargeId}`);
    return { ok: false, error: "network" };
  }
}

// ---------------------------------------------------------------------------
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
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(signatureHeader).digest();
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
