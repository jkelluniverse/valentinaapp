import { spawn, execSync, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// PLATFORM Phase 4 acceptance — session + manual tools:
//   · tarot-draw: real-random draws stored as dated readings, optional
//     session attach, NEVER cache-deduped (events, not derivations)
//   · lookup-console: ad-hoc provider queries; save-to-client persists a
//     Reading deduped by inputsHash
//   · gating: tenants without tool modules (Valentina) get 404s and no
//     settings link — her chrome untouched
//   · neutral platform copy audit (Rule 0.4/0.5) across module surfaces
// Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/platform/phase4-verify.ts

const APP_PORT = 3120;
const MOCK_PORT = 3135;
const BASE = `http://localhost:${APP_PORT}`;
const DEMO_HOST = "p4.platform.test";
const TENANT_ID = "tnt_p4_demo_000000001";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

const seen = { calls: 0 };
function mockAstro(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.calls++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ positions: [{ point: "Sun", sign: "Leo", degree: 12.3 }] }));
    });
  }).listen(MOCK_PORT);
}

async function cleanup() {
  await prisma.reading.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.appointment.deleteMany({ where: { client: { tenantId: TENANT_ID } } }).catch(() => {});
  await prisma.schedulingConfig.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.consentGrant.deleteMany({ where: { user: { tenantId: TENANT_ID } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } }).catch(() => {});
}

async function signIn(email: string, host: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => {
    for (const c of sc) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": host } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "x-forwarded-host": host, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
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
    data: { id: TENANT_ID, slug: "p4", displayName: "P4 Demo", status: "DEMO", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
  });
  await prisma.tenantModule.createMany({
    data: [
      { tenantId: TENANT_ID, moduleKey: "tarot-draw", enabled: true, position: 1, settings: { displayLabel: "Evening Draw" } },
      { tenantId: TENANT_ID, moduleKey: "lookup-console", enabled: true, position: 2, settings: {} },
    ],
  });
  const pract = await prisma.user.create({
    data: { email: "pract@p4.fixture.test", name: "Demi Tools", role: "PRACTITIONER", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  const client = await prisma.user.create({
    data: { email: "client@p4.fixture.test", name: "Sage Probe", role: "CLIENT", active: true, tenantId: TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  const appt = await prisma.appointment.create({
    data: { tenantId: TENANT_ID, practitionerId: pract.id, clientId: client.id, kind: "SESSION", startAt: new Date(), endAt: new Date(Date.now() + 3600_000), bookedBy: "practitioner" },
  });

  const mock = mockAstro();
  console.log(`~ mock provider on :${MOCK_PORT}; starting built app on :${APP_PORT}`);
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

    // 1 — the draw engine: shape, uniqueness, storage as dated readings
    const { drawCards, DECK, SPREADS } = await import("../../lib/tools/tarot");
    const { recordDraw } = await import("../../lib/tools/draw-service");
    check("deck holds 78 unique cards", DECK.length === 78 && new Set(DECK).size === 78);
    const d = drawCards("three-card");
    check("three-card draw: 3 distinct cards, positioned", d.cards.length === 3 && new Set(d.cards.map((c) => c.card)).size === 3 && d.cards[0].position === SPREADS["three-card"].positions[0]);

    const r1 = await recordDraw({ tenantId: TENANT_ID, clientId: client.id, spread: "single", sessionId: appt.id });
    const r2 = await recordDraw({ tenantId: TENANT_ID, clientId: client.id, spread: "single" });
    check("draws stored as dated readings", r1.ok && r2.ok && (await prisma.reading.count({ where: { clientId: client.id, kind: "tarot-draw" } })) === 2);
    check("draw attached to the session", r1.ok && (await prisma.reading.findFirst({ where: { id: r1.ok ? r1.readingId : "" } }))?.sessionId === appt.id);
    check("module gate refuses draws for unentitled tenants", !(await recordDraw({ tenantId: "tnt_nope", clientId: client.id, spread: "single" })).ok);

    // 2 — draw page renders past draws under the tenant's label
    const cookie = await signIn("pract@p4.fixture.test", DEMO_HOST);
    const drawPage = await fetch(`${BASE}/practitioner/tools/draw?client=${client.id}`, { headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie } });
    const drawHtml = await drawPage.text();
    check("draw page renders under tenant label with past draws", drawHtml.includes("Evening Draw") && drawHtml.includes("attached to a session"));

    // 3 — lookup console: renders provider results; save-to-client dedupes
    const q = "kind=natal-positions&date=1988-11-02&time=07:15&lat=19.43&lng=-99.13";
    const lookupPage = await fetch(`${BASE}/practitioner/tools/lookup?${q}`, { headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie } });
    check("lookup renders provider payload", (await lookupPage.text()).includes("Leo"));
    const { saveLookup, parseLookupParams } = await import("../../lib/tools/lookup");
    const params = parseLookupParams({ kind: "natal-positions", date: "1988-11-02", time: "07:15", lat: "19.43", lng: "-99.13" })!;
    const callsBefore = seen.calls;
    const s1 = await saveLookup({ tenantId: TENANT_ID, clientId: client.id, params });
    const s2 = await saveLookup({ tenantId: TENANT_ID, clientId: client.id, params });
    check("save-to-client persists one Reading, cache-deduped", s1.ok && s2.ok && s2.ok && s2.cached === true && (await prisma.reading.count({ where: { clientId: client.id, moduleKey: "lookup-console" } })) === 1);
    check("identical saved lookup costs one provider call", seen.calls === callsBefore + 1);

    // 4 — tools hub lists both, gated for unentitled tenants
    const hub = await fetch(`${BASE}/practitioner/tools`, { headers: { "x-forwarded-host": DEMO_HOST, Cookie: cookie } });
    const hubHtml = await hub.text();
    check("tools hub lists both tools", hub.status === 200 && hubHtml.includes("Evening Draw") && hubHtml.includes("Lookup Console"));
    const valCookie = await signIn("valentina@fixture.test", "localhost");
    const valTools = await fetch(`${BASE}/practitioner/tools`, { headers: { Cookie: valCookie } });
    check("Valentina's tenant: tools hub 404s", valTools.status === 404);
    const valSettings = await fetch(`${BASE}/practitioner/settings`, { headers: { Cookie: valCookie } });
    check("Valentina's settings: no tools link", !(await valSettings.text()).includes("Session &amp; research tools"));

    // 5 — neutral platform copy audit (Rule 0.4/0.5): no trademarked
    //     modality terms in registry keys or default labels.
    const { MODULES } = await import("../../lib/modules/registry");
    const banned = /human design|gene keys|spiral dynamics|rider|waite|thoth/i;
    const dirty = Object.values(MODULES).filter((m) => banned.test(m.key) || banned.test(m.defaultLabel));
    check("registry keys + default labels are trademark-neutral", dirty.length === 0, dirty.map((m) => m.key).join(",") || `${Object.keys(MODULES).length} modules clean`);
  } finally {
    server.kill();
    mock.close();
    await cleanup();
    console.log("~ demo rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nPHASE 4 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
