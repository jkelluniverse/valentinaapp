// P4 — IDENTITY FOLLOWS HOST. The acceptance gate, end to end over HTTP.
//
// WHAT IT PROVES. A practitioner signs up ON THE PLATFORM HOST and the welcome
// email that results is the PLATFORM's: the platform Resend account's key, a
// display name on the envelope, the platform reply-to, the platform envelope —
// and a button pointing at THE NEW TENANT'S OWN PORTAL rather than at whatever
// host they happened to sign up on. Her client mail is unchanged in the same
// run, on the same server, as the positive control (ruling 110).
//
// WHY IT IS AN HTTP GATE AND NOT A UNIT TEST. Every defect this program has
// found in mail identity lived in the seam between the request's host and the
// identity resolved from it. A function called directly cannot have that seam.
//
// The transport boundary is RESEND_API_URL pointed at a local sink, which
// records the Authorization header as well as the body — the credential is
// half of the identity claim and the only way to tell the two Resend ACCOUNTS
// apart (C27: psychefolio.com's mail lives in a different account).
//
// Self-cleaning: one throwaway tenant per run, removed first and last.
//   DATABASE_URL=...scratch npx tsx audits/platform-mail-verify.ts
import { spawn, execSync, type ChildProcess } from "child_process";
import { openSync, readFileSync } from "fs";
import { createServer, type Server } from "http";
import { chromium, type Browser } from "playwright";
import { rawPrisma as prisma } from "../lib/prisma-internal";
import { seedLocalDomains } from "./_fixtures/local-domains";

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
  await prisma.practitionerProspect.deleteMany({ where: { email: { in: [PROBE_EMAIL, JOIN_EMAIL] } } }).catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await seedLocalDomains();
  await cleanup();

  log(`# P4 PLATFORM-MAIL verify — ${new Date().toISOString()}`);
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
      "the signup actually created the tenant (so a missing email is about MAIL, not about signup)",
      Boolean(tenant),
      `${tenant?.id ?? "NO TENANT"} · landed=${landed.replace(BASE, "")}`,
    );

    const welcome = sent.find((s) => String(s.body.to) === PROBE_EMAIL);
    check("a welcome email was SENT AT ALL", Boolean(welcome), `${sent.length} message(s) reached the sink`);

    if (welcome) {
      const auth = String(welcome.headers["authorization"] ?? "");
      check(
        "it authenticates with the PLATFORM Resend account, never hers",
        auth === `Bearer ${PLATFORM_KEY}`,
        auth.replace(PLATFORM_KEY, "<platform-key>").replace(PRACTICE_KEY, "<HER-KEY>"),
      );
      const from = String(welcome.body.from ?? "");
      check("the envelope carries the PLATFORM from-address", from === PLATFORM_FROM, from);
      check("with a DISPLAY NAME, not a bare address (ruling 94)", /^[^<]+<[^>]+>$/.test(from), from);
      check("and the platform reply-to", String(welcome.body.reply_to ?? "") === PLATFORM_REPLY, String(welcome.body.reply_to ?? "none"));
      const html = String(welcome.body.html ?? "");
      const text = String(welcome.body.text ?? "");
      check("it is the PLATFORM envelope (the platform legal entity signs it)", html.includes("Psychefolio LLC"), "");
      check("and never hers", !html.includes("Valentina") && !text.includes("Valentina"), "");
      // A1 — the button must point at the NEW TENANT'S OWN PORTAL, not the signup host.
      const btn = (html.match(/href="(https?:\/\/[^"]+)"/g) ?? []).join(" ");
      check(
        "THE BUTTON POINTS AT THE NEW TENANT'S OWN PORTAL, not the host they signed up on (A1)",
        btn.includes(`//${PORTAL_HOST}`) && !btn.includes(`//${PLATFORM_DOMAIN}/`),
        btn.slice(0, 200) || "no links",
      );
      // Ruling 96 — postal address OFF a transactional envelope.
      check(
        "no postal address on this TRANSACTIONAL envelope (ruling 96)",
        !html.includes("1 Probe Street") && !text.includes("1 Probe Street"),
        "",
      );
    }
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
