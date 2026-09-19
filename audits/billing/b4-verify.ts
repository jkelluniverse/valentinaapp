import { spawn, execSync, type ChildProcess } from "child_process";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// CLAUDE-BILLING Phase B4 acceptance — hardening:
//   1. WebhookEvent pruning: processed-and-old rows go; recent and
//      unprocessed rows stay (evidence).
//   2. Integer-cents invariant: the checkout path rejects fractional,
//      zero, and negative amounts BEFORE any provider call.
//   3. Copy audit: no billing language on ANY client-facing surface —
//      every /space page from the smoke list, rendered as María.
// (The daily token-health job is B1's refreshDueTokens, already verified.)
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/billing/b4-verify.ts

const APP_PORT = 3118;
const BASE = `http://localhost:${APP_PORT}`;

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

const CLIENT_PAGES = [
  "/space",
  "/space/new",
  "/space/entries",
  "/space/journey",
  "/space/first-map",
  "/space/design",
  "/space/courses",
  "/space/schedule",
  "/space/messages",
  "/space/settings",
  "/space/profile",
];

// PLATFORM-billing language that must NEVER reach a client (§B4 — Layer 2
// is between the platform and the practitioner, full stop). Deliberately
// phrase-specific: generic money words ("invoice", "plan") legitimately
// appear in clients' OWN reflections and in the practitioner's existing
// client-payment flows, which are not what this rule is about.
const FORBIDDEN = /past.due|suspended|manage billing|payment issue|founding partner|stripe/i;

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
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
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

  // ---- 1. Pruning ----
  const { pruneWebhookEvents } = await import("../../lib/billing/lifecycle");
  const old = new Date(Date.now() - 120 * 86400_000);
  await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: "evt_b4_" } } });
  await prisma.webhookEvent.create({ data: { id: "evt_b4_old_done", layer: "stripe", receivedAt: old, processedAt: old } });
  await prisma.webhookEvent.create({ data: { id: "evt_b4_old_open", layer: "stripe", receivedAt: old } });
  await prisma.webhookEvent.create({ data: { id: "evt_b4_new_done", layer: "square", processedAt: new Date() } });
  const pruned = await pruneWebhookEvents();
  check("old processed event pruned", pruned.pruned >= 1 && (await prisma.webhookEvent.count({ where: { id: "evt_b4_old_done" } })) === 0);
  check("old UNPROCESSED event kept (evidence)", (await prisma.webhookEvent.count({ where: { id: "evt_b4_old_open" } })) === 1);
  check("recent processed event kept", (await prisma.webhookEvent.count({ where: { id: "evt_b4_new_done" } })) === 1);
  await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: "evt_b4_" } } });

  // ---- 2. Integer-cents invariant (provider layer refuses bad amounts) ----
  const { SquarePaymentProvider } = await import("../../lib/payments/square");
  const provider = new SquarePaymentProvider();
  const account = { tenantId: "t", provider: "square", merchantId: "m", locationId: "L", accessToken: "x" };
  const rejects = async (amountCents: number) => {
    try {
      await provider.createCheckout({ account, amountCents, currency: "USD", description: "x", clientRef: "c", redirectUrl: "http://localhost/r" });
      return false;
    } catch (e) {
      return e instanceof Error && e.message.includes("integer cents");
    }
  };
  check("fractional cents rejected before any provider call", await rejects(100.5));
  check("zero rejected", await rejects(0));
  check("negative rejected", await rejects(-500));

  // ---- 3. Client-facing copy audit ----
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(APP_PORT) },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const cookie = await signIn("maria@fixture.test");
    let dirty: string[] = [];
    for (const path of CLIENT_PAGES) {
      const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
      const html = await res.text();
      const m = html.match(FORBIDDEN);
      if (m) dirty.push(`${path} ("${m[0]}")`);
    }
    check("no billing language on any client surface", dirty.length === 0, dirty.join(", ") || `${CLIENT_PAGES.length} pages clean`);
  } finally {
    server.kill();
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nB4 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
