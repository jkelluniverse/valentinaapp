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
//   A. SCREENSHOTS at every asserted viewport, against a committed baseline, so
//      a visual change becomes a diff a human reviews rather than a silent pass.
//
// RULING 206/207 — THE SECOND FAILURE OF THIS PAGE WAS A FAILURE OF THIS GATE,
// AND IT IS THE SAME FAILURE TWICE. The first version measured contrast,
// palette and the lockup at 1440x900 ONLY. It did take a 390x844 screenshot —
// but as a PICTURE BASELINE captured after the measurements, and a baseline
// fails only when it CHANGES. So it photographed a layout that had never
// collapsed to one column and committed that photograph as correct. A picture
// of a bug, compared against a picture of the same bug, passes forever.
//
// The measurements now run AT EVERY VIEWPORT, MOBILE FIRST, because the first
// traffic to this page is a printed QR code handed to practitioners at a
// training: the phone is the primary view, not a variant of it.
//
// RULING 208 — THIS GATE NAMES ITS SCOPE IN ITS OWN REPORT. A green must say
// what it covered. See the SCOPE line printed at the top of every run.
//
// RULING 214 — THE GENERAL FORM, WHICH OUTLIVES THIS PAGE:
//
//     A BASELINE PROVES STABILITY, NEVER CORRECTNESS.
//
// A baseline captures whatever state exists when it is captured. One taken
// before anyone looked is a record that nothing changed — not evidence that
// anything was ever right. This gate's mobile screenshot was exactly that: a
// faithful photograph of a layout nobody had checked, which then guarded that
// layout against improvement rather than against regression.
//
// So a baseline is only as good as the review that preceded its capture, and
// the baselines beside this file were captured AFTER the measurements above
// went green and after a human read the page. Recapture with --capture only
// when the change is intended and reviewed; never to make a red gate quiet.
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
// LIMITATION, RECORDED PER RULING 109 — THIS GATE MEASURES A LOCAL BUILD, NOT
// PRODUCTION. Chromium's bundled shell does not trust the agent proxy's CA, and
// disabling TLS verification to screenshot the live site is not an option, so
// /founders' appearance ON PRODUCTION is verified by MARKUP COMPARISON only.
// Ruling 191 exists precisely because markup is not appearance, so the honest
// statement is: this gate proves the page renders correctly FROM THIS BUILD, and
// a human eye on the live URL is still the only proof of the deployed pixels.
// A second limit found the hard way (see the deploy that carried this gate): a
// gate cannot tell you the DEPLOY that shipped it failed. Deploy status is its
// own check — ruling 48.
//
// RULING 205's amendment to ruling 109 — a documented limitation must carry
// what would CLOSE it and a tracking item, or it is a note rather than a plan:
//   · Production pixels: closed by a human eye on the live URL, or by trusting
//     the proxy CA in the browser bundle. TRACKING: the /founders screenshot
//     loop with Jacob, standing until a CA fix exists.
//   · Viewport coverage: closed by asserting every viewport in VIEWPORTS below.
//     Adding a viewport to that list is the whole of the work; there is no
//     second place to edit. TRACKING: none needed — the list IS the scope.
//   · What no viewport sweep can see: a real device's font stack, a notch, a
//     browser chrome inset, or a touch interaction. TRACKING: device review
//     stays a human step.
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

type Node = {
  tag: string; text: string; color: string; bg: string; size: string; weight: string; family: string;
  x: number; y: number; w: number; h: number; scrollW: number; cls: string;
};
type Shot = {
  nodes: Node[];
  logo: { src: string | null; natW: number; natH: number; w: number; h: number } | null;
  docScrollW: number; innerW: number;
  overflowers: { tag: string; cls: string; right: number; text: string }[];
  sideBySide: { a: string; b: string; y: number }[];
  priceCard: { w: number; x: number } | null;
  collapsed: { tag: string; cls: string; text: string }[];
  contentInset: number;
  tapTargets: { text: string; h: number }[];
  ctaBeforeCard: boolean | null;
  priceFigures: Record<string, number>;
};

// RULING 207 — MOBILE FIRST, because that is the order the traffic arrives in.
// A printed QR code at a training means the phone is the FIRST view of this
// page, so it is the first thing this gate asserts. Adding a viewport here is
// the entire cost of widening the gate's scope.
const VIEWPORTS: { name: string; w: number; h: number; kind: "mobile" | "tablet" | "desktop" }[] = [
  { name: "mobile-375", w: 375, h: 812, kind: "mobile" },
  { name: "mobile-390", w: 390, h: 844, kind: "mobile" },
  { name: "tablet-768", w: 768, h: 1024, kind: "tablet" },
  { name: "desktop-1440", w: 1440, h: 900, kind: "desktop" },
];

// THE CRUSHED-TEXT THRESHOLD, MEASURED RATHER THAN PICKED.
//
// An absolute pixel floor was the wrong instrument: it flagged "Programs and
// courses" in a 178px box (perfectly readable) and would have missed a long
// string in a 200px one. The property that matters is width RELATIVE TO TEXT
// LENGTH — how much room each character actually gets.
//
// Measured on this page at 390px, every flagged element, sorted:
//
//     1.92 px/char   71px   "Founding pricing from the first month"    BROKEN
//     2.33 px/char   93px   "Recognition as one of the first twenty"   BROKEN
//     2.53 px/char   76px   "Direct product feedback access"           BROKEN
//     2.55 px/char  102px   "Priority participation in early releases" BROKEN
//     ---------------------------------------------------------------- gap
//     7.43 px/char  171px   "standard Practice price"                  fine
//     7.44 px/char  134px   "(c) 2026 Psychefolio"                     fine
//     7.80 px/char  156px   "Founding Partnership" (nav link)          fine
//     8.14 px/char  171px   "One practitioner seat"                    fine
//     8.19 px/char  172px   "See what's included"                      fine
//     8.90 px/char  178px   "Programs and courses"                     fine
//
// Broken text clusters at 1.9-2.6; healthy text at 7.4-8.9. Nothing lands
// between. 5.0 sits in the middle of an empty band three times wide, so the
// threshold is not a judgement call that could drift — it is a gap in the data.
// At a 16px font an average Latin character occupies ~8px, so 5px/char means
// the text is being given under two-thirds of the width it needs to set a line.
const MIN_PX_PER_CHAR = 5;
const LONG_TEXT = 20;

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

    // RULING 208 — the report names its own scope, so a reader knows what a
    // green covers and, just as importantly, what it does not.
    log(`\n**SCOPE.** Host \`${HOST}\`, path \`/founders\`, local production build on :${PORT}.`);
    log(`Viewports asserted (mobile first, ruling 207): ${VIEWPORTS.map((v) => `${v.name} ${v.w}x${v.h}`).join(" · ")}.`);
    log(`NOT covered: production pixels (proxy CA), real devices, touch, and any viewport absent from that list.`);

    const MEASURE = `(() => {
      var bgOf = function (el) {
        var n = el;
        while (n) { var c = getComputedStyle(n).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c; n = n.parentElement; }
        return "rgb(255, 255, 255)";
      };
      var ownText = function (el) {
        var t = "", k = el.childNodes;
        for (var i = 0; i < k.length; i++) if (k[i].nodeType === 3) t += " " + k[i].textContent;
        return t.trim();
      };
      // RENDERED-NESS MUST BE TESTED ON ANCESTORS, NOT THE ELEMENT.
      // getComputedStyle(child-of-display:none) returns the CHILD's own display
      // — "list-item", not "none" — while its rect is 0x0. So a desktop nav link
      // hidden at phone width looks exactly like a collapsed container unless
      // the whole chain is checked. Two drafts of this gate flagged those links.
      var isRendered = function (el) {
        var n = el;
        while (n && n.tagName !== "BODY") {
          var c = getComputedStyle(n);
          if (c.display === "none" || c.visibility === "hidden") return false;
          n = n.parentElement;
        }
        return true;
      };
      // A CLOSED <details> measures zero because it is closed. That is the
      // widget working, not a layout collapse, and the mobile menu on this page
      // is exactly that. Flagging it would be the cry-wolf failure again.
      var inClosedDetails = function (el) {
        var n = el;
        while (n && n.tagName !== "BODY") {
          if (n.tagName === "DETAILS" && !n.open) return true;
          n = n.parentElement;
        }
        return false;
      };
      // Tags whose text is in the DOM but never on the page. Head-only
      // elements are absent deliberately: every walk below starts at
      // document.body, so they are unreachable and naming them would be
      // dead weight — and the gate-hygiene scanner reads that one tag name
      // as a moving git ref (ruling 37), correctly for its own purposes.
      var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
      var vw = window.innerWidth;
      var out = [], overflowers = [], all = document.body.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i], cs = getComputedStyle(el);
        if (cs.opacity === "0" || !isRendered(el) || inClosedDetails(el)) continue;
        var r = el.getBoundingClientRect();
        // ELEMENT-LEVEL OVERFLOW: anything whose right edge is past the viewport.
        // 1px of slack absorbs sub-pixel rounding, not a real overhang.
        if (r.width > 0 && r.right > vw + 1) {
          overflowers.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 40), right: Math.round(r.right), text: ownText(el).slice(0, 30) });
        }
        var txt = ownText(el);
        if (txt.length <= 2) continue;
        out.push({
          tag: el.tagName, text: txt.slice(0, 40), color: cs.color, bg: bgOf(el),
          size: cs.fontSize, weight: cs.fontWeight, family: cs.fontFamily.split(",")[0].replace(/["']/g, ""),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          scrollW: el.scrollWidth, cls: (el.className || "").toString().slice(0, 40)
        });
      }

      // SIDE-BY-SIDE CONTENT, MEASURED STRUCTURALLY RATHER THAN GUESSED AT.
      // An earlier draft asked whether two siblings each carried >=100 chars and
      // sat at the same height. It returned a PASS on the page Jacob
      // photographed, because the squeezed items are each well under 100 chars.
      // A heuristic tuned to the defect I imagined missed the one that existed.
      var sideBySide = [];
      var conts = document.querySelectorAll("div,section,main,ul,ol");
      for (var c = 0; c < conts.length; c++) {
        var el2 = conts[c], cs2 = getComputedStyle(el2);
        if (el2.children.length < 2 || !isRendered(el2)) continue;
        var r0 = el2.getBoundingClientRect();
        if (r0.width < 100) continue;
        var tracks = 0;
        if (cs2.display === "grid" || cs2.display === "inline-grid") {
          var parts = (cs2.gridTemplateColumns || "").split(/\s+/).filter(function (t) { return t && t !== "none" && parseFloat(t) !== 0; });
          tracks = parts.length;
        } else if ((cs2.display === "flex" || cs2.display === "inline-flex") && cs2.flexDirection === "row" && cs2.flexWrap !== "wrap") {
          var bands = {}, kk = el2.children;
          for (var z = 0; z < kk.length; z++) {
            var rz = kk[z].getBoundingClientRect();
            if (rz.width > 0) bands[Math.round(rz.top / 10)] = (bands[Math.round(rz.top / 10)] || 0) + 1;
          }
          for (var key in bands) if (bands[key] > 1) tracks = Math.max(tracks, bands[key]);
        }
        if (tracks > 1) {
          var txt2 = (el2.textContent || "").trim();
          if (txt2.length >= 40) sideBySide.push({ a: cs2.display + " x" + tracks + " w=" + Math.round(r0.width), b: txt2.slice(0, 46), y: Math.round(r0.top) });
        }
      }

      // COLLAPSED CONTAINERS — the actual signature of this page's mobile
      // failure, and the thing two earlier drafts filtered out. A <ul> or <li>
      // with width 0 wrapping real text is a box that lost its width fight with
      // a sibling; the text then overflows it and renders a few characters per
      // line, which is what "the eyebrow runs vertically" looks like when it is
      // measured instead of eyeballed. Never correct, at any viewport.
      var collapsed = [];
      var textEls = document.body.querySelectorAll("*");
      for (var ti = 0; ti < textEls.length; ti++) {
        var te = textEls[ti], tt = ownText(te);
        if (tt.length < 10 || SKIP[te.tagName]) continue;
        if (inClosedDetails(te) || !isRendered(te)) continue;
        var anc = te.parentElement, depth = 0;
        while (anc && depth < 3 && !SKIP[anc.tagName] && anc.tagName !== "BODY") {
          if (anc.getBoundingClientRect().width < 1) {
            collapsed.push({ tag: anc.tagName, cls: (anc.className || "").toString().slice(0, 30), text: tt.slice(0, 34) });
            break;
          }
          anc = anc.parentElement; depth++;
        }
      }

      // THE PRICE CARD: the nearest ancestor of a "$99" text node that paints
      // its own background — i.e. the card, not the span.
      // SKIP UNRENDERED TEXT. Next serialises the RSC flight payload into
      // <script> tags inside <body>, and that payload contains every figure on
      // the page. A tree walker that does not exclude it finds "$99" in a
      // script whose rect is 0x0 at top 0, and then every ordering comparison
      // against it is nonsense. Third time this gate has been fooled by content
      // that exists in the DOM but is not on the page.
      var paints = function (n) {
        var e = n.parentElement;
        return e && !SKIP[e.tagName] && isRendered(e);
      };
      var priceCard = null;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var tn;
      while ((tn = walker.nextNode())) {
        if (!paints(tn)) continue;
        if ((tn.textContent || "").indexOf("$99") !== -1) {
          var n2 = tn.parentElement;
          while (n2) {
            var c2 = getComputedStyle(n2);
            if (c2.backgroundColor && c2.backgroundColor !== "rgba(0, 0, 0, 0)" && n2.getBoundingClientRect().width > 100) {
              var pr = n2.getBoundingClientRect();
              priceCard = { w: Math.round(pr.width), x: Math.round(pr.x) };
              break;
            }
            n2 = n2.parentElement;
          }
          if (priceCard) break;
        }
      }

      // HORIZONTAL PADDING: the smallest left inset among substantial text
      // blocks — the page's effective content gutter.
      var inset = vw;
      for (var q = 0; q < out.length; q++) {
        if (out[q].text.length >= 30 && out[q].w >= 80) inset = Math.min(inset, out[q].x);
      }

      var tapTargets = [];
      var sums = document.querySelectorAll("summary");
      for (var t = 0; t < sums.length; t++) {
        if (!isRendered(sums[t])) continue;
        var rt = sums[t].getBoundingClientRect();
        tapTargets.push({ text: (sums[t].textContent || "").trim().slice(0, 30), h: Math.round(rt.height) });
      }

      // BRIEF 19 — the hero CTA must come BEFORE the price card in visual order.
      var ctaBeforeCard = null;
      var links = document.querySelectorAll('a[href*="apply"]');
      if (links.length && priceCard) {
        var firstCta = links[0].getBoundingClientRect();
        var cardEl = null;
        var w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), t2;
        while ((t2 = w2.nextNode())) { if (paints(t2) && (t2.textContent || "").indexOf("$99") !== -1) { cardEl = t2.parentElement; break; } }
        if (cardEl) ctaBeforeCard = firstCta.top <= cardEl.getBoundingClientRect().top;
      }

      // RULING 202 — price figures are COUNTED, not eyeballed.
      var bodyText = document.body.innerText;
      var figures = {};
      ["$99", "$149", "$500", "$990", "$199", "$1,990", "$499", "$4,990", "$2,500"].forEach(function (f) {
        var m = bodyText.split(f).length - 1;
        if (m > 0) figures[f] = m;
      });

      var img = document.querySelector('img[alt="Psychefolio"]');
      return {
        nodes: out, docScrollW: document.documentElement.scrollWidth, innerW: vw,
        overflowers: overflowers, sideBySide: sideBySide, priceCard: priceCard, collapsed: collapsed,
        contentInset: inset, tapTargets: tapTargets, ctaBeforeCard: ctaBeforeCard, priceFigures: figures,
        logo: img ? { src: img.getAttribute("src"), natW: img.naturalWidth, natH: img.naturalHeight, w: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height) } : null
      };
    })()`;

    // ================= RULING 203 — THE TENANT HOST SEES NOTHING =================
    // A 404 STATUS IS NOT THE ASSERTION. This page was guarded by a notFound()
    // in its layout, which returned 404 correctly while the response still
    // carried the entire founding page in its RSC flight payload — every price
    // figure, the apply CTA, and the tab title. The guard changed the STATUS
    // without stopping the TRANSMISSION (ruling 169's shape).
    //
    // So the assertion is about CONTENT, and the status is only a precondition.
    log(`\n# ruling 203 — a tenant host's /founders`);
    {
      const tenantRes = await fetch(`${BASE}/founders`, { headers: { "x-forwarded-host": "a-practice.test" } });
      const tenantBody = await tenantRes.text();
      const n = (needle: string) => tenantBody.split(needle).length - 1;
      check("a tenant host is refused with 404", tenantRes.status === 404, `HTTP ${tenantRes.status}`);
      const leaks: string[] = [];
      for (const needle of ["$99", "$149", "$500", "founders/apply", "60-day", "Founding Practice", "Solo price"]) {
        const c = n(needle);
        if (c > 0) leaks.push(`${needle} x${c}`);
      }
      check("…and its response carries ZERO founding-page content, not merely a 404 status",
        leaks.length === 0, leaks.length ? leaks.join(" · ") : `${tenantBody.length} bytes, none of the 7 markers present`);

      // POSITIVE CONTROL (ruling 110): the same markers must be PRESENT on the
      // platform host, or "zero found" would prove only that the probe is blind.
      const platRes = await fetch(`${BASE}/founders`, { headers: { "x-forwarded-host": HOST } });
      const platBody = await platRes.text();
      const present = ["$99", "founders/apply", "Founding Practice"].filter((x) => platBody.includes(x));
      check("positive control: the platform host DOES serve that content",
        platRes.status === 200 && present.length === 3, `HTTP ${platRes.status}, ${present.length}/3 markers, ${platBody.length} bytes`);
    }

    mkdirSync(SHOTS, { recursive: true });

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(`${BASE}/founders`, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);
      const d = (await page.evaluate(MEASURE)) as Shot;

      log(`\n# ${vp.name} — ${vp.w}x${vp.h} (${vp.kind})`);

      check(`[${vp.name}] the gate measured the real page (>=60 text nodes)`, d.nodes.length >= 60, `${d.nodes.length} nodes`);
      if (d.nodes.length < 60) { log("ABORTING: the gate did not measure the founding page."); break; }

      check(`[${vp.name}] the document does not scroll horizontally`,
        d.docScrollW <= d.innerW + 1, `scrollWidth ${d.docScrollW} vs viewport ${d.innerW}`);
      check(`[${vp.name}] no element extends past the viewport`,
        d.overflowers.length === 0,
        d.overflowers.length ? d.overflowers.slice(0, 4).map((o) => `${o.tag}.${o.cls}@${o.right}px "${o.text}"`).join(" · ") + (d.overflowers.length > 4 ? ` · +${d.overflowers.length - 4}` : "") : "none");

      check(`[${vp.name}] no text sits inside a container collapsed to zero width`,
        d.collapsed.length === 0,
        d.collapsed.length ? `${d.collapsed.length}: ` + d.collapsed.slice(0, 4).map((c) => `<${c.tag}> "${c.text}"`).join(" · ") : "none");

      const prose = d.nodes.filter((n) => n.text.length >= LONG_TEXT && n.w > 0);
      const crushed = prose.filter((n) => n.w / n.text.length < MIN_PX_PER_CHAR);
      check(`[${vp.name}] no prose is crushed below ${MIN_PX_PER_CHAR}px of width per character`,
        crushed.length === 0,
        crushed.length
          ? crushed.slice(0, 4).map((n) => `${(n.w / n.text.length).toFixed(2)}px/char ${n.w}px "${n.text}"`).join(" · ") + (crushed.length > 4 ? ` · +${crushed.length - 4}` : "")
          : `${prose.length} prose blocks, thinnest ${Math.min(...prose.map((n) => n.w / n.text.length)).toFixed(2)}px/char`);

      const fails: string[] = [];
      for (const n of d.nodes) {
        const px = parseFloat(n.size);
        const large = px >= 24 || (px >= 18.66 && Number(n.weight) >= 700);
        const need = large ? 3.0 : 4.5;
        const r = ratio(n.color, n.bg);
        if (r < need) fails.push(`${r}:1<${need} ${n.tag}@${n.size} "${n.text}"`);
      }
      check(`[${vp.name}] every text node meets AA (${d.nodes.length} measured)`, fails.length === 0,
        fails.length ? fails.slice(0, 4).join(" · ") + (fails.length > 4 ? ` · +${fails.length - 4}` : "") : "all pass");

      const allColors = new Set<string>();
      for (const n of d.nodes) { allColors.add(n.color); allColors.add(n.bg); }
      const veritas: string[] = [];
      for (const c of allColors) { const rgb = parse(c); for (const [name, t] of Object.entries(FORBIDDEN)) if (near(rgb, t)) veritas.push(`${name} ${c}`); }
      check(`[${vp.name}] VERITAS wine/mocha appear ZERO times`, veritas.length === 0, veritas.join(" · ") || "0 occurrences");
      const tokenRgb = Object.values(TOKENS).map(hexToRgb);
      const offPalette = [...allColors].filter((c) => {
        const rgb = parse(c);
        if (/rgba/.test(c) && /, 0?\.\d+\)/.test(c)) return false;
        return !tokenRgb.some((t) => near(rgb, t, 8));
      });
      check(`[${vp.name}] every rendered colour is on-palette`, offPalette.length === 0, offPalette.join(" · ") || `${allColors.size} distinct`);

      check(`[${vp.name}] the lockup loads and is the PRIMARY asset`,
        Boolean(d.logo) && d.logo!.natW > 0 && Boolean(d.logo?.src?.includes("lockup-primary")), `src=${d.logo?.src}`);
      // F1 — an explicit rendered-height floor, so the wordmark cannot silently
      // shrink back to an illegible smudge. Counts, ruling 128.
      // F1 — measured floors, set from the FIXED page rather than guessed:
      // the nav lockup renders 240x101 at desktop and tablet. 88px leaves room
      // for a deliberate tweak but catches a collapse back toward the 63px
      // smudge Jacob could not read. Mobile is lower because the nav compresses.
      const floor = vp.kind === "mobile" ? 56 : 88;
      check(`[${vp.name}] the lockup renders large enough to READ (>=${floor}px tall)`,
        (d.logo?.h ?? 0) >= floor, `${d.logo?.w}x${d.logo?.h}`);

      // RULING 218 (amending 202) — each ratified figure appears AT MOST ONCE
      // per page. The earlier check only asked that no STRAY figure appeared,
      // which a page can satisfy while printing the same $99 four times.
      //
      // TWO DELIBERATE EXCEPTIONS, each named with its second location and its
      // reason. This is not "raise the count until it passes": the allowance is
      // set to the exact number of legitimate, distinct locations, so the
      // duplicate hero CARD that started all this still turns it red ($99 was
      // x4 before F2, and x3 with the price restated in the getting-started
      // list). A third occurrence of either figure fails.
      const ALLOWED: Record<string, { max: number; why: string }> = {
        "$99": { max: 2, why: "the offer card, and the FAQ answer to 'What happens after the first year?' which cannot answer it without naming the rate it changes FROM" },
        "$149": { max: 2, why: "the offer card, and that same FAQ answer, which names the rate it changes TO" },
      };
      const dupes = Object.entries(d.priceFigures).filter(([f, n]) => n > (ALLOWED[f]?.max ?? 1));
      const allowedNote = Object.entries(ALLOWED).map(([f, a]) => `${f} may appear ${a.max}x — ${a.why}`).join(" · ");
      check(`[${vp.name}] every ratified figure appears at most ONCE, or as many times as is justified here`,
        dupes.length === 0,
        dupes.length
          ? dupes.map(([f, n]) => `${f} x${n} (allowed ${ALLOWED[f]?.max ?? 1})`).join(" · ")
          : `${Object.entries(d.priceFigures).map(([f, n]) => `${f}x${n}`).join(" · ")} — exceptions: ${allowedNote}`);

      if (vp.kind === "mobile") {
        check(`[${vp.name}] single-column flow: no content container is still multi-column`,
          d.sideBySide.length === 0,
          d.sideBySide.length ? `${d.sideBySide.length} container(s): ` + d.sideBySide.slice(0, 5).map((x) => `[${x.a}] "${x.b}"`).join(" · ") : "none");
        check(`[${vp.name}] horizontal padding is the brief's 20-24px`,
          d.contentInset >= 20 && d.contentInset <= 24, `${d.contentInset}px`);
        check(`[${vp.name}] the price card uses full width (>= viewport - 2x24px)`,
          (d.priceCard?.w ?? 0) >= vp.w - 48, d.priceCard ? `${d.priceCard.w}px of ${vp.w}` : "no price card found");
        check(`[${vp.name}] the hero CTA appears BEFORE the price card`,
          d.ctaBeforeCard === true, String(d.ctaBeforeCard));
        const small = d.tapTargets.filter((t) => t.h < 44);
        check(`[${vp.name}] FAQ tap targets are >=44px tall`,
          small.length === 0,
          d.tapTargets.length === 0 ? "no <summary> found" : small.length ? small.map((t) => `${t.h}px "${t.text}"`).join(" · ") : `${d.tapTargets.length} targets, all >=44px`);
      }
      if (vp.kind === "tablet") {
        check(`[${vp.name}] the price card is no narrower than the brief's 360px`,
          (d.priceCard?.w ?? 0) >= 360, d.priceCard ? `${d.priceCard.w}px` : "no price card found");
      }

      const buf = await page.screenshot({ fullPage: true });
      const file = join(SHOTS, `${vp.name}.png`);
      if (capture || !existsSync(file)) {
        writeFileSync(file, buf);
        check(`[${vp.name}] baseline ${capture ? "CAPTURED" : "created (first run)"}`, true, `${buf.length} bytes`);
      } else {
        const prev = readFileSync(file);
        const same = prev.equals(buf);
        if (!same) writeFileSync(join(SHOTS, `${vp.name}.current.png`), buf);
        check(`[${vp.name}] matches the committed baseline`, same,
          same ? `${buf.length} bytes` : `DIFFERS — ${prev.length} -> ${buf.length} bytes; wrote ${vp.name}.current.png`);
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
