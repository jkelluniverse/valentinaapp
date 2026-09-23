import { spawn, execSync, type ChildProcess } from "child_process";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";

// PLATFORM Phase 1 acceptance — the DEMO tenant switch test.
// Proves the promise at the heart of the platform: a tenant's layout and
// skin are DATA. A DEMO tenant is created by row inserts alone (zero code
// changes), served on its subdomain, and re-skinned/re-arranged by a config
// UPDATE while the server keeps running. Valentina's host stays untouched.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/platform/phase1-switch.ts
//
// Self-cleaning: every demo row is removed at the end (the scratch dataset
// must return to its baseline state — reseed-invalidates-baseline rule).

const PORT = 3108;
const BASE = `http://localhost:${PORT}`;
const PLATFORM_DOMAIN = "platform.test";
const DEMO_HOST = `demo.${PLATFORM_DOMAIN}`;
const TENANT_ID = "tnt_demo_switch_000001";
const PRACT_ID = "dfx_pract_000000000001";
const CLIENT_ID = "dfx_client_00000000001";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

function guardDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (a scratch copy — never production).");
  if (/railway|rlwy\.net|proxy\.rlwy/.test(url)) throw new Error("Refusing to run against a Railway database.");
}

async function fetchHtml(path: string, host: string, cookie?: string): Promise<{ status: number; html: string; setCookie: string[] }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-forwarded-host": host, ...(cookie ? { Cookie: cookie } : {}) },
    redirect: "manual",
  });
  return { status: res.status, html: await res.text().catch(() => ""), setCookie: res.headers.getSetCookie?.() ?? [] };
}

// Credentials sign-in, cookie-jar style. Tenant host travels as
// x-forwarded-host: undici's fetch strips a custom Host header, and the
// resolver prefers x-forwarded-host anyway (proxy-shaped, like Railway).
async function signIn(email: string, host: string): Promise<string> {
  let jar = new Map<string, string>();
  const absorb = (setCookies: string[]) => {
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": host } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "x-forwarded-host": host, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, email, password: "fixture-pass-1" }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookieHeader();
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } }).catch(() => {});
}

async function main() {
  guardDb();
  await cleanup(); // stale rows from a crashed run

  // ONE insert set — this is the whole "provision a demo tenant" act.
  // Zero code changes, zero deploys: rows only (Rule 0.2).
  await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      slug: "demo",
      displayName: "Demo Practice",
      status: "DEMO",
      layoutKey: "dashboard-v1",
      skinKey: "clinical-light",
      branding: { portalTitle: "demo practice" },
      featureFlags: {},
    },
  });
  const hash = bcrypt.hashSync("fixture-pass-1", 10);
  await prisma.user.create({
    data: { id: PRACT_ID, email: "pract@demo.fixture.test", name: "Demi Ops", role: "PRACTITIONER", active: true, tenantId: TENANT_ID, passwordHash: hash },
  });
  await prisma.user.create({
    data: { id: CLIENT_ID, email: "client@demo.fixture.test", name: "Casey Fixture", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: hash, consentAt: new Date("2026-01-05T00:00:00Z") },
  });

  console.log(`~ starting built app on :${PORT} with PLATFORM_DOMAIN=${PLATFORM_DOMAIN}`);
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(PORT), PLATFORM_DOMAIN, AUTH_TRUST_HOST: "true" },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 1 — the demo subdomain serves the demo tenant's config.
    const login = await fetchHtml("/login", DEMO_HOST);
    check("demo host serves login", login.status === 200);
    check("demo host wears clinical-light", login.html.includes('data-skin="clinical-light"'));

    // 2 — the demo practitioner signs in on the demo host and gets dashboard-v1.
    const cookie = await signIn("pract@demo.fixture.test", DEMO_HOST);
    const home = await fetchHtml("/practitioner", DEMO_HOST, cookie);
    check("demo practitioner home renders", home.status === 200);
    check("dashboard-v1 chrome (sidebar) present", home.html.includes("<aside"));
    check("dashboard-v1 home is Today", home.html.includes(">Today</h1>"));

    // 3 — feature-level isolation through the DAL: the demo roster holds the
    // demo client and none of the default tenant's people.
    check("demo roster shows demo client", home.html.includes("Casey"));
    check("demo roster free of default-tenant clients", !home.html.includes("María") && !home.html.includes("Tomás"));
    // Regression: the unread badge once counted the default tenant's waiting
    // messages for everyone — the count must go through the DAL.
    check("no cross-tenant unread badge", !/\d+ unread/.test(home.html));

    // 4 — the door check: that same demo session is refused on the default host.
    const cross = await fetchHtml("/practitioner", `localhost:${PORT}`, cookie);
    check("demo session refused on default host", cross.status >= 300 && cross.status < 400, `status ${cross.status}`);

    // 5 — THE SWITCH: config UPDATE only, server untouched.
    await prisma.tenant.update({ where: { id: TENANT_ID }, data: { skinKey: "celestial-dark", layoutKey: "journey-v1" } });
    console.log("~ config flipped (celestial-dark + journey-v1); waiting out the 60s tenant cache…");
    await new Promise((r) => setTimeout(r, 65_000));

    const after = await fetchHtml("/practitioner", DEMO_HOST, cookie);
    check("after flip: celestial-dark", after.html.includes('data-skin="celestial-dark"'));
    check("after flip: journey-v1 chrome (no sidebar)", !after.html.includes("<aside"));

    // 6 — Valentina's host never moved: default host stays journey-v1 + warm-clay.
    const val = await fetchHtml("/login", `localhost:${PORT}`);
    check("default host still warm-clay", val.html.includes('data-skin="warm-clay"'));
  } finally {
    server.kill();
    await cleanup();
    console.log("~ demo rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nSWITCH TEST PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none left */ }
  });
