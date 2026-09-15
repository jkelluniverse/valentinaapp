import { spawn, execSync, type ChildProcess } from "child_process";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// CLIENT-ONBOARDING Stage-6 acceptance — the quiet discovery layer, in a real
// browser against the BUILT app:
//   · hints: one at a time, shown-once (SEEN on first render), dismiss-forever
//   · getting-started card: auto-detected items check off from real behavior,
//     auto-disappears forever when everything is done
//   · ACTIVATION GATE: a pre-engine client (María) sees none of it
//   · drop-off view renders on the practitioner's intake-preview page
// Throwaway engine-onboarded client; self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/onboarding/discovery-verify.ts

const PORT = 3115;
const BASE = `http://localhost:${PORT}`;
const EMAIL = "discovery-probe@fixture.test";
const TENANT = "tnt_valentina_000000001";
const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } }).catch(() => null);
  if (!u) return;
  await prisma.message.deleteMany({ where: { conversation: { clientId: u.id } } }).catch(() => {});
  await prisma.conversation.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.appointment.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.logEntry.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.recordItem.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.clientHintState.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.activityEvent.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.intakeFlow.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.consentGrant.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

const HOME_HINT_1 = "The star in the middle of the bottom bar";
const HOME_HINT_2 = "lives under the You tab";
const DESIGN_HINT = "grow richer over time";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await cleanup();

  // An engine-onboarded client: COMPLETE INITIAL flow (the activation gate)
  // + one intake.started event so the drop-off view has something to count.
  const client = await prisma.user.create({
    data: { email: EMAIL, name: "Discovery Probe", role: "CLIENT", active: true, tenantId: TENANT, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  await prisma.consentGrant.create({ data: { userId: client.id, version: "2026-07" } });
  await prisma.intakeFlow.create({
    data: { tenantId: TENANT, clientId: client.id, purpose: "INITIAL", status: "COMPLETE", currentStep: "review", schemaHash: "probe", completedAt: new Date() },
  });
  await prisma.activityEvent.create({
    data: { tenantId: TENANT, clientId: client.id, actor: "client", eventKey: "intake.started", meta: {} },
  });

  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(PORT) },
    stdio: "ignore",
  });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const signIn = async (email: string) => {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', "fixture-pass-1");
      await page.click('button[type="submit"]');
      await page.waitForURL(/space|practitioner/, { timeout: 20_000 });
    };

    await signIn(EMAIL);
    const visit = async (path: string) => {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900); // async server components stream in
      return (await page.textContent("body")) ?? "";
    };

    // 1 — home: the card + exactly ONE hint (the first not-dismissed).
    let body = await visit("/space");
    check("getting-started card on home", body.includes("Getting started"));
    check("card starts 0/5", body.includes("0/5"));
    check("first home hint visible", body.includes(HOME_HINT_1));
    check("only ONE hint at a time", !body.includes(HOME_HINT_2));
    const row1 = await prisma.clientHintState.findFirst({ where: { clientId: client.id, hintKey: "home-reflect" } });
    check("hint marked SEEN on first render", row1?.status === "SEEN");

    // 2 — the hint persists across visits until ITS × is tapped.
    body = await visit("/space");
    check("hint persists until dismissed", body.includes(HOME_HINT_1) && !body.includes(HOME_HINT_2));

    // 3 — dismiss (the × inside the blush callout) → never again; the next
    // hint takes the slot on the following view.
    await page.click("div.bg-blush form button");
    await page.waitForTimeout(1500);
    const row2 = await prisma.clientHintState.findFirst({ where: { clientId: client.id, hintKey: "home-reflect" } });
    check("dismiss recorded as DISMISSED", row2?.status === "DISMISSED");
    body = await visit("/space");
    check("dismissed hint never returns", !body.includes(HOME_HINT_1));
    check("next hint takes the slot", body.includes(HOME_HINT_2));
    await page.click("div.bg-blush form button");
    await page.waitForTimeout(1500);
    body = await visit("/space");
    check("no hint left on home after both dismissed", !body.includes(HOME_HINT_1) && !body.includes(HOME_HINT_2));

    // 4 — the design surface has its own hint; visiting checks off the card's
    // "Look at your map" item (auto-detection from real behavior).
    body = await visit("/space/design");
    check("design hint on first design visit", body.includes(DESIGN_HINT));
    body = await visit("/space");
    check("card auto-checked the map item (1/5)", body.includes("1/5"));

    // 5 — complete every item with real rows → card auto-disappears forever.
    const val = await prisma.user.findUnique({ where: { email: "valentina@fixture.test" } });
    if (!val) throw new Error("Fixture practitioner missing — seed the scratch DB first");
    await prisma.logEntry.create({ data: { tenantId: TENANT, clientId: client.id, body: "First reflection (probe)" } });
    await prisma.clientProfile.create({ data: { tenantId: TENANT, userId: client.id, firstMapCompletedAt: new Date() } });
    const convo = await prisma.conversation.create({ data: { tenantId: TENANT, clientId: client.id, practitionerId: val.id } });
    await prisma.message.create({ data: { tenantId: TENANT, conversationId: convo.id, senderId: client.id, senderRole: "CLIENT", body: "hello (probe)" } });
    const now = Date.now();
    await prisma.appointment.create({
      data: { tenantId: TENANT, practitionerId: val.id, clientId: client.id, kind: "SESSION", startAt: new Date(now + 86_400_000), endAt: new Date(now + 86_400_000 + 3_600_000), bookedBy: "client" },
    });
    body = await visit("/space");
    check("card auto-disappears when complete", !body.includes("Getting started"));
    const cardRow = await prisma.clientHintState.findFirst({ where: { clientId: client.id, hintKey: "getting-started" } });
    check("auto-completion recorded DISMISSED (permanent)", cardRow?.status === "DISMISSED");

    // 6 — ACTIVATION GATE: María (pre-engine, no INITIAL flow) sees nothing.
    await ctx.clearCookies();
    await signIn("maria@fixture.test");
    body = await visit("/space");
    check("María sees no card", !body.includes("Getting started"));
    check("María sees no hints", !body.includes(HOME_HINT_1) && !body.includes(HOME_HINT_2));
    check("María gained no hint rows", (await prisma.clientHintState.count({ where: { clientId: (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!.id } })) === 0);

    // 7 — drop-off view on the practitioner's intake-preview page.
    await ctx.clearCookies();
    await signIn("valentina@fixture.test");
    body = await visit("/practitioner/settings/intake-preview");
    check("drop-off section renders", body.includes("Where clients are"));
    check("drop-off counts the started intake", body.includes("Started"));
  } finally {
    await browser.close();
    server.kill();
    await cleanup();
    console.log("~ throwaway client removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nDISCOVERY VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none */ }
  });
