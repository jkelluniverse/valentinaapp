import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.AUDIT_BASE || "http://localhost:3100";
const DATE = process.env.AUDIT_DATE || new Date().toISOString().slice(0, 10);
const OUT = `${process.cwd()}/audit/${DATE}`;
fs.mkdirSync(OUT, { recursive: true });
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const log = [];
const notes = [];

async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    const msg = `${name}: ${String(e).split("\n")[0].slice(0, 180)}`;
    notes.push(msg);
    console.log("  ⚠️ ", msg);
  }
}
async function shot(page, name) {
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p });
  log.push(name);
  console.log("  📸", name);
}
async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
}
async function clickFirst(page, selector, { timeout = 6000 } = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout });
  await el.click();
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function login(ctx, email) {
  const page = await ctx.newPage();
  await go(page, "/login");
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill("audit-pass-1");
  await page.locator("button[type=submit]").click();
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

const browser = await chromium.launch({ executablePath: EXEC });

// ---------- MOBILE 390x844 ----------
const m = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// J1 — onboarding (invite → accept page) + login screen
const inviteToken = fs.existsSync("/tmp/invite.txt") ? fs.readFileSync("/tmp/invite.txt", "utf8").trim() : "";
await step("m-01-invite-accept", async () => {
  const p = await m.newPage();
  await go(p, `/invite/${inviteToken}`);
  await shot(p, "m-01-invite-accept");
  await p.close();
});
await step("m-02-login", async () => {
  const p = await m.newPage();
  await go(p, "/login");
  await shot(p, "m-02-login");
  await p.close();
});

// Practitioner mobile
{
  const p = await login(m, "valentina@example.com");
  await step("m-10-study-today", async () => { await go(p, "/practitioner"); await shot(p, "m-10-study-today"); });
  await step("m-11-roster", async () => { await go(p, "/practitioner/clients"); await shot(p, "m-11-roster"); });
  await step("m-12-inbox", async () => { await go(p, "/practitioner/messages"); await shot(p, "m-12-inbox"); });
  await step("m-13-thread", async () => {
    await go(p, "/practitioner/messages");
    await clickFirst(p, 'a[href*="/practitioner/messages/"]');
    await shot(p, "m-13-thread");
  });
  await step("m-14-thread-focus", async () => {
    await clickFirst(p, "textarea");
    await shot(p, "m-14-thread-focus");
  });
  await step("m-15-portrait", async () => {
    await go(p, "/practitioner/clients");
    await clickFirst(p, 'a[href*="/practitioner/clients/"]');
    await shot(p, "m-15-portrait");
  });
  await step("m-16-portrait-map", async () => {
    await clickFirst(p, 'a:has-text("Map"), button:has-text("Map"), a:has-text("Chart")');
    await p.waitForTimeout(1600);
    await shot(p, "m-16-portrait-map");
  });
  await step("m-17-library", async () => { await go(p, "/practitioner/library"); await shot(p, "m-17-library"); });
  await step("m-18-billing", async () => { await go(p, "/practitioner/billing"); await shot(p, "m-18-billing"); });
  await step("m-19-schedule", async () => { await go(p, "/practitioner/schedule"); await shot(p, "m-19-schedule"); });
  await p.close();
}

// Client mobile (jacob)
{
  const mc = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await login(mc, "jacob@example.com");
  await step("m-20-sanctuary", async () => { await go(p, "/space"); await shot(p, "m-20-sanctuary"); });
  await step("m-21-reflect-arrive", async () => { await go(p, "/space/new"); await shot(p, "m-21-reflect-arrive"); });
  await step("m-22-reflect-write", async () => {
    await clickFirst(p, 'button:has-text("Something stirred me"), button:has-text("stirred"), [role=button]:has-text("stirred")');
    await shot(p, "m-22-reflect-write");
  });
  await step("m-23-client-thread", async () => { await go(p, "/space/messages"); await shot(p, "m-23-client-thread"); });
  await step("m-24-first-map", async () => { await go(p, "/space/first-map"); await p.waitForTimeout(1600); await shot(p, "m-24-first-map"); });
  await step("m-25-path", async () => { await go(p, "/space/courses"); await shot(p, "m-25-path"); });
  await step("m-26-library", async () => { await go(p, "/space/library"); await shot(p, "m-26-library"); });
  await mc.close();
}

// Client mobile (mira — crisis-signal thread, DEEPEN stage)
{
  const mc2 = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await login(mc2, "mira@example.com");
  await step("m-27-mira-space", async () => { await go(p, "/space"); await shot(p, "m-27-mira-space"); });
  await step("m-28-mira-thread", async () => { await go(p, "/space/messages"); await shot(p, "m-28-mira-thread"); });
  await mc2.close();
}

// Practitioner mobile — mira's portrait (crisis handling) + inbox crisis row
{
  const p = await login(m, "valentina@example.com");
  await step("m-29-inbox-crisis", async () => { await go(p, "/practitioner/messages"); await shot(p, "m-29-inbox-crisis"); });
  await p.close();
}

// ---------- DESKTOP 1440x900 ----------
const d = await browser.newContext({ viewport: DESKTOP });
{
  const p = await login(d, "valentina@example.com");
  await step("d-10-study", async () => { await go(p, "/practitioner"); await shot(p, "d-10-study"); });
  await step("d-11-portrait", async () => {
    await go(p, "/practitioner/clients");
    await clickFirst(p, 'a[href*="/practitioner/clients/"]');
    await shot(p, "d-11-portrait");
  });
  await step("d-12-portrait-map", async () => {
    await clickFirst(p, 'a:has-text("Map"), button:has-text("Map"), a:has-text("Chart")');
    await p.waitForTimeout(1800);
    await shot(p, "d-12-portrait-map");
  });
  await step("d-13-inbox", async () => { await go(p, "/practitioner/messages"); await shot(p, "d-13-inbox"); });
  await step("d-14-thread", async () => {
    await go(p, "/practitioner/messages");
    await clickFirst(p, 'a[href*="/practitioner/messages/"]');
    await shot(p, "d-14-thread");
  });
  await step("d-15-library", async () => { await go(p, "/practitioner/library"); await shot(p, "d-15-library"); });
  await p.close();
}
// Desktop client
{
  const dc = await browser.newContext({ viewport: DESKTOP });
  const p = await login(dc, "jacob@example.com");
  await step("d-20-space", async () => { await go(p, "/space"); await shot(p, "d-20-space"); });
  await step("d-21-first-map", async () => { await go(p, "/space/first-map"); await p.waitForTimeout(1600); await shot(p, "d-21-first-map"); });
  await dc.close();
}

// ---------- reduced-motion + 200% zoom resilience ----------
await step("m-30-sanctuary-reduced-motion", async () => {
  const rz = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const p = await login(rz, "jacob@example.com");
  await go(p, "/space");
  await shot(p, "m-30-sanctuary-reduced-motion");
  await rz.close();
});
await step("m-31-inbox-200pct-text", async () => {
  const zoom = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2 });
  const p = await login(zoom, "valentina@example.com");
  await go(p, "/practitioner/messages");
  await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await p.waitForTimeout(400);
  await shot(p, "m-31-inbox-200pct-text");
  await zoom.close();
});

await browser.close();
fs.writeFileSync(`${OUT}/_shots.json`, JSON.stringify(log, null, 2));
fs.writeFileSync(`${OUT}/_notes.json`, JSON.stringify(notes, null, 2));
console.log(`DONE — ${log.length} screenshots, ${notes.length} step warnings`);
