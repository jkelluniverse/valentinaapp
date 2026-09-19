// THE PLATFORM HOST'S FRONT DOORS — signup and /join, end to end over HTTP.
//
// WHY THIS GATE EXISTS, and it is the durable half of a live outage. P3.3 made
// an unresolvable host refuse every tenant-scoped write. The platform host
// resolves to no practice BY DESIGN, so its two front doors broke: signup
// failed outright, and /join wrote the lead and then showed the visitor an
// error. The sweep was 40/40 through all of it, because NO GATE HAD EVER
// PERFORMED A WRITE ON THE PLATFORM HOST — every write-exercising gate ran on
// localhost or on a practice subdomain, hosts that resolve to somebody. Before
// P3.3 that gap was invisible, because the fallback guaranteed every host
// resolved to somebody. The missing coverage was the defect; the code was the
// symptom. This gate is that coverage.
//
// WHY IT IS AN HTTP GATE AND NOT A UNIT TEST. The failure lived in the seam
// between the request's host and the tenant resolved from it. A function
// called directly has no such seam, and neither does a gate on localhost.
//
// The transport boundary is RESEND_API_URL pointed at a local sink, which
// records the Authorization header as well as the body — the credential is
// half of the identity claim and the only way to tell the two Resend ACCOUNTS
// apart (C27: psychefolio.com's mail lives in a different account).
//
// Self-cleaning: one throwaway tenant per run, removed first and last.
//   DATABASE_URL=...scratch npx tsx audits/platform-frontdoor-verify.ts
import { spawn, execSync, type ChildProcess } from "child_process";
import { openSync, readFileSync } from "fs";
import { createServer, type Server } from "http";
import { chromium, type Browser } from "playwright";
import { rawPrisma as prisma } from "../lib/prisma-internal";
import { seedLocalDomains } from "./_fixtures/local-domains";
import { DEFAULT_TENANT_ID } from "../lib/tenancy/scope";

const APP_PORT = 3184;
const SINK_PORT = 3185;
// THE PLATFORM HOST IS A REAL HOST HERE, NOT A SPOOFED HEADER, and that is
// forced rather than stylistic: Next REFUSES a server action whose Origin and
// x-forwarded-host disagree, so the first version of this gate — which set
// x-forwarded-host: psx.test on a browser sitting at localhost — had its signup
// POST silently dropped and landed back on /signup with no query at all. It
// looked exactly like a mail failure and was not one. `*.localhost` resolves to
// loopback per RFC 6761, so the browser really is ON the platform host and the
// two headers agree by construction.
const PLATFORM_DOMAIN = "psx.localhost";
const BASE = `http://${PLATFORM_DOMAIN}:${APP_PORT}`;
const LOOPBACK = `http://localhost:${APP_PORT}`;
const SLUG = "p4probe";
const PORTAL_HOST = `${SLUG}.${PLATFORM_DOMAIN}`;
const PROBE_EMAIL = "p4-probe@fixture.test";
const JOIN_EMAIL = "p4-join-probe@fixture.test";
const TENANT_JOIN_EMAIL = "p4-tenant-join-probe@fixture.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

const PLATFORM_FROM = 'Psychefolio <notifications@psx.test>';
const PLATFORM_REPLY = "jacob@psx.test";
const PLATFORM_KEY = "p4-platform-account-key";
const PRACTICE_KEY = "p4-practice-account-key";
const HER_FROM = "Valentina Vélez <hello@valentinavelez.test>";

type Sent = { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
const sent: Sent[] = [];

const report: string[] = [];
let failed = 0;
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

function startSink(): Server {
  const s = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { sent.push({ headers: req.headers, body: JSON.parse(body) }); } catch { /* non-JSON */ }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: `sink-${sent.length}` }));
    });
  });
  s.listen(SINK_PORT);
  return s;
}

async function cleanup(): Promise<void> {
  const t = await prisma.tenant.findFirst({ where: { slug: SLUG }, select: { id: true } });
  if (t) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenantDomain.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
  }
  // The audit rows go first: they reference the prospects by actorId, and this
  // gate must leave the invariant audit clean either way.
  const stale = await prisma.practitionerProspect.findMany({
    where: { email: { in: [PROBE_EMAIL, JOIN_EMAIL, TENANT_JOIN_EMAIL] } },
    select: { id: true },
  });
  if (stale.length) {
    await prisma.auditEvent
      .deleteMany({ where: { action: "prospect-capture", actorId: { in: stale.map((r) => r.id) } } })
      .catch(() => {});
  }
  await prisma.practitionerProspect.deleteMany({ where: { email: { in: [PROBE_EMAIL, JOIN_EMAIL, TENANT_JOIN_EMAIL] } } }).catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await seedLocalDomains();
  await cleanup();

  log(`# PLATFORM FRONT-DOOR verify — ${new Date().toISOString()}`);
  const sink = startSink();
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "p4-probe-secret",
    PORT: String(APP_PORT),
    AUTH_TRUST_HOST: "true",
    PLATFORM_DOMAIN,
    RESEND_API_URL: `http://localhost:${SINK_PORT}/emails`,
    // The PLATFORM Resend account.
    PLATFORM_RESEND_API_KEY: PLATFORM_KEY,
    PLATFORM_FROM_EMAIL: PLATFORM_FROM,
    PLATFORM_REPLY_TO: PLATFORM_REPLY,
    PLATFORM_LEGAL_ENTITY: "Psychefolio LLC",
    PLATFORM_POSTAL_ADDRESS: "1 Probe Street, Probe City, TX 00000",
    // HER account — the positive control. A platform send must never carry it.
    RESEND_API_KEY: PRACTICE_KEY,
    NOTIFY_FROM_EMAIL: HER_FROM,
  };
  // The server's own words, kept: a red here that cannot say WHY is a gate that
  // costs more than it earns. Quoted into the report on failure.
  const SERVER_LOG = "/tmp/p4-platform-mail-server.log";
  const fd = openSync(SERVER_LOG, "w");
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: ["ignore", fd, fd] });
  let browser: Browser | null = null;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${LOOPBACK}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    browser = await chromium.launch({ executablePath: EXEC });

    // ---- the signup, ON THE PLATFORM HOST ----
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "x-forwarded-for": "203.0.113.44" },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
    check("the signup screen renders on the PLATFORM host", (await page.title()).includes("Psychefolio") || (await page.content()).includes("practice portal"), await page.title());
    await page.waitForTimeout(1800); // the action's time trap
    await page.fill('input[name="name"]', "P4 Probe");
    await page.fill('input[name="practiceName"]', "P4 Probe Practice");
    await page.fill('input[name="email"]', PROBE_EMAIL);
    await page.fill('input[name="password"]', "probe-password-1234");
    await page.fill('input[name="slug"]', SLUG);
    // Submit the way audits/signup/verify.ts does — click, then wait for the
    // action's redirect to land. Promise.all with networkidle resolves against
    // an already-idle page and lets the assertion run before the POST does.
    await page.click('button[type="submit"]');
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500); // the send is awaited inside the action; give the sink room

    const landed = page.url();
    const tenant = await prisma.tenant.findFirst({ where: { slug: SLUG }, select: { id: true, displayName: true } });
    // The landing URL is quoted either way: a failed signup redirects back with
    // ?error=, and without that in the note a red here says nothing about WHY.
    check(
      "SIGNUP COMPLETES on the platform host — the tenant is minted and the browser lands on /signup/welcome",
      Boolean(tenant),
      `${tenant?.id ?? "NO TENANT"} · landed=${landed.replace(BASE, "")}`,
    );

    // ---- C27's invariant, which must hold on this host forever ----
    // A signup here produces no practice to send AS. C27's rule is that such a
    // send is SKIPPED, never borrowed: "a practice that cannot send as itself
    // sends as no one". The permanent assertion is therefore not "an email
    // arrived" but "nothing went out wearing somebody else's identity".
    const borrowed = sent.filter((m) => String(m.headers["authorization"] ?? "") === `Bearer ${PRACTICE_KEY}`);
    check(
      "no mail left this host under a BORROWED identity (C27: sends as no one, never as someone else)",
      borrowed.length === 0,
      borrowed.length ? `${borrowed.length} message(s) carried the practice account's key` : "none",
    );
    const welcome = sent.find((m) => String(m.body.to) === PROBE_EMAIL);
    // REPORTED, NOT ASSERTED — this is P4's job and saying so here keeps the
    // gate honest rather than soft. Today the welcome email is absent because
    // no caller passes platformIdentity(), so notify.ts skips the send. P4
    // item 1 routes platform paths through the platform identity, and the
    // checks that then belong here are: the platform Resend account's key, a
    // display-name envelope (ruling 94), the platform reply-to, no postal
    // address on a transactional envelope (ruling 96), and a button pointing
    // at the NEW TENANT'S portal (${PORTAL_HOST}) rather than the signup host.
    log(
      `  · welcome email: ${welcome ? "SENT" : "absent"} — ${sent.length} message(s) reached the sink. ` +
        `Absent is correct TODAY (no platform identity is passed, so notify.ts skips rather than borrows); P4 item 1 makes it present.`,
    );
    // ---- the OTHER platform front door, on the same host ----
    // /join is the founding-partner capture. It writes a platform-level
    // PractitionerProspect plus an AuditEvent, and AuditEvent is a SCOPED model
    // — so it depends on the request's tenant exactly as provisioning does.
    const jctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "x-forwarded-for": "203.0.113.45" },
    });
    const jpage = await jctx.newPage();
    await jpage.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await jpage.waitForTimeout(1800);
    await jpage.fill('input[name="name"]', "P4 Join Probe");
    await jpage.fill('input[name="email"]', JOIN_EMAIL);
    await jpage.click('button[type="submit"]');
    await jpage.waitForLoadState("domcontentloaded");
    await jpage.waitForTimeout(1200);
    const joinLanded = jpage.url();
    const prospect = await prisma.practitionerProspect.findUnique({ where: { email: JOIN_EMAIL } });
    // BOTH halves, because the first version of this check passed while the
    // door was half broken: the prospect row WAS written and the visitor was
    // then shown an error, because the AuditEvent that follows it is a SCOPED
    // write. A lead captured behind an error screen is a lead the sender
    // believes they did not send.
    check(
      "/join on the PLATFORM host captures the prospect",
      Boolean(prospect),
      prospect ? prospect.id : "NO PROSPECT",
    );
    check(
      "...and the visitor is NOT told it failed",
      !joinLanded.includes("error="),
      `landed=${joinLanded.replace(BASE, "")}`,
    );
    await jctx.close();

    // ---- THE OTHER HALF OF THE ATTRIBUTION CLAIM ----
    // Ruling 133 condition 1 says the tracked constant is reachable ONLY on the
    // platform host. That is a claim about a branch not taken, so it needs its
    // positive control (ruling 110): the SAME capture path, on a host that DOES
    // resolve, must attribute to that practice and not to the constant. The
    // tenant minted a moment ago is used, because it is a non-default practice
    // whose id cannot be confused with DEFAULT_TENANT_ID.
    //
    // Submitted as a plain no-JS form POST rather than through the browser,
    // which is what this form is built for ("MINIMAL JAVASCRIPT ON PURPOSE" —
    // it must submit on a saturated conference network before any bundle
    // arrives). It also keeps the check independent of the browser entirely.
    // Connect to LOOPBACK but present the practice's host in both headers.
    // Node's fetch does not apply the RFC 6761 `*.localhost` rule the browser
    // does, so `p4probe.psx.localhost` does not resolve here — and spoofing
    // x-forwarded-host ALONE would trip the same Next server-action Origin
    // check documented at the top of this file. Setting Origin to match is what
    // makes this a legitimate request rather than a rejected one.
    const tenantHost = `http://${SLUG}.${PLATFORM_DOMAIN}:${APP_PORT}`;
    const tenantHdrs = { Origin: tenantHost, Referer: `${tenantHost}/join`, "x-forwarded-host": `${SLUG}.${PLATFORM_DOMAIN}:${APP_PORT}` };  // the PORT matters: Next compares Origin to the forwarded host verbatim
    const formHtml = await (await fetch(`${LOOPBACK}/join`, { headers: tenantHdrs })).text();
    const actionId = formHtml.match(/name="(\$ACTION_ID_[a-f0-9]+)"/)?.[1] ?? "";
    const renderedAt = formHtml.match(/name="t" value="(\d+)"/)?.[1] ?? "0";
    const form = new FormData();
    form.set(actionId, "");
    form.set("lang", "en");
    form.set("ref", "");
    form.set("src", "web");
    form.set("t", renderedAt);
    form.set("company", "");
    form.set("name", "P4 Tenant Attribution Probe");
    form.set("email", TENANT_JOIN_EMAIL);
    await new Promise((r) => setTimeout(r, 1700)); // the action's time trap
    const tRes = await fetch(`${LOOPBACK}/join`, {
      method: "POST",
      body: form,
      redirect: "manual",
      headers: tenantHdrs,
    });
    const tenantProspect = await prisma.practitionerProspect.findUnique({ where: { email: TENANT_JOIN_EMAIL } });
    check(
      "a PRACTICE's own /join captures too (the positive control for the branch below)",
      Boolean(tenantProspect) && !String(tRes.headers.get("location") ?? "").includes("error="),
      `→ ${tRes.status} ${tRes.headers.get("location") ?? ""}`,
    );
    if (tenantProspect && tenant) {
      const row = await prisma.auditEvent.findFirst({
        where: { action: "prospect-capture", actorId: tenantProspect.id },
        select: { tenantId: true },
      });
      check(
        "...and its audit row is attributed to THAT PRACTICE, never the ruling-133 constant",
        Boolean(row) && row!.tenantId === tenant.id,
        `audit tenantId=${row?.tenantId ?? "NO ROW"} · practice=${tenant.id} · constant=${DEFAULT_TENANT_ID}`,
      );
    }
    await ctx.close();
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    sink.close();
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
    await cleanup();
    console.log("~ probe tenant and prospect removed");
    if (failed > 0) {
      const tail = readFileSync(SERVER_LOG, "utf8").split("\n").filter((l) => /signup|tenant-scope|tenancy|notify|Error/i.test(l)).slice(-12);
      if (tail.length) log(`\n### server log (last relevant lines)\n\n\`\`\`\n${tail.join("\n")}\n\`\`\``);
    }
  }

  log(`\n${failed === 0 ? `ALL CHECKS PASS — ${report.filter((r) => r.startsWith("- ")).length}/${report.filter((r) => r.startsWith("- ")).length}` : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("gate error:", e?.stack ?? e); process.exit(1); });
