import { spawn, execSync, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// PLATFORM Phase 3 acceptance — ReadingProvider + computed modules against
// a LOCAL mock of astrology-api.io (endpoint shapes per the vendor's own
// Postman collection, 2026-08-04):
//   · western-natal + numerology compute at intake completion-time
//   · cached by inputsHash: a second identical computation = ZERO new API
//     calls (the free tier is 50/month — the cache proof is the phase gate)
//   · provider failure parks PENDING_RETRY; the tick retry recovers it
//   · birth-time-unknown: houses are skipped entirely, positions degrade
//   · unconfigured (no key, no mock): parks quietly, zero network
//   · the client's map renders the computed panels through the registry
// Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/platform/phase3-verify.ts

const APP_PORT = 3119;
const MOCK_PORT = 3134;
const BASE = `http://localhost:${APP_PORT}`;
const DEMO_HOST = "p3.platform.test";
const TENANT_ID = "tnt_p3_demo_000000001";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// ---- Mock astrology-api ----
const seen = { calls: [] as string[], fail: false };
function mockAstro(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      seen.calls.push(req.url ?? "");
      if (seen.fail) return send(500, { error: "mock outage" });
      if (req.url === "/api/v3/data/positions") {
        return send(200, { positions: [{ point: "Sun", sign: "Taurus", degree: 24.5 }, { point: "Moon", sign: "Pisces", degree: 3.1 }] });
      }
      if (req.url === "/api/v3/data/house-cusps") {
        return send(200, { positions: [{ point: "ASC", sign: "Virgo", degree: 15.0, house: 1 }] });
      }
      if (req.url === "/api/v3/numerology/core-numbers") {
        return send(200, { core_numbers: { life_path: 7, expression: 3, soul_urge: 9 } });
      }
      send(404, {});
    });
  }).listen(MOCK_PORT);
}

async function cleanup() {
  await prisma.reading.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { user: { tenantId: TENANT_ID } } }).catch(() => {});
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

  await cleanup();
  await prisma.tenant.create({
    data: { id: TENANT_ID, slug: "p3", displayName: "P3 Demo", status: "DEMO", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
  });
  await prisma.tenantModule.createMany({
    data: [
      { tenantId: TENANT_ID, moduleKey: "western-natal", enabled: true, position: 1, settings: {} },
      { tenantId: TENANT_ID, moduleKey: "numerology", enabled: true, position: 2, settings: {} },
    ],
  });
  const client = await prisma.user.create({
    data: { email: "client@p3.fixture.test", name: "Nova Probe", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  await prisma.consentGrant.create({ data: { tenantId: TENANT_ID, userId: client.id, version: "2026-07" } });
  await prisma.clientProfile.create({
    data: { tenantId: TENANT_ID, userId: client.id, birthDate: new Date("1990-05-15T00:00:00Z"), birthTime: "14:30", birthTimeUnknown: false, birthPlace: "London", birthLat: 51.5074, birthLng: -0.1278 },
  });

  const mock = mockAstro();
  console.log(`~ mock astrology-api on :${MOCK_PORT}; starting built app on :${APP_PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(APP_PORT),
    PLATFORM_DOMAIN: "platform.test",
    AUTH_TRUST_HOST: "true",
    ASTROLOGY_API_KEY: "mock-key",
    ASTROLOGY_API_BASE_URL: `http://localhost:${MOCK_PORT}`,
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: "ignore" });
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const { computeReadingsFor, retryPendingReadings } = await import("../../lib/readings/compute");

    // 1 — first computation: three calls (positions, houses, numerology)
    const r1 = await computeReadingsFor(TENANT_ID, client.id);
    check("three readings computed at completion", r1.computed === 3 && r1.failed === 0, JSON.stringify(r1));
    check("three provider calls made", seen.calls.length === 3, seen.calls.join(","));
    const rows = await prisma.reading.findMany({ where: { tenantId: TENANT_ID, clientId: client.id } });
    check("Reading rows COMPLETE with payloads", rows.length === 3 && rows.every((r) => r.status === "COMPLETE"));

    // 2 — THE CACHE PROOF: identical inputs → zero new API calls
    const callsBefore = seen.calls.length;
    const r2 = await computeReadingsFor(TENANT_ID, client.id);
    check("second identical computation: all cached", r2.cached === 3 && r2.computed === 0, JSON.stringify(r2));
    check("ZERO new API calls (free-tier cache proof)", seen.calls.length === callsBefore);

    // 3 — the map renders the computed panels through the registry
    const cookie = await signIn("client@p3.fixture.test");
    const design = await fetch(`${BASE}/space/design`, { headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie } });
    const html = await design.text();
    check("natal panel renders positions", html.includes("Natal Chart") && html.includes("Taurus"));
    check("numerology panel renders core numbers", html.includes("Numerology") && html.includes("life path"));

    // 4 — retry path: outage parks PENDING_RETRY; tick recovery completes it
    const client2 = await prisma.user.create({
      data: { email: "client2@p3.fixture.test", name: "Retry Probe", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
    });
    await prisma.clientProfile.create({
      data: { tenantId: TENANT_ID, userId: client2.id, birthDate: new Date("1985-08-22T00:00:00Z"), birthTime: "18:45", birthTimeUnknown: false, birthPlace: "Paris", birthLat: 48.8566, birthLng: 2.3522 },
    });
    seen.fail = true;
    const r3 = await computeReadingsFor(TENANT_ID, client2.id);
    check("outage parks readings as PENDING_RETRY", r3.failed === 3 && (await prisma.reading.count({ where: { clientId: client2.id, status: "PENDING_RETRY" } })) === 3, JSON.stringify(r3));
    seen.fail = false;
    const r4 = await retryPendingReadings();
    check("tick retry recovers parked readings", r4.recovered === 3 && (await prisma.reading.count({ where: { clientId: client2.id, status: "COMPLETE" } })) === 3, JSON.stringify(r4));

    // 5 — birth-time-unknown: houses skipped entirely, positions degrade
    const client3 = await prisma.user.create({
      data: { email: "client3@p3.fixture.test", name: "NoTime Probe", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
    });
    await prisma.clientProfile.create({
      data: { tenantId: TENANT_ID, userId: client3.id, birthDate: new Date("1970-01-05T00:00:00Z"), birthTime: null, birthTimeUnknown: true, birthPlace: "Lima", birthLat: -12.046, birthLng: -77.043 },
    });
    const r5 = await computeReadingsFor(TENANT_ID, client3.id);
    const kinds3 = (await prisma.reading.findMany({ where: { clientId: client3.id }, select: { kind: true } })).map((r) => r.kind).sort();
    check("time-unknown: houses skipped, positions + numerology computed", r5.computed === 2 && kinds3.join(",") === "natal-positions,numerology-core", JSON.stringify({ r5, kinds3 }));

    // 6 — unconfigured: parks quietly with ZERO network calls
    const client4 = await prisma.user.create({
      data: { email: "client4@p3.fixture.test", name: "Unconfigured Probe", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
    });
    await prisma.clientProfile.create({
      data: { tenantId: TENANT_ID, userId: client4.id, birthDate: new Date("2000-03-03T00:00:00Z"), birthTime: "09:00", birthTimeUnknown: false, birthPlace: "Rome", birthLat: 41.9, birthLng: 12.49 },
    });
    const savedKey = process.env.ASTROLOGY_API_KEY;
    const savedBase = process.env.ASTROLOGY_API_BASE_URL;
    delete process.env.ASTROLOGY_API_KEY;
    delete process.env.ASTROLOGY_API_BASE_URL;
    const callsBeforeUnconf = seen.calls.length;
    const r6 = await computeReadingsFor(TENANT_ID, client4.id);
    process.env.ASTROLOGY_API_KEY = savedKey;
    process.env.ASTROLOGY_API_BASE_URL = savedBase;
    check("unconfigured: parked quietly, zero network", r6.computed === 0 && r6.failed === 0 && seen.calls.length === callsBeforeUnconf && (await prisma.reading.count({ where: { clientId: client4.id, status: "PENDING_RETRY" } })) === 3, JSON.stringify(r6));
  } finally {
    server.kill();
    mock.close();
    await cleanup();
    console.log("~ demo rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nPHASE 3 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
