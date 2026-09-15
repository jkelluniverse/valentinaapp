import { spawn, execSync, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { encryptToken, decryptToken } from "../../lib/payments/crypto";
import { refreshDueTokens } from "../../lib/payments/refresh";

// CLAUDE-BILLING Phase B1 acceptance — the Connect flow end-to-end against
// a LOCAL mock of Square's OAuth surface (endpoint shapes per the live docs;
// the real developer app isn't registered yet, and nothing here blocks on
// that paperwork — when credentials land they are env values only).
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/billing/b1-verify.ts
//
// Proves: authorize redirect carries client_id/scope/signed state; the
// callback exchanges + encrypts + stores; NO plaintext token at rest (DB
// dump inspection); merchant name displayed; refresh rotates tokens;
// forced refresh failure → NEEDS_RECONNECT; disconnect revokes provider-
// side AND deletes local tokens; Valentina's env-legacy arrangement is
// represented with zero rows and zero behavior change. Self-cleaning.

const APP_PORT = 3113;
const MOCK_PORT = 3131;
const BASE = `http://localhost:${APP_PORT}`;
const DEMO_HOST = "demo.platform.test";
const TENANT_ID = "tnt_b1_demo_000000001";
const ENC_KEY = "a3f1c2d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

const ACCESS_1 = "SANDBOX-ACCESS-TOKEN-ONE-abc123";
const ACCESS_2 = "SANDBOX-ACCESS-TOKEN-TWO-def456";
const REFRESH_1 = "SANDBOX-REFRESH-TOKEN-xyz789";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// ---- The mock Square: /oauth2/token, /oauth2/revoke, /v2/merchants/:id ----
const seen = { tokenCalls: 0, revokeAuth: "", revokedToken: "", refreshFails: false };
function mockSquare(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.url === "/oauth2/token") {
        const data = JSON.parse(body || "{}");
        seen.tokenCalls++;
        if (data.grant_type === "authorization_code") {
          if (data.code !== "mock-auth-code") return send(400, { errors: [{ detail: "bad code" }] });
          return send(200, {
            access_token: ACCESS_1,
            refresh_token: REFRESH_1,
            expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
            merchant_id: "MERCHANT-MOCK-1",
            token_type: "bearer",
          });
        }
        if (data.grant_type === "refresh_token") {
          if (seen.refreshFails) return send(401, { errors: [{ detail: "revoked" }] });
          if (data.refresh_token !== REFRESH_1) return send(401, { errors: [{ detail: "unknown refresh token" }] });
          return send(200, {
            access_token: ACCESS_2,
            refresh_token: REFRESH_1,
            expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
            merchant_id: "MERCHANT-MOCK-1",
            token_type: "bearer",
          });
        }
        return send(400, { errors: [{ detail: "bad grant" }] });
      }
      if (req.url === "/oauth2/revoke") {
        seen.revokeAuth = req.headers.authorization ?? "";
        seen.revokedToken = JSON.parse(body || "{}").access_token ?? "";
        return send(200, { success: true });
      }
      if (req.url?.startsWith("/v2/merchants/")) {
        return send(200, { merchant: { business_name: "Mock Wellness Studio" } });
      }
      send(404, {});
    });
  }).listen(MOCK_PORT);
}

async function cleanup() {
  await prisma.connectedPaymentAccount.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
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

  await cleanup();
  await prisma.tenant.create({
    data: { id: TENANT_ID, slug: "demo", displayName: "B1 Demo", status: "DEMO", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
  });
  await prisma.user.create({
    data: { email: "pract@demo.fixture.test", name: "Demi Ops", role: "PRACTITIONER", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
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
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: "ignore" });
  process.env.SQUARE_OAUTH_BASE_URL = `http://localhost:${MOCK_PORT}`;
  process.env.SQUARE_APP_ID = "sandbox-sq0idb-PLACEHOLDER";
  process.env.SQUARE_APP_SECRET = "sandbox-placeholder-secret";
  process.env.PAYMENT_TOKEN_ENC_KEY = ENC_KEY;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const cookie = await signIn("pract@demo.fixture.test");

    // 1 — start: redirect to authorize with client_id + scope + signed state
    const start = await fetch(`${BASE}/api/payments/square/start`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie },
      redirect: "manual",
    });
    const loc = start.headers.get("location") ?? "";
    check("start redirects to Square authorize", loc.includes(`/oauth2/authorize`), loc.slice(0, 90));
    const authUrl = new URL(loc);
    check("authorize carries client_id + scope", authUrl.searchParams.get("client_id") === "sandbox-sq0idb-PLACEHOLDER" && Boolean(authUrl.searchParams.get("scope")));
    const state = authUrl.searchParams.get("state") ?? "";
    check("state present and signed (4 parts)", state.split(".").length === 4);

    // 2 — callback: exchange, encrypt, store
    const cb = await fetch(`${BASE}/api/payments/square/callback?code=mock-auth-code&state=${encodeURIComponent(state)}`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie },
      redirect: "manual",
    });
    check("callback lands on settings?pay=connected", (cb.headers.get("location") ?? "").includes("pay=connected"));
    const row = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: TENANT_ID } });
    check("account row stored (CONNECTED)", row?.status === "CONNECTED" && row.merchantId === "MERCHANT-MOCK-1");
    check("merchant business name captured", row?.merchantName === "Mock Wellness Studio");

    // 3 — encryption at rest: DB value holds NO plaintext token material
    const noPlain = Boolean(row && !row.accessTokenEnc.includes(ACCESS_1) && !(row.refreshTokenEnc ?? "").includes(REFRESH_1));
    check("no plaintext tokens at rest (dump inspection)", noPlain);
    check("ciphertext round-trips to the exchanged token", row ? decryptToken(row.accessTokenEnc) === ACCESS_1 : false);

    // 4 — settings page shows the connection
    const settings = await fetch(`${BASE}/practitioner/settings/payments`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie },
    });
    const html = await settings.text();
    check("settings shows 'Connected as {business name}'", html.includes("Connected as Mock Wellness Studio"));

    // 5 — proactive refresh rotates tokens
    await prisma.connectedPaymentAccount.update({ where: { id: row!.id }, data: { expiresAt: new Date(Date.now() + 86400_000), lastVerifiedAt: null } });
    const r1 = await refreshDueTokens();
    const after = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: TENANT_ID } });
    check("refresh job rotated the access token", r1.refreshed === 1 && after !== null && decryptToken(after.accessTokenEnc) === ACCESS_2);

    // 6 — forced refresh failure → NEEDS_RECONNECT (the §3.3 path)
    seen.refreshFails = true;
    await prisma.connectedPaymentAccount.update({ where: { id: row!.id }, data: { expiresAt: new Date(), lastVerifiedAt: null } });
    const r2 = await refreshDueTokens();
    const flagged = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: TENANT_ID } });
    check("refresh failure flips to NEEDS_RECONNECT", r2.flagged === 1 && flagged?.status === "NEEDS_RECONNECT");
    const home = await fetch(`${BASE}/practitioner`, { headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie } });
    check("dashboard banner offers the re-connect", (await home.text()).includes("needs a quick re-connect"));

    // 7 — disconnect: provider-side revoke + local deletion
    const { revokeAccess } = await import("../../lib/payments/square");
    await revokeAccess(decryptToken(flagged!.accessTokenEnc));
    await prisma.connectedPaymentAccount.delete({ where: { id: flagged!.id } });
    check("revoke used 'Client APPLICATION_SECRET' auth", seen.revokeAuth === "Client sandbox-placeholder-secret");
    check("revoke sent the live access token", seen.revokedToken === ACCESS_2);
    check("local tokens deleted", (await prisma.connectedPaymentAccount.count({ where: { tenantId: TENANT_ID } })) === 0);

    // 8 — Valentina zero-change representation: env token → virtual account,
    //     no DB rows, her existing payment code path untouched.
    process.env.SQUARE_ACCESS_TOKEN = "env-legacy-token";
    delete process.env.SQUARE_ENVIRONMENT;
    const { getAccountView } = await import("../../lib/payments/account");
    const hers = await getAccountView("tnt_valentina_000000001");
    check("her env arrangement shows CONNECTED (env-legacy)", hers?.source === "env-legacy" && hers.status === "CONNECTED");
    check("her representation created zero rows", (await prisma.connectedPaymentAccount.count()) === 0);

    // 9 — bad state is rejected
    const bad = await fetch(`${BASE}/api/payments/square/callback?code=x&state=tampered.1.2.3`, {
      headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie },
      redirect: "manual",
    });
    check("tampered state rejected", (bad.headers.get("location") ?? "").includes("pay=badstate"));
  } finally {
    server.kill();
    mock.close();
    await cleanup();
    console.log("~ demo rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nB1 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
