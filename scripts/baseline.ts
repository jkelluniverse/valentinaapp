import { spawn, execSync, type ChildProcess } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { prisma } from "../lib/prisma";

// PLATFORM Phase 0.1 — the regression baseline. Screenshots of Valentina's key
// screens against the fixture roster, stored in docs/baseline/. Re-run with
// --diff after any strangler step: her portal must be pixel-identical.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx scripts/baseline.ts            # capture
//   DATABASE_URL=...scratch npx tsx scripts/baseline.ts --diff     # compare
//
// Determinism: fixed viewport, reduced motion, same fonts/browser. The compare
// is byte-level with a per-page fallback report so a human can eyeball drift.
//
// RULE: a reseed invalidates the baseline. Reseeded rows get fresh ids, and
// same-timestamp ties (e.g. "Quietly, this week") break by id — so capture a
// new baseline immediately after ANY reseed, then run code slices against
// that fixed dataset. Diffs are only meaningful with the data held still.
// The clock invalidates it too: time-of-day greetings and relative-date copy
// drift across day/part-of-day boundaries — recapture rather than chase them.

const PORT = 3106;
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), "docs/baseline");
const DIFF_OUT = join(process.cwd(), "docs/baseline/.current");

// The screens that define "her portal": practitioner daily drivers + the
// client space + public door. Mobile variants for the two shells.
const SHOTS: { name: string; path: string; as: "her" | "client" | null; mobile?: boolean; simulated?: boolean; dark?: boolean }[] = [
  { name: "login", path: "/login", as: null },
  { name: "practitioner-home", path: "/practitioner", as: "her" },
  { name: "practitioner-clients", path: "/practitioner/clients", as: "her" },
  { name: "portrait-record", path: "PORTRAIT", as: "her" },
  { name: "portrait-billing", path: "PORTRAIT?tab=billing", as: "her" },
  { name: "portrait-map", path: "PORTRAIT?tab=map", as: "her", simulated: true }, // constellation physics — never byte-stable
  { name: "practitioner-billing", path: "/practitioner/billing", as: "her" },
  { name: "practitioner-schedule", path: "/practitioner/schedule", as: "her" },
  { name: "space-home", path: "/space", as: "client" },
  { name: "space-journey", path: "/space/journey", as: "client" },
  { name: "space-design", path: "/space/design", as: "client" },
  { name: "space-settings", path: "/space/settings", as: "client" },
  { name: "space-home-dusk", path: "/space", as: "client", dark: true },
  { name: "practitioner-home-dusk", path: "/practitioner", as: "her", dark: true },
  { name: "space-home-mobile", path: "/space", as: "client", mobile: true },
  { name: "practitioner-home-mobile", path: "/practitioner", as: "her", mobile: true },
];

async function signIn(ctx: BrowserContext, email: string) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "fixture-pass-1");
  await page.click('button[type="submit"]');
  await page.waitForURL(/practitioner|space/, { timeout: 20_000 });
  await page.close();
}

async function main() {
  const diffMode = process.argv.includes("--diff");
  const outDir = diffMode ? DIFF_OUT : OUT;
  mkdirSync(outDir, { recursive: true });

  const users = await prisma.user.count().catch(() => -1);
  if (users <= 0) {
    console.log("~ seeding fixture roster");
    execSync("npx tsx prisma/fixtures/seed-staging.ts", {
      stdio: "inherit",
      env: { ...process.env, SEED_ENV: "staging" },
    });
  }
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;

  try {
    await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    throw new Error(`port ${PORT} already serving — kill the stale server first (pkill -f next-server)`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("already serving")) throw e;
    /* connection refused = port free, good */
  }
  console.log(`~ starting built app on :${PORT}`);
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // The environment pins a shared Chromium; the pinned playwright version's
  // own download isn't present, so point at the shared binary explicitly.
  const browser: Browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  });
  const mk = (mobile: boolean) =>
    browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
      timezoneId: "America/New_York",
      locale: "en-US",
    });

  const contexts: Record<string, { desktop: BrowserContext; mobile: BrowserContext }> = {};
  for (const who of ["her", "client"] as const) {
    const desktop = await mk(false);
    const mobile = await mk(true);
    const email = who === "her" ? "valentina@fixture.test" : "maria@fixture.test";
    await signIn(desktop, email);
    await signIn(mobile, email);
    contexts[who] = { desktop, mobile };
  }
  const anon = { desktop: await mk(false), mobile: await mk(true) };

  let differing = 0;
  for (const shot of SHOTS) {
    const ctxPair = shot.as ? contexts[shot.as] : anon;
    const ctx = shot.mobile ? ctxPair.mobile : ctxPair.desktop;
    const page = await ctx.newPage();
    const path = shot.path.replace("PORTRAIT", `/practitioner/clients/${maria.id}`);
    // domcontentloaded + settle: "networkidle" hangs on pages that poll or make
    // slow third-party calls (billing → Square) — determinism comes from the
    // fixed settle window, not network silence.
    if (shot.dark) {
      // Dusk: the toggle writes data-theme on <html>; simulate the saved choice.
      await page.addInitScript(() => localStorage.setItem("veritas-theme", "dark"));
    }
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2_000);
    const png = await page.screenshot({ fullPage: false });
    writeFileSync(join(outDir, `${shot.name}.png`), png);
    await page.close();

    if (diffMode) {
      const basePath = join(OUT, `${shot.name}.png`);
      if (!existsSync(basePath)) {
        console.log(`- ? ${shot.name} — no baseline`);
        continue;
      }
      const a = readFileSync(basePath);
      const same = a.length === png.length && a.equals(png);
      if (!same && !shot.simulated) differing++;
      if (!same && shot.simulated) {
        console.log(`- ~ ${shot.name} — simulated layout, bytes drift by design (eyeball if suspicious)`);
        continue;
      }
      console.log(`- ${same ? "✓ identical" : "✗ DIFFERS"} ${shot.name}${same ? "" : ` (baseline ${a.length}B vs now ${png.length}B — eyeball docs/baseline/.current/${shot.name}.png)`}`);
    } else {
      console.log(`- captured ${shot.name}`);
    }
  }

  await browser.close();
  server.kill();
  if (diffMode) {
    console.log(differing === 0 ? "\nBASELINE MATCH — her portal is unchanged" : `\n${differing} SCREEN(S) DIFFER — eyeball before proceeding`);
    if (differing > 0) process.exit(1);
  } else {
    console.log(`\nBaseline stored in docs/baseline/ (${SHOTS.length} screens)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    // Belt-and-braces: a crashed run must never leave a stale server behind.
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none left */ }
  });
