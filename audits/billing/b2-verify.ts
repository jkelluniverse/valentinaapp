import { spawn, execSync, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import { createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { encryptToken } from "../../lib/payments/crypto";

// CLAUDE-BILLING Phase B2 acceptance — Layer 1 payments end-to-end against
// a LOCAL mock of Square (endpoint shapes per the live docs, 2026-08-04):
// checkout-link creation (with lazy location backfill) → pending Payment row
// → client redirect into the hosted checkout → signed webhook completes the
// row → replay changes nothing (idempotency) → bad signature rejected →
// unmatched merchant dropped → NEEDS_RECONNECT degrades gracefully on both
// the practitioner and client surfaces. Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/billing/b2-verify.ts

const APP_PORT = 3116;
const MOCK_PORT = 3132;
const BASE = `http://localhost:${APP_PORT}`;
const DEMO_HOST = "demo.platform.test";
const TENANT_ID = "tnt_b2_demo_000000001";
const ENC_KEY = "b4f1c2d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f91";
const SIG_KEY = "mock-webhook-signature-key";
const NOTIFY_URL = `${BASE}/api/webhooks/square`;
const MERCHANT = "MERCHANT-MOCK-B2";
const ORDER_ID = "ORDER-MOCK-0001";
const PAYMENT_ID = "PAYMENT-MOCK-0001";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// ---- Mock Square: locations + payment links ----
const seen = { linkBodies: [] as unknown[], locationCalls: 0 };
function mockSquare(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.url === "/v2/locations") {
        seen.locationCalls++;
        return send(200, { locations: [{ id: "LOC-MOCK-1", status: "ACTIVE" }] });
      }
      if (req.url === "/v2/checkout/payment-links") {
        seen.linkBodies.push(JSON.parse(body || "{}"));
        return send(200, {
          payment_link: { id: "PLINK-1", url: `http://localhost:${MOCK_PORT}/hosted/pay`, order_id: ORDER_ID },
        });
      }
      if (req.url === "/hosted/pay") return send(200, { hosted: true });
      send(404, {});
    });
  }).listen(MOCK_PORT);
}

function signedEvent(overrides: Partial<{ event_id: string; merchant_id: string; status: string; order_id: string; payment_id: string }> = {}) {
  const body = JSON.stringify({
    merchant_id: overrides.merchant_id ?? MERCHANT,
    type: "payment.updated",
    event_id: overrides.event_id ?? "EVT-0001",
    created_at: new Date().toISOString(),
    data: {
      type: "payment",
      id: overrides.payment_id ?? PAYMENT_ID,
      object: {
        payment: {
          id: overrides.payment_id ?? PAYMENT_ID,
          order_id: overrides.order_id ?? ORDER_ID,
          amount_money: { amount: 15000, currency: "USD" },
          status: overrides.status ?? "COMPLETED",
          created_at: new Date().toISOString(),
        },
      },
    },
  });
  const sig = createHmac("sha256", SIG_KEY).update(NOTIFY_URL + body).digest("base64");
  return { body, sig };
}

async function postWebhook(body: string, sig: string): Promise<number> {
  const res = await fetch(NOTIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-square-hmacsha256-signature": sig },
    body,
  });
  return res.status;
}

async function cleanup() {
  await prisma.payment.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: "EVT-" } } }).catch(() => {});
  await prisma.connectedPaymentAccount.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.consentGrant.deleteMany({ where: { user: { tenantId: TENANT_ID } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } }).catch(() => {});
}

async function signIn(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => {
    for (const c of sc) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": DEMO_HOST } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "x-forwarded-host": DEMO_HOST, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password: "fixture-pass-1" }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  process.env.PAYMENT_TOKEN_ENC_KEY = ENC_KEY;

  await cleanup();
  await prisma.tenant.create({
    data: { id: TENANT_ID, slug: "demo", displayName: "B2 Demo", status: "DEMO", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
  });
  const pract = await prisma.user.create({
    data: { email: "pract@b2.fixture.test", name: "Demi Ops", role: "PRACTITIONER", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  const client = await prisma.user.create({
    data: { email: "client@b2.fixture.test", name: "Cleo Pays", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  // Data-consent grant, or the /space consent gate intercepts every page.
  // Stamped with the DEMO tenant: its scope is strict — a null-tenant row
  // would be invisible to hasConsent() on the demo host.
  await prisma.consentGrant.create({ data: { tenantId: TENANT_ID, userId: client.id, version: "2026-07" } });
  void pract;
  // Connected account with NO location id — proves the lazy backfill.
  await prisma.connectedPaymentAccount.create({
    data: {
      tenantId: TENANT_ID,
      provider: "square",
      merchantId: MERCHANT,
      merchantName: "B2 Mock Studio",
      locationId: null,
      accessTokenEnc: encryptToken("B2-ACCESS-TOKEN"),
      refreshTokenEnc: encryptToken("B2-REFRESH-TOKEN"),
      scopes: ["PAYMENTS_WRITE"],
      status: "CONNECTED",
      connectedAt: new Date(),
    },
  });

  const mock = mockSquare();
  console.log(`~ mock Square on :${MOCK_PORT}; starting built app on :${APP_PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(APP_PORT),
    PLATFORM_DOMAIN: "platform.test",
    AUTH_TRUST_HOST: "true",
    SQUARE_APP_ID: "sandbox-sq0idb-PLACEHOLDER",
    SQUARE_APP_SECRET: "sandbox-placeholder-secret",
    SQUARE_OAUTH_BASE_URL: `http://localhost:${MOCK_PORT}`,
    PAYMENT_TOKEN_ENC_KEY: ENC_KEY,
    SQUARE_WEBHOOK_SIGNATURE_KEY: SIG_KEY,
    SQUARE_WEBHOOK_NOTIFICATION_URL: NOTIFY_URL,
    APP_BASE_URL: BASE,
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: "ignore" });
  // Mirror env for in-process service calls.
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 1 — checkout link creation (service layer, as the server action calls it)
    const { createCheckoutLink } = await import("../../lib/payments/checkout");
    const link = await createCheckoutLink({
      tenantId: TENANT_ID,
      clientId: client.id,
      purpose: "session",
      amountCents: 15000,
      description: "Deep-dive session, August",
      redirectUrl: `${BASE}/space?paid=1`,
    });
    check("checkout link created", link.ok === true, JSON.stringify(link));
    const sentBody = seen.linkBodies[0] as { idempotency_key?: string; quick_pay?: { price_money?: { amount?: number; currency?: string }; location_id?: string }; checkout_options?: { redirect_url?: string } } | undefined;
    check("quick_pay carries integer cents + currency", sentBody?.quick_pay?.price_money?.amount === 15000 && sentBody?.quick_pay?.price_money?.currency === "USD");
    check("idempotency_key sent", Boolean(sentBody?.idempotency_key));
    check("location backfilled lazily from /v2/locations", sentBody?.quick_pay?.location_id === "LOC-MOCK-1" && seen.locationCalls === 1);
    const acct = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: TENANT_ID } });
    check("backfilled location persisted", acct?.locationId === "LOC-MOCK-1");
    const pending = await prisma.payment.findFirst({ where: { tenantId: TENANT_ID } });
    check("pending Payment row keyed on order id", pending?.providerPaymentId === `order:${ORDER_ID}` && pending.status === "PENDING" && pending.clientId === client.id);

    // 2 — client pay flow: their pay-link page redirects into the hosted checkout
    const clientCookie = await signIn("client@b2.fixture.test");
    const payPage = await fetch(`${BASE}/space/pay-link/${pending!.id}`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: clientCookie },
      redirect: "manual",
    });
    check(
      "client pay page redirects to Square-hosted checkout",
      payPage.status >= 300 && payPage.status < 400 && (payPage.headers.get("location") ?? "").includes("/hosted/pay"),
      `status=${payPage.status} location=${payPage.headers.get("location") ?? "-"}`
    );

    // 3 — signed webhook completes the payment
    const evt = signedEvent();
    check("webhook accepted (signed)", (await postWebhook(evt.body, evt.sig)) === 200);
    const completed = await prisma.payment.findFirst({ where: { tenantId: TENANT_ID } });
    check("payment row completed with real provider id", completed?.status === "COMPLETED" && completed.providerPaymentId === PAYMENT_ID);

    // 4 — idempotency: replay the exact same event
    check("replay accepted quietly", (await postWebhook(evt.body, evt.sig)) === 200);
    check("replay created no second row", (await prisma.payment.count({ where: { tenantId: TENANT_ID } })) === 1);
    check("one WebhookEvent row, processed", (await prisma.webhookEvent.count({ where: { id: "EVT-0001" } })) === 1 && Boolean((await prisma.webhookEvent.findUnique({ where: { id: "EVT-0001" } }))?.processedAt));

    // 5 — bad signature rejected before anything is read
    const bad = signedEvent({ event_id: "EVT-0002" });
    check("tampered signature → 403", (await postWebhook(bad.body, "AAAA" + bad.sig.slice(4))) === 403);
    check("rejected event left no trace", (await prisma.webhookEvent.count({ where: { id: "EVT-0002" } })) === 0);

    // 6 — unmatched merchant acknowledged but dropped
    const stranger = signedEvent({ event_id: "EVT-0003", merchant_id: "MERCHANT-UNKNOWN", payment_id: "PAYMENT-STRANGER", order_id: "ORDER-STRANGER" });
    check("unmatched merchant → 200 (acknowledged)", (await postWebhook(stranger.body, stranger.sig)) === 200);
    check("unmatched merchant recorded no payment", (await prisma.payment.count({ where: { providerPaymentId: "PAYMENT-STRANGER" } })) === 0);

    // 7 — completed payment page shows the settled state (no re-redirect)
    const paidPage = await fetch(`${BASE}/space/pay-link/${pending!.id}`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: clientCookie },
    });
    const paidHtml = await paidPage.text();
    check("paid page shows 'All settled'", paidHtml.includes("All settled"), `status=${paidPage.status} url=${paidPage.url}`);

    // 8 — practitioner ledger shows the payment
    const practCookie = await signIn("pract@b2.fixture.test");
    const ledger = await fetch(`${BASE}/practitioner/payments`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: practCookie },
    });
    const ledgerHtml = await ledger.text();
    check("ledger lists the payment with client name", ledgerHtml.includes("Cleo Pays") && ledgerHtml.includes("$150.00") && ledgerHtml.includes("completed"));

    // 9 — NEEDS_RECONNECT degrades gracefully everywhere (§3.3)
    const second = await createCheckoutLink({
      tenantId: TENANT_ID, clientId: client.id, purpose: "session", amountCents: 5000,
      description: "Follow-up", redirectUrl: `${BASE}/space?paid=1`,
    });
    check("second link created while connected", second.ok === true);
    await prisma.connectedPaymentAccount.updateMany({ where: { tenantId: TENANT_ID }, data: { status: "NEEDS_RECONNECT" } });
    const blocked = await createCheckoutLink({
      tenantId: TENANT_ID, clientId: client.id, purpose: "session", amountCents: 5000,
      description: "Blocked", redirectUrl: `${BASE}/space?paid=1`,
    });
    check("new links pause on NEEDS_RECONNECT", blocked.ok === false && blocked.reason === "needs-reconnect");
    const gracePage = await fetch(`${BASE}/space/pay-link/${second.ok ? second.paymentId : ""}`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: clientCookie },
    });
    check("client sees graceful unavailable copy (never an error)", (await gracePage.text()).includes("temporarily unavailable"));
    const ledger2 = await fetch(`${BASE}/practitioner/payments`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: practCookie },
    });
    check("ledger banner offers the re-connect", (await ledger2.text()).includes("quick re-connect"));
  } finally {
    server.kill();
    mock.close();
    await cleanup();
    console.log("~ demo rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nB2 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
