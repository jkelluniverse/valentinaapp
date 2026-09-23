/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn, execSync, type ChildProcess } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";

// C35-FOUNDERS-EVENT — THE VISUAL GATE (rulings 190/191).
//
// WHY THIS EXISTS, stated plainly because it is the lesson: /founders shipped
// with its hero headline at 1.01:1 against its own background — Veritas wine on
// indigo, which is to say invisible — and the textual gate returned 19/19. Every
// assertion it made was true. It asserted that the WORDS were right.
//
// A PAGE WHOSE DELIVERABLE IS VISUAL CANNOT BE VERIFIED BY GREP. Textual checks
// verify CONTENT; they cannot verify APPEARANCE, and passing them proves only
// that the words are correct. The four checks here are the counterpart:
//
//   A. SCREENSHOTS, desktop and mobile, against a committed baseline, so a
//      visual change becomes a diff a human reviews rather than a silent pass.
//   B. COMPUTED CONTRAST — every text node meets WCAG 2.2 AA. A hero nobody can
//      read turns this red.
//   C. PALETTE — rendered colours come from the brief's token set, and the
//      VERITAS WINE/MOCHA VALUES APPEAR ZERO TIMES. This is the check that
//      would have caught the defect, and it is a COUNT: ruling 128's shape
//      applied to colour.
//   D. THE LOGO actually loads, and is the primary lockup rather than the
//      two-panel presentation board (which brand-web's own spec documents as
//      "both in one file" — using it whole is the error).
//
// FALSE POSITIVES ARE A FAILURE MODE TOO. B measures only elements that paint
// their OWN text — an <li> wrapping an <a> inherits a colour it never renders,
// and counting it would cry wolf. A gate that cries wolf gets ignored, and then
// it is worse than no gate.

const PORT = 3148;
const BASE = `http://127.0.0.1:${PORT}`;
const HOST = "psychefolio.test";
const EXE = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const SHOTS = join(process.cwd(), "docs/baseline/founders");

const results: { name: string; pass: boolean; note?: string }[] = [];
const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// ---- the brief's required palette, verbatim (§3) ----
const TOKENS: Record<string, string> = {
  indigo: "#2E2749", ink: "#141A2E", gold: "#D8A441", goldSoft: "#E8B85C",
  sage: "#7FA99B", cream: "#FAF0EF", ivory: "#F5F0E6", slate: "#5A5B66",
  card: "#FFFFFF", text: "#2A2733", muted: "#8A8597",
};
// ---- Veritas colours the brief's avoid list names. MUST BE ZERO. ----
const FORBIDDEN: Record<string, [number, number, number]> = {
  "wine": [88, 12, 34], "wine-dark": [87, 3, 33], "mocha": [183, 145, 117],
};

const hexToRgb = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const parse = (s: string): [number, number, number] =>
  ((s.match(/[\d.]+/g) || []).slice(0, 3).map(Number) as [number, number, number]);
function lum([r, g, b]: [number, number, number]): number {
  const f = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
function ratio(fg: string, bg: string): number {
  const a = lum(parse(fg)), b = lum(parse(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
const near = (c: [number, number, number], t: [number, number, number], tol = 6) =>
  Math.abs(c[0] - t[0]) <= tol && Math.abs(c[1] - t[1]) <= tol && Math.abs(c[2] - t[2]) <= tol;

type Node = { tag: string; text: string; color: string; bg: string; size: string; weight: string; family: string };

async function main() {
  log(`# C35 VISUAL verify — ${new Date().toISOString()}`);
  const capture = process.argv.includes("--capture");

  // A PREVIOUS RUN'S ORPHAN ON THIS PORT WOULD SERVE A STALE BUILD and the gate
  // would measure the wrong page while reporting confidently — which is exactly
  // what happened twice while building this gate.
  //
  // KILL BY PORT, NOT BY COMMAND LINE. `next start` spawns a child that renames
  // itself to `next-server`, so `pkill -f "next start -p <port>"` matches the
  // parent and leaves the process that actually holds the socket. The port is
  // the thing that matters, so the port is what gets cleared.
  try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* nothing bound */ }
  await new Promise((r) => setTimeout(r, 1500));

  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT), PLATFORM_DOMAIN: HOST, AUTH_SECRET: process.env.AUTH_SECRET || "gate-secret" },
    stdio: "ignore",
  });
  const browser = await chromium.launch({ executablePath: EXE });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 }, reducedMotion: "reduce",
      extraHTTPHeaders: { "x-forwarded-host": HOST },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });

    // The evaluate body is a STRING on purpose: tsx's transform injects __name
    // helpers into named functions, and those do not exist in the browser —
    // `ReferenceError: __name is not defined` is the first thing this gate hit.
    const data = (await page.evaluate(`(() => {
      var bgOf = function (el) {
        var n = el;
        while (n) { var c = getComputedStyle(n).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c; n = n.parentElement; }
        return "rgb(255, 255, 255)";
      };
      var out = [];
      var all = document.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var own = false, kids = el.childNodes;
        for (var j = 0; j < kids.length; j++) if (kids[j].nodeType === 3 && (kids[j].textContent || "").trim().length > 2) own = true;
        if (!own) continue;
        var cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        var txt = "";
        for (var k = 0; k < kids.length; k++) if (kids[k].nodeType === 3) txt += " " + kids[k].textContent;
        out.push({ tag: el.tagName, text: txt.trim().slice(0, 40), color: cs.color, bg: bgOf(el), size: cs.fontSize, weight: cs.fontWeight, family: cs.fontFamily.split(",")[0].replace(/["']/g, "") });
      }
      var img = document.querySelector('img[alt="Psychefolio"]');
      return { nodes: out, logo: img ? { src: img.getAttribute("src"), natW: img.naturalWidth, natH: img.naturalHeight, w: img.clientWidth, h: img.clientHeight } : null };
    })()`)) as { nodes: Node[]; logo: { src: string | null; natW: number; natH: number; w: number; h: number } | null };

    // ================= THE GATE'S OWN POSITIVE CONTROL =================
    // RULING 110, TURNED ON THE INSTRUMENT. An earlier run of this very gate
    // reported "every text node meets AA (3 nodes measured)" — a PASS, on an
    // error page, because a stale server was answering. Three nodes trivially
    // satisfy a contrast rule. AN ASSERTION OVER AN EMPTY SET IS NOT EVIDENCE,
    // so the gate must first prove it measured the real page.
    log(`\n## 0 — did this gate measure the real page?`);
    check("the page rendered (≥60 text-painting nodes; an error page has a handful)",
      data.nodes.length >= 60, `${data.nodes.length} nodes`);
    check("the hero headline is present", data.nodes.some((n) => /Help shape the operating system/.test(n.text)));
    if (data.nodes.length < 60) {
      log("\nABORTING: the gate did not measure the founding page. Everything below would be vacuous.");
      const failedEarly = results.filter((r) => !r.pass);
      log(`\n${failedEarly.length} CHECK(S) FAILED — ${results.length - failedEarly.length}/${results.length}`);
      mkdirSync("audits/founders", { recursive: true });
      writeFileSync("audits/founders/VISUAL-LOG.md", report.join("\n") + "\n");
      process.exit(1);
    }

    // ================= B — CONTRAST =================
    log(`\n## B — computed contrast, WCAG 2.2 AA`);
    const fails: string[] = [];
    for (const n of data.nodes) {
      const px = parseFloat(n.size);
      const large = px >= 24 || (px >= 18.66 && Number(n.weight) >= 700);
      const need = large ? 3.0 : 4.5;
      const r = ratio(n.color, n.bg);
      if (r < need) fails.push(`${r}:1<${need} ${n.tag}@${n.size} ${n.color}/${n.bg} "${n.text}"`);
    }
    check(`every text node meets AA (${data.nodes.length} text-painting nodes measured)`, fails.length === 0,
      fails.length ? fails.slice(0, 6).join(" · ") + (fails.length > 6 ? ` · +${fails.length - 6} more` : "") : "all pass");

    // ================= C — PALETTE =================
    log(`\n## C — palette: the brief's tokens only, Veritas ZERO`);
    const allColors = new Set<string>();
    for (const n of data.nodes) { allColors.add(n.color); allColors.add(n.bg); }
    const veritas: string[] = [];
    for (const c of allColors) {
      const rgb = parse(c);
      for (const [name, t] of Object.entries(FORBIDDEN)) if (near(rgb, t)) veritas.push(`${name} ${c}`);
    }
    check("VERITAS wine/mocha appear ZERO times in rendered colour", veritas.length === 0, veritas.join(" · ") || "0 occurrences");

    const tokenRgb = Object.values(TOKENS).map(hexToRgb);
    const offPalette = [...allColors].filter((c) => {
      const rgb = parse(c);
      if (/rgba/.test(c) && /, 0?\.\d+\)/.test(c)) return false; // a token at reduced alpha is still the token
      return !tokenRgb.some((t) => near(rgb, t, 8));
    });
    check("every rendered colour traces to the brief's required palette", offPalette.length === 0, offPalette.join(" · ") || `${allColors.size} distinct, all on-palette`);

    // ================= D — THE LOGO =================
    log(`\n## D — the lockup`);
    check("the lockup loads (not a 404)", Boolean(data.logo) && (data.logo!.natW > 0), data.logo ? `natural ${data.logo.natW}×${data.logo.natH}` : "NO <img alt=Psychefolio>");
    check("it is the PRIMARY lockup, not the two-panel presentation board",
      Boolean(data.logo?.src?.includes("lockup-primary")),
      `src=${data.logo?.src}`);
    check("it is the REVERSED colourway on the dark nav", Boolean(data.logo?.src?.includes("reversed")), `src=${data.logo?.src}`);
    // Rendered large enough to read: the board failed at 53×30.
    check("rendered at a legible size (≥120px wide)", (data.logo?.w ?? 0) >= 120, `${data.logo?.w}×${data.logo?.h}`);

    // ================= A — SCREENSHOTS =================
    log(`\n## A — screenshot baseline (ruling 11)`);
    mkdirSync(SHOTS, { recursive: true });
    const views: [string, number, number][] = [["desktop", 1440, 900], ["mobile", 390, 844]];
    for (const [name, w, h] of views) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const buf = await page.screenshot({ fullPage: true });
      const file = join(SHOTS, `${name}.png`);
      if (capture || !existsSync(file)) {
        writeFileSync(file, buf);
        check(`${name} baseline ${capture ? "CAPTURED" : "created (first run)"}`, true, `${buf.length} bytes`);
      } else {
        const prev = readFileSync(file);
        const same = prev.equals(buf);
        if (!same) writeFileSync(join(SHOTS, `${name}.current.png`), buf);
        check(`${name} matches the committed baseline`, same,
          same ? `${buf.length} bytes` : `DIFFERS — ${prev.length} → ${buf.length} bytes; wrote ${name}.current.png for a human to compare`);
      }
    }
  } finally {
    try { (await browser.close()); } catch { /* */ }
    try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  }

  const failed = results.filter((r) => !r.pass);
  log(`\n${failed.length === 0 ? `VISUAL VERIFY PASS — ${results.length}/${results.length}` : `${failed.length} CHECK(S) FAILED — ${results.length - failed.length}/${results.length}`}`);
  mkdirSync("audits/founders", { recursive: true });
  writeFileSync("audits/founders/VISUAL-LOG.md", report.join("\n") + "\n");
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
