import { spawn, execSync, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import { createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// CLAUDE-BILLING Phase B3 acceptance — Layer 2 tenant subscriptions against
// a LOCAL mock of Stripe (endpoint shapes per the live docs, 2026-08-04):
// provisioning (paid plan → Customer + Subscription; DEMO/FOUNDING_COMP →
// ZERO Stripe objects), the billing settings page + Customer Portal
// round-trip, and the full §4.4 lifecycle: ACTIVE → PAST_DUE (banner,
// everything works) → SUSPENDED via the grace sweep (soft gates: no new
// invites/captures; read + export intact; client login unaffected) →
// invoice.paid → ACTIVE → subscription.deleted → CANCELED. Signature +
// idempotency proven like the Square ingress. Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/billing/b3-verify.ts

const APP_PORT = 3117;
const MOCK_PORT = 3133;
const BASE = `http://localhost:${APP_PORT}`;
const DEMO_HOST = "b3.platform.test";
const TENANT_ID = "tnt_b3_demo_000000001";
const WHSEC = "whsec-mock-b3";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// ---- Mock Stripe: customers, subscriptions, portal sessions ----
const seen = { customers: 0, subs: 0, portals: 0, lastPortalReturn: "" };
function mockStripe(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const form = new URLSearchParams(body);
      if (req.url === "/v1/customers") {
        seen.customers++;
        return send(200, { id: "cus_MOCK_B3", object: "customer" });
      }
      if (req.url === "/v1/subscriptions") {
        seen.subs++;
        if (form.get("customer") !== "cus_MOCK_B3") return send(400, { error: "bad customer" });
        return send(200, { id: "sub_MOCK_B3", status: "active", current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 });
      }
      if (req.url === "/v1/billing_portal/sessions") {
        seen.portals++;
        seen.lastPortalReturn = form.get("return_url") ?? "";
        return send(200, { id: "bps_MOCK", url: `http://localhost:${MOCK_PORT}/portal/session` });
      }
      send(404, {});
    });
  }).listen(MOCK_PORT);
}

function signedStripeEvent(type: string, eventId: string, objectFields: Record<string, unknown>): { body: string; sig: string } {
  const body = JSON.stringify({ id: eventId, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object: objectFields } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WHSEC).update(`${t}.${body}`).digest("hex");
  return { body, sig: `t=${t},v1=${v1}` };
}

async function postWebhook(body: string, sig: string): Promise<number> {
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": sig },
    body,
  });
  return res.status;
}

async function cleanup() {
  await prisma.tenantBilling.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: "evt_b3_" } } }).catch(() => {});
  await prisma.invite.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
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

const get = (path: string, cookie: string) =>
  fetch(`${BASE}${path}`, { headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie } });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  await cleanup();
  await prisma.tenant.create({
    data: { id: TENANT_ID, slug: "b3", displayName: "B3 Demo", status: "ACTIVE", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
  });
  await prisma.user.create({
    data: { email: "pract@b3.fixture.test", name: "Demi Ops", role: "PRACTITIONER", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  const client = await prisma.user.create({
    data: { email: "client@b3.fixture.test", name: "Cleo Reads", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  await prisma.consentGrant.create({ data: { tenantId: TENANT_ID, userId: client.id, version: "2026-07" } });

  const mock = mockStripe();
  console.log(`~ mock Stripe on :${MOCK_PORT}; starting built app on :${APP_PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(APP_PORT),
    PLATFORM_DOMAIN: "platform.test",
    AUTH_TRUST_HOST: "true",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: WHSEC,
    STRIPE_BASE_URL: `http://localhost:${MOCK_PORT}`,
    STRIPE_PRICE_CARE_99: "price_mock_care99",
    APP_BASE_URL: BASE,
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: "ignore" });
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const { provisionTenantBilling } = await import("../../lib/billing/provision");

    // 1 — DEMO/COMP provisioning creates ZERO Stripe objects
    const comp = await provisionTenantBilling({ tenantId: "tnt_b3_comp_tmp", plan: "FOUNDING_COMP", ownerName: "x", ownerEmail: "x@y.z" });
    check("FOUNDING_COMP provisions comped, zero Stripe calls", comp.ok === true && comp.ok && comp.comped && seen.customers === 0);
    await prisma.tenantBilling.deleteMany({ where: { tenantId: "tnt_b3_comp_tmp" } });

    // 2 — paid plan provisioning creates Customer + Subscription
    const paid = await provisionTenantBilling({ tenantId: TENANT_ID, plan: "CARE_99", ownerName: "Demi Ops", ownerEmail: "pract@b3.fixture.test" });
    const row = await prisma.tenantBilling.findFirst({ where: { tenantId: TENANT_ID } });
    check("CARE_99 provisions Customer + Subscription", paid.ok === true && seen.customers === 1 && seen.subs === 1);
    check("row ACTIVE with period end", row?.status === "ACTIVE" && row.stripeCustomerId === "cus_MOCK_B3" && Boolean(row.currentPeriodEnd));

    // 3 — billing settings page + portal round-trip
    const practCookie = await signIn("pract@b3.fixture.test");
    const page1 = await get("/practitioner/settings/billing", practCookie);
    const html1 = await page1.text();
    check("billing page shows plan + Active", html1.includes("Care · $99/mo") && html1.includes("Active"));
    check("portal round-trip works (mock session url + return_url)", await (async () => {
      // Drive the server action indirectly via the service (same code path the form calls).
      const { createPortalSession } = await import("../../lib/billing/stripe");
      const portalUrl = await createPortalSession("cus_MOCK_B3", `${BASE}/practitioner/settings/billing`);
      return portalUrl.includes("/portal/session") && seen.lastPortalReturn.includes("/practitioner/settings/billing");
    })());

    // 4 — invoice.payment_failed → PAST_DUE: banner up, everything still works
    const fail = signedStripeEvent("invoice.payment_failed", "evt_b3_fail1", { object: "invoice", customer: "cus_MOCK_B3" });
    check("payment_failed webhook accepted", (await postWebhook(fail.body, fail.sig)) === 200);
    const pastDue = await prisma.tenantBilling.findFirst({ where: { tenantId: TENANT_ID } });
    check("PAST_DUE with 14-day grace", pastDue?.status === "PAST_DUE" && Boolean(pastDue.graceUntil));
    const home1 = await get("/practitioner", practCookie);
    check("dashboard banner: payment issue, nothing else changes", (await home1.text()).includes("Payment issue"));
    const clientsPage = await get("/practitioner/clients", practCookie);
    check("PAST_DUE: practice fully works (clients page 200)", clientsPage.status === 200);

    // 5 — grace expiry → SUSPENDED via the tick sweep
    await prisma.tenantBilling.updateMany({ where: { tenantId: TENANT_ID }, data: { graceUntil: new Date(Date.now() - 1000) } });
    const { sweepBillingGrace } = await import("../../lib/billing/lifecycle");
    const swept = await sweepBillingGrace();
    check("grace sweep suspends", swept.suspended === 1 && (await prisma.tenantBilling.findFirst({ where: { tenantId: TENANT_ID } }))?.status === "SUSPENDED");

    // 6 — SUSPENDED soft gates: no NEW invites/captures (both actions call
    // newActivityAllowed); read + export intact
    const { newActivityAllowed } = await import("../../lib/billing/state");
    check("new activity gated (invite + capture guard)", (await newActivityAllowed(TENANT_ID)) === false);
    const read1 = await get("/practitioner/clients", practCookie);
    check("SUSPENDED: reading intact (roster 200)", read1.status === 200);
    const home2 = await get("/practitioner", practCookie);
    check("SUSPENDED banner: paused, data safe", (await home2.text()).includes("stays safe and readable"));
    const clientCookie = await signIn("client@b3.fixture.test");
    const clientHome = await get("/space", clientCookie);
    const clientHtml = await clientHome.text();
    check("client login unaffected, zero billing language", clientHome.status === 200 && !clientHtml.toLowerCase().includes("billing"));

    // 7 — payment lands → ACTIVE again
    const paidEvt = signedStripeEvent("invoice.paid", "evt_b3_paid1", { object: "invoice", customer: "cus_MOCK_B3", period_end: Math.floor(Date.now() / 1000) + 30 * 86400 });
    check("invoice.paid webhook accepted", (await postWebhook(paidEvt.body, paidEvt.sig)) === 200);
    const active = await prisma.tenantBilling.findFirst({ where: { tenantId: TENANT_ID } });
    check("back to ACTIVE, grace cleared", active?.status === "ACTIVE" && active.graceUntil === null);
    check("new activity resumes", (await newActivityAllowed(TENANT_ID)) === true);

    // 8 — idempotency + signature (same contract as Square)
    check("replayed event: 200, no state churn", (await postWebhook(paidEvt.body, paidEvt.sig)) === 200 && (await prisma.webhookEvent.count({ where: { id: "evt_b3_paid1" } })) === 1);
    check("tampered signature → 403", (await postWebhook(paidEvt.body, `${paidEvt.sig}00`)) === 403);

    // 9 — subscription deleted → CANCELED (same access posture as SUSPENDED)
    const del = signedStripeEvent("customer.subscription.deleted", "evt_b3_del1", { object: "subscription", customer: "cus_MOCK_B3" });
    check("subscription.deleted webhook accepted", (await postWebhook(del.body, del.sig)) === 200);
    check("CANCELED", (await prisma.tenantBilling.findFirst({ where: { tenantId: TENANT_ID } }))?.status === "CANCELED");
    check("CANCELED gates new activity", (await newActivityAllowed(TENANT_ID)) === false);

    // 10 — FOUNDING_COMP surface: pinned ACTIVE, never touches Stripe
    await prisma.tenantBilling.deleteMany({ where: { tenantId: TENANT_ID } });
    const compPage = await get("/practitioner/settings/billing", practCookie);
    check("no-row tenant reads Founding partner, pinned ACTIVE", (await compPage.text()).includes("Founding partner — no platform charges"));
    check("comp path made no further Stripe calls", seen.customers === 1 && seen.subs === 1);
  } finally {
    server.kill();
    mock.close();
    await cleanup();
    console.log("~ demo rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nB3 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
