import { spawn, execSync, type ChildProcess } from "child_process";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { startFlow } from "../../lib/intake/engine";
import { withTenantScope } from "../../lib/tenancy/tenant-scope";
import { DEFAULT_TENANT_ID } from "../../lib/tenancy/scope";

import { seedLocalDomains } from "../_fixtures/local-domains";
// CLIENT-ONBOARDING Stage-1 UI acceptance — drives the whole intake in a real
// browser against the BUILT app: the routing gate, Welcome, generated steps
// with auto-save, Review, complete → Done, and the post-completion release
// (no more redirect). Throwaway invited client; self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/onboarding/ui-verify.ts

const PORT = 3114;
const BASE = `http://localhost:${PORT}`;
const EMAIL = "onboarding-ui-probe@fixture.test";
const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } }).catch(() => null);
  if (!u) return;
  await prisma.intakeFlow.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.activityEvent.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.lensResult.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.humanDesignChart.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.birthChartCore.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.psycheEdge.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.psycheNode.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.recordingConsent.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.consentGrant.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

async function main() {
  // P3.3 — `localhost` is no longer anybody's host by default. This gate
  // drives the app on a loopback address, so it states the mapping the way
  // production states hers: as a TenantDomain row (audits/_fixtures).
  await seedLocalDomains();
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await cleanup();

  // A new client, consented (so the data-consent gate passes), with a fresh
  // intake flow — exactly the state invite-acceptance produces.
  const client = await prisma.user.create({
    data: { email: EMAIL, name: "UI Probe", role: "CLIENT", active: true, tenantId: DEFAULT_TENANT_ID, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });
  // P5 / RULING 162 — TWO FIXTURE WRITES HERE LANDED UNSTAMPED AND ONLY EVER
  // WORKED BECAUSE TENANT #1 COULD SEE NULL-TENANT ROWS. Both are corrected in
  // SCOPE; not one assertion moved (ruling 157).
  //
  //   1. consentGrant stated no tenantId, so it was written NULL. Invisible
  //      after P5 → the client space reads "never consented".
  //   2. startFlow() writes through the SCOPED client, and this gate calls it
  //      from a Node script — outside any request and outside withTenantScope —
  //      where the scope resolves to null and the write is an unstamped
  //      passthrough. Measured directly, with its own control: the bare call
  //      produced tenantId=null; the same call inside withTenantScope produced
  //      tnt_valentina_000000001.
  //
  // NEITHER IS A PRODUCT DEFECT. startFlow's one production caller is the
  // server action at app/invite/[token]/actions.ts:109, which runs inside a
  // request and stamps correctly. This is the TEST APPARATUS leaning on the
  // privilege, exactly as nested-stamp did — and note that V7's search could
  // not have found it: this gate never mentions scopeFilter or `tenantId: null`.
  // It depended on the equivalence BY BEHAVIOUR, through a lib function.
  //
  // withTenantScope is the same remedy stage1-verify already documents for the
  // same reason (P3.3), which is why that gate stayed green.
  await prisma.consentGrant.create({ data: { tenantId: DEFAULT_TENANT_ID, userId: client.id, version: "2026-07" } });
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await startFlow(client.id);
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

    // Sign in.
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', "fixture-pass-1");
    await page.click('button[type="submit"]');
    await page.waitForURL(/space/, { timeout: 20_000 });

    // 1 — the routing gate sends a flow-holding client to intake.
    await page.goto(`${BASE}/space`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    check("routing gate redirects to /space/intake", page.url().includes("/space/intake"));
    check("Welcome screen shown", (await page.content()).includes("Let&#x27;s begin") || (await page.textContent("body"))!.includes("Let's begin"));

    // 2 — begin → Identity step.
    await page.click("text=Let's begin");
    await page.waitForTimeout(800);
    const body1 = (await page.textContent("body")) ?? "";
    check("Identity step reached", body1.includes("About you") || body1.includes("Full name"));

    // Fill identity, wait for debounced auto-save.
    await page.fill('input[type="text"] >> nth=0', "River Probe");
    await page.waitForTimeout(1200);
    const savedRow = await prisma.intakeAnswer.findFirst({ where: { flow: { clientId: client.id }, fieldKey: "identity.fullName" } });
    check("auto-save persisted the field (with snapshot)", savedRow?.value === "River Probe" && savedRow?.questionTextSnapshot === "Full name");

    // Continue through the remaining steps generically: fill visible text/date
    // inputs, pick scale answers, click Continue until Review.
    let reachedReview = false;
    for (let hop = 0; hop < 6; hop++) {
      await page.click("text=Continue").catch(() => {});
      await page.waitForTimeout(900);
      const b = (await page.textContent("body")) ?? "";
      if (b.includes("Review") && b.includes("Complete my setup")) { reachedReview = true; break; }
      // Fill any empty date/text and choose scale "3" on this step.
      const dateInputs = await page.$$('input[type="date"]');
      for (const di of dateInputs) { await di.fill("1990-05-20").catch(() => {}); }
      const textInputs = await page.$$('input[type="text"]');
      for (const ti of textInputs) { const v = await ti.inputValue(); if (!v) await ti.fill("Austin, Texas, USA").catch(() => {}); }
      const threes = await page.$$('button[aria-pressed]');
      for (const t of threes) { await t.click().catch(() => {}); }
      await page.waitForTimeout(1000);
    }
    check("reached the Review step", reachedReview);

    // 3 — complete.
    await page.click("text=Complete my setup").catch(() => {});
    await page.waitForTimeout(2500);
    check("Done screen shown after completion", (await page.textContent("body"))!.includes("all set") || page.url().includes("done=1"));

    // 4 — completion outcomes.
    const flow = await prisma.intakeFlow.findFirst({ where: { clientId: client.id } });
    check("flow marked COMPLETE", flow?.status === "COMPLETE");
    check("intakeCompletedAt stamped on profile", Boolean((await prisma.clientProfile.findUnique({ where: { userId: client.id } }))?.intakeCompletedAt));
    // fan-out is fired-not-awaited; give it a moment.
    await page.waitForTimeout(2500);
    check("values scorer produced a SPIRAL lens", (await prisma.lensResult.count({ where: { userId: client.id, lens: "SPIRAL" } })) === 1);

    // 5 — post-completion: the gate no longer redirects.
    await page.goto(`${BASE}/space`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    check("after completion the client is NOT redirected to intake", !page.url().includes("/space/intake"));
  } finally {
    await browser.close();
    server.kill();
    await cleanup();
    console.log("~ throwaway client removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nINTAKE UI VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none */ }
  });
