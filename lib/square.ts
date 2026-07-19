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
    // Sandbox rejects real card numbers — the form says so instead of
    // leaving a mysterious "invalid card" (test card: 4111 1111 1111 1111).
    sandbox: !isProduction(),
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

// Adopt-don't-twin, part two: many of her clients already exist in Square
// from years of invoicing outside the app. If the reference lookup misses,
// find them by exact email — but only when the match is unambiguous — and
// claim the record by stamping our reference_id, so their saved address and
// cards on file surface in the portal automatically.
async function adoptCustomerByEmail(email: string, referenceId: string): Promise<string | null> {
  const res = await squareFetch("/v2/customers/search", {
    query: { filter: { email_address: { exact: email } } },
    limit: 2,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { customers?: { id: string; reference_id?: string }[] };
  const matches = (data.customers ?? []).filter(
    (c) => !c.reference_id || c.reference_id === referenceId,
  );
  if (matches.length !== 1) return null; // ambiguous or already someone else's — create fresh
  const found = matches[0];
  if (found.reference_id !== referenceId) {
    await squareFetch(`/v2/customers/${found.id}`, { reference_id: referenceId }, "PUT").catch(
      () => undefined,
    );
  }
  console.log(`[square] adopted existing customer by email ref=${referenceId}`);
  return found.id;
}

async function upsertSquareCustomer(bits: CustomerBits): Promise<string | null> {
  if (!squareConfigured()) return null;
  const { given, family } = splitName(bits.name);
  const existing =
    (await findCustomerByReference(bits.referenceId)) ??
    (await adoptCustomerByEmail(bits.email, bits.referenceId));
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
// Customer profile & cards on file — she manages billing details without
// leaving the portal: view/update the Square customer (incl. address), keep
// cards on file (tokenized in the browser; PANs never exist here), and charge
// a stored card for due amounts. Card-on-file stays a separate in-context
// consent (AMENDMENT-01) — the UI states it plainly before saving.

export type SquareCustomerProfile = {
  id: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type CardOnFile = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export async function getSquareCustomer(customerId: string): Promise<SquareCustomerProfile | null> {
  if (!squareConfigured()) return null;
  try {
    const res = await squareFetch(`/v2/customers/${customerId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      customer?: {
        id: string;
        given_name?: string;
        family_name?: string;
        email_address?: string;
        phone_number?: string;
        address?: {
          address_line_1?: string;
          address_line_2?: string;
          locality?: string;
          administrative_district_level_1?: string;
          postal_code?: string;
        };
      };
    };
    const c = data.customer;
    if (!c) return null;
    return {
      id: c.id,
      givenName: c.given_name ?? null,
      familyName: c.family_name ?? null,
      email: c.email_address ?? null,
      phone: c.phone_number ?? null,
      addressLine1: c.address?.address_line_1 ?? null,
      addressLine2: c.address?.address_line_2 ?? null,
      city: c.address?.locality ?? null,
      state: c.address?.administrative_district_level_1 ?? null,
      postalCode: c.address?.postal_code ?? null,
    };
  } catch {
    console.error(`[square] customer fetch error id=${customerId}`);
    return null;
  }
}

export async function updateSquareCustomer(
  customerId: string,
  fields: {
    givenName?: string;
    familyName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  },
): Promise<boolean> {
  if (!squareConfigured()) return false;
  try {
    const res = await squareFetch(`/v2/customers/${customerId}`, {
      given_name: fields.givenName,
      family_name: fields.familyName,
      email_address: fields.email,
      phone_number: fields.phone || undefined,
      address: {
        address_line_1: fields.addressLine1 || undefined,
        address_line_2: fields.addressLine2 || undefined,
        locality: fields.city || undefined,
        administrative_district_level_1: fields.state || undefined,
        postal_code: fields.postalCode || undefined,
        country: "US",
      },
    }, "PUT");
    if (!res.ok) console.error(`[square] customer update failed id=${customerId} status=${res.status}`);
    return res.ok;
  } catch {
    console.error(`[square] customer update error id=${customerId}`);
    return false;
  }
}

export async function listCardsOnFile(customerId: string): Promise<CardOnFile[]> {
  if (!squareConfigured()) return [];
  try {
    const res = await fetch(
      `${baseUrl()}/v2/cards?customer_id=${encodeURIComponent(customerId)}&include_disabled=false`,
      {
        headers: {
          Authorization: `Bearer ${accessToken()}`,
          "Square-Version": "2024-06-04",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      cards?: { id: string; card_brand?: string; last_4?: string; exp_month?: number; exp_year?: number; enabled?: boolean }[];
    };
    return (data.cards ?? [])
      .filter((c) => c.enabled !== false)
      .map((c) => ({
        id: c.id,
        brand: c.card_brand ?? "CARD",
        last4: c.last_4 ?? "····",
        expMonth: c.exp_month ?? 0,
        expYear: c.exp_year ?? 0,
      }));
  } catch {
    console.error(`[square] cards list error customer=${customerId}`);
    return [];
  }
}

// Save a card on file from a single-use token (Web Payments SDK tokenized in
// the browser — the card number never touches this server).
export async function createCardOnFile(args: {
  customerId: string;
  token: string;
  cardholderName?: string | null;
}): Promise<{ ok: true; card: CardOnFile } | { ok: false }> {
  if (!squareConfigured()) return { ok: false };
  try {
    const res = await squareFetch("/v2/cards", {
      idempotency_key: randomUUID(),
      source_id: args.token,
      card: {
        customer_id: args.customerId,
        ...(args.cardholderName ? { cardholder_name: args.cardholderName } : {}),
      },
    });
    if (!res.ok) {
      console.error(`[square] card save failed customer=${args.customerId} status=${res.status}`);
      return { ok: false };
    }
    const data = (await res.json()) as {
      card?: { id: string; card_brand?: string; last_4?: string; exp_month?: number; exp_year?: number };
    };
    if (!data.card) return { ok: false };
    console.log(`[square] card saved customer=${args.customerId}`);
    return {
      ok: true,
      card: {
        id: data.card.id,
        brand: data.card.card_brand ?? "CARD",
        last4: data.card.last_4 ?? "····",
        expMonth: data.card.exp_month ?? 0,
        expYear: data.card.exp_year ?? 0,
      },
    };
  } catch {
    console.error(`[square] card save error customer=${args.customerId}`);
    return { ok: false };
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

    // 2. The invoice. Delivery is SHARE_MANUALLY: Square hosts the invoice +
    //    payment page, but the EMAIL that carries it is OURS (branded Envelope)
    //    — sent by the caller with the public_url returned below.
    const invoiceRes = await squareFetch("/v2/invoices", {
      idempotency_key: `veritas-inv-${args.chargeId}`,
      invoice: {
        location_id: locationId,
        order_id: orderData.order.id,
        primary_recipient: { customer_id: args.squareCustomerId },
        delivery_method: "SHARE_MANUALLY",
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

// When a charge with an open Square invoice gets settled some other way
// (card on file, in person, waived), cancel the invoice so it doesn't linger
// as unpaid in Square. Terminal states count as already-done. Best-effort:
// the money is settled either way; this is bookkeeping hygiene.
export async function cancelSquareInvoice(invoiceId: string): Promise<boolean> {
  if (!squareConfigured()) return false;
  try {
    const get = await squareFetch(`/v2/invoices/${invoiceId}`);
    if (!get.ok) return false;
    const data = (await get.json()) as { invoice?: { version?: number; status?: string } };
    const inv = data.invoice;
    if (!inv) return false;
    if (["PAID", "CANCELED", "REFUNDED", "FAILED"].includes(inv.status ?? "")) return true;
    const res = await squareFetch(`/v2/invoices/${invoiceId}/cancel`, {
      version: inv.version ?? 0,
    });
    if (res.ok) console.log(`[square] invoice canceled id=${invoiceId}`);
    return res.ok;
  } catch {
    console.error(`[square] invoice cancel error id=${invoiceId}`);
    return false;
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
