import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:3100";
const OUT = `${process.cwd()}/audit/2026-07-14-c18`;
fs.mkdirSync(OUT, { recursive: true });
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const b = await chromium.launch({ executablePath: EXEC });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const p = await c.newPage();

// 1. /book shows discovery slots
await p.goto(`${BASE}/book`, { waitUntil: "networkidle" });
await p.screenshot({ path: `${OUT}/m-book-slots.png`, fullPage: true });

// 2. pick first day (already selected), first time
const firstTime = p.locator('button:has-text(":")').first();
await firstTime.click().catch(() => {});
// pick a concrete time button in the time grid
const timeBtns = p.locator("div.grid button");
const n = await timeBtns.count();
console.log("TIME_BUTTONS", n);
if (n > 0) await timeBtns.first().click();
await p.waitForTimeout(400);

// 3. fill the form
await p.locator('input[name="name"]').fill("Ana Prospect");
await p.locator('input[name="email"]').fill("ana.prospect@example.com");
await p.locator('input[name="phone"]').fill("555-0100");
await p.locator('textarea[name="note"]').fill("Feeling stuck and curious about this work.");
await p.screenshot({ path: `${OUT}/m-book-form.png`, fullPage: true });

// 4. wait out the time-trap (>2.5s) then submit
await p.waitForTimeout(3000);
await Promise.all([
  p.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {}),
  p.locator('button:has-text("Confirm my call")').click(),
]);
await p.waitForTimeout(600);
console.log("AFTER_SUBMIT_URL", p.url());
await p.screenshot({ path: `${OUT}/m-book-confirmed.png` });

await b.close();
console.log("DONE");
