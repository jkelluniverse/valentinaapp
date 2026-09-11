// task #81 REPRODUCTION — public booking under failed tenant resolution.
// Architect's hypothesis (C25 review, 2026-09-11): a client booking on practice
// B's PUBLIC site, during a request where tenant resolution fails, lands the
// Lead/Appointment in Valentina's (default) practice — correctly stamped, so no
// audit flags it.
//
// Method: two runs of the REAL built app against the REAL booking form on
// practice B's own host (host-resolver-rules, real Host header — same rig as
// audits/practice-setting-verify.ts).
//   RUN 1 (failure injected): the server's DB role has SELECT revoked on
//     "Tenant" ONLY — every tenant resolution errors while all other reads and
//     writes work. This is "known host, resolution failed", deterministically.
//   RUN 2 (control): same booking, healthy role — proves the flow normally
//     stamps practice B.
// Self-cleaning: probe tenant, users, leads, appointments and the errprobe role
// are removed at the end. NO product code is touched — this is evidence for the
// task-#81 ticket, not a fix.
//
// RESULT 2026-09-11 — REPRODUCED, 3/3 on the first run: under failed
// resolution the booking on practice B's host completed and the Lead was
// stamped tnt_valentina_000000001; the control stamped tenant B. NOT a
// standing gate — it creates/drops a DB role and kills servers on :3152.
// Run manually: DATABASE_URL=...scratch npx tsx audits/t81-booking-tenant-repro.ts
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { chromium } from "playwright";

const PORT = 3152;
const PLATFORM_DOMAIN = "psx.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const SLUG_B = "t81probeb";
const HOST_B = `${SLUG_B}.${PLATFORM_DOMAIN}`;
const EMAIL_B = "t81-probe-b@fixture.test";
const DEFAULT_TENANT_ID = "tnt_valentina_000000001";
const DBURL = process.env.DATABASE_URL!;
const ERR_URL = DBURL.replace("postgres:scratch", "t81errprobe:errprobe");

const psql = (sql: string) =>
  execFileSync("psql", [DBURL, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();

const results: { name: string; pass: boolean; note: string }[] = [];
const check = (name: string, pass: boolean, note: string) => {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name} — ${note}`);
};

async function bookOn(url: string, leadEmail: string): Promise<string> {
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: [`--host-resolver-rules=MAP *.${PLATFORM_DOMAIN} 127.0.0.1, MAP ${PLATFORM_DOMAIN} 127.0.0.1`],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${url}/book`, { waitUntil: "domcontentloaded" });
    // Day → slot → form.
    await page.locator("button").first().waitFor({ timeout: 15000 });
    const dayBtns = page.locator("button:not([type=submit])");
    await dayBtns.first().click();
    await page.waitForTimeout(300);
    // Slot buttons render after a day is chosen; pick the first time-looking one.
    const slot = page.locator("button", { hasText: /:\d\d/ }).first();
    await slot.click();
    await page.waitForTimeout(300);
    await page.fill('input[name="name"]', "T81 Probe");
    await page.fill('input[name="email"]', leadEmail);
    await page.waitForTimeout(2700); // clear the 2500ms time-trap
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    return page.url();
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function startServer(dbUrl: string): ChildProcess {
  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(PORT),
    PLATFORM_DOMAIN,
    AUTH_TRUST_HOST: "true",
  };
  return spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
}
async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server never became healthy");
}
const stopServer = (s: ChildProcess) => {
  s.kill("SIGTERM");
  try { execFileSync("pkill", ["-f", `next start -p ${PORT}`]); } catch { /* none */ }
};

async function cleanup() {
  const tb = psql(`select id from "Tenant" where slug='${SLUG_B}'`);
  if (tb) {
    psql(`delete from "Lead" where "tenantId"='${tb}' or email like 't81-lead-%'`);
    psql(`delete from "Appointment" where "tenantId"='${tb}' or id in (select "appointmentId" from "Lead" where email like 't81-lead-%')`);
    psql(`delete from "SchedulingConfig" where "practitionerId" in (select id from "User" where "tenantId"='${tb}')`);
    psql(`delete from "PracticeSetting" where "tenantId"='${tb}'`);
    psql(`delete from "AuditEvent" where "tenantId"='${tb}'`);
    psql(`delete from "TenantModule" where "tenantId"='${tb}'`);
    psql(`delete from "User" where "tenantId"='${tb}'`);
    psql(`delete from "Tenant" where id='${tb}'`);
  }
  psql(`delete from "Lead" where email like 't81-lead-%'`);
  psql(`delete from "AvailabilityRule" where id like 't81rule_%'`);
  psql(`delete from "PractitionerProspect" where email='${EMAIL_B}'`).trim();
  try { psql(`drop owned by t81errprobe; drop role t81errprobe`); } catch { /* absent */ }
}

async function main() {
  await cleanup();

  // A real second practice, created by the real signup service.
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  const { signUpPractitioner } = (await import("../lib/signup")) as any;
  const su = await signUpPractitioner({
    name: "T81 Probe B",
    practiceName: "T81 Practice B",
    email: EMAIL_B,
    password: "t81-probe-pass-2026",
    slug: SLUG_B,
    baseUrl: `http://localhost:${PORT}`,
  });
  const tenantB = psql(`select id from "Tenant" where slug='${SLUG_B}'`);
  check("a real ACTIVE non-default practice exists (real signup service)", su?.ok === true && !!tenantB, `tenant B = ${tenantB}`);

  // No seed data carries DISCOVERY hours, so /book would render zero slots for
  // anyone. Give BOTH practitioners wide-open weekday discovery hours (stamped
  // to their own tenants), so both runs have real slots to book.
  const practDefault = psql(
    `select id from "User" where role='PRACTITIONER' and ("tenantId"='${DEFAULT_TENANT_ID}' or "tenantId" is null) order by "createdAt" asc limit 1`,
  );
  const practB = psql(`select id from "User" where role='PRACTITIONER' and "tenantId"='${tenantB}' limit 1`);
  for (const [pract, tnt, tag] of [
    [practDefault, DEFAULT_TENANT_ID, "va"],
    [practB, tenantB, "pb"],
  ] as const) {
    for (let wd = 1; wd <= 5; wd++) {
      psql(
        `insert into "AvailabilityRule" (id, "tenantId", "practitionerId", kind, weekday, "startMinute", "endMinute", active)
         values ('t81rule_${tag}_${wd}', '${tnt}', '${pract}', 'DISCOVERY', ${wd}, 540, 1020, true)`,
      );
    }
  }

  // The failure-injection role: everything EXCEPT reading "Tenant".
  psql(`create role t81errprobe login password 'errprobe'`);
  psql(`grant usage on schema public to t81errprobe`);
  psql(`grant select, insert, update, delete on all tables in schema public to t81errprobe`);
  psql(`grant usage, select on all sequences in schema public to t81errprobe`);
  psql(`revoke select on "Tenant" from t81errprobe`);

  // ---- RUN 1: resolution fails on every request; writes still work ----
  let server = startServer(ERR_URL);
  let leadTenant1 = "";
  let url1 = "";
  try {
    await waitHealthy();
    url1 = await bookOn(`http://${HOST_B}:${PORT}`, "t81-lead-broken@fixture.test");
    leadTenant1 = psql(`select coalesce("tenantId",'NULL') from "Lead" where email='t81-lead-broken@fixture.test'`);
  } finally {
    stopServer(server);
  }
  const booked1 = /confirmed/.test(url1);
  check(
    "HYPOTHESIS — booking on practice B's host UNDER FAILED RESOLUTION succeeds and lands in the DEFAULT tenant, correctly stamped",
    booked1 && leadTenant1 === DEFAULT_TENANT_ID,
    `final url ${url1.replace(`http://${HOST_B}:${PORT}`, "")} · Lead.tenantId = ${leadTenant1 || "(no row)"}`,
  );

  await new Promise((r) => setTimeout(r, 1500));

  // ---- RUN 2 (control): healthy resolution, same host, same form ----
  server = startServer(DBURL);
  let leadTenant2 = "";
  let url2 = "";
  try {
    await waitHealthy();
    url2 = await bookOn(`http://${HOST_B}:${PORT}`, "t81-lead-healthy@fixture.test");
    leadTenant2 = psql(`select coalesce("tenantId",'NULL') from "Lead" where email='t81-lead-healthy@fixture.test'`);
  } finally {
    stopServer(server);
  }
  check(
    "CONTROL — the same booking with healthy resolution stamps practice B (the flow itself is tenant-correct)",
    /confirmed/.test(url2) && leadTenant2 === tenantB,
    `final url ${url2.replace(`http://${HOST_B}:${PORT}`, "")} · Lead.tenantId = ${leadTenant2 || "(no row)"}`,
  );

  await cleanup();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${failed === 0 ? "T81 REPRO COMPLETE" : "T81 REPRO INCONCLUSIVE"} — ${results.length - failed}/${results.length}`);
  process.exit(0);
}
main().catch(async (e) => {
  console.error("harness error:", e?.message ?? e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
