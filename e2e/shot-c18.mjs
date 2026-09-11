import { chromium } from "playwright";
import fs from "fs";
const BASE = process.env.AUDIT_BASE || "http://localhost:3100";
const OUT = `${process.cwd()}/audit/2026-07-14-c18`;
fs.mkdirSync(OUT, { recursive: true });
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const b = await chromium.launch({ executablePath: EXEC });
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${OUT}/d-home-fold.png` });
  await p.screenshot({ path: `${OUT}/d-home-full.png`, fullPage: true });
  console.log("desktop");
  await c.close();
}
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const p = await c.newPage();
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${OUT}/m-home-fold.png` });
  await p.screenshot({ path: `${OUT}/m-home-full.png`, fullPage: true });
  await p.goto(`${BASE}/book`, { waitUntil: "networkidle" });
  await p.screenshot({ path: `${OUT}/m-book.png` });
  console.log("mobile");
  await c.close();
}
await b.close();
console.log("SHOTS DONE");
