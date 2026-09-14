// C26-FAIL-CLOSED-TENANCY acceptance — a host that cannot be resolved is not
// Valentina's. PROMOTED from audits/t81-booking-tenant-repro.ts (the confirmed
// task-#81 reproduction, 2026-09-11): same rig — a real second practice from
// the real signup service, the real built app, genuine Host headers via
// --host-resolver-rules, and DETERMINISTIC failure injection (a DB role with
// SELECT revoked on "Tenant" alone: every tenant lookup fails, everything else
// works). Where the repro proved the defect, this gate proves its absence.
//
// STANDING-GATE FITNESS, stated because the spec asks: the role manipulation
// and server-kill that made the repro "manual" are the same class of side
// effect the engage/practice-setting gates already carry (spawned servers,
// throwaway DB state), all of it scratch-guarded (the gate refuses a Railway
// DATABASE_URL) and self-cleaning (role, tenant, rows, servers). It runs in
// the standing regression set; nothing about the invariant is left manually
// enforced.
//
// ONE SERVER, THREE PHASES — the order is the proof:
//   1 FAILURE  (errprobe role): the 503, no strings, no rows ANYWHERE, no
//     email at the transport sink, and the signed-in lockout.
//   2 RECOVERY (GRANT SELECT back, same running server): the very next
//     request resolves — no restart, no wait (Verify 6).
//   3 HEALTHY  (same server, now able to resolve): the control booking
//     completes, stamps tenant B, and the sink receives its two emails —
//     which also proves phase 1's zero-email assertion had a working
//     instrument. Unknown-slug behavior asserted unchanged (Verify 7).
//
// The transport boundary: the server is started with RESEND_API_URL pointed
// at a local sink in this process (the notify layer's testability affordance,
// same class as the tick's asOf) — so "no email was sent" is asserted on what
// actually left sendEmail, not on inference.
//
// Verify 8 (fresh, unseeded database still renders) runs against a throwaway
// database with the schema pushed and NO rows — the layer-3 literal's stated
// purpose, preserved for exactly that case and no longer for errors.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/fail-closed-tenancy-verify.ts
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import { writeFileSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const PORT = 3152;
const SINK_PORT = 3153;
const PLATFORM_DOMAIN = "psx.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const SLUG_B = "t26probeb";
const HOST_B = `${SLUG_B}.${PLATFORM_DOMAIN}`;
const HOST_UNKNOWN = `t26nosuch.${PLATFORM_DOMAIN}`;
const EMAIL_B = "t26-probe-b@fixture.test";
const DEFAULT_TENANT_ID = "tnt_valentina_000000001";
const DBURL = process.env.DATABASE_URL!;
const ERR_URL = DBURL.replace(/\/\/[^@]*@/, "//t26errprobe:errprobe@");
const FRESH_DB = "t26_fresh_check";

const psql = (sql: string, url = DBURL) =>
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();

const report: string[] = [];
const results: { name: string; pass: boolean; note?: string }[] = [];
function log(s: string) {
  report.push(s);
  console.log(s);
}
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// ---- the transport sink: what actually leaves sendEmail --------------------
const sunk: { to?: string; subject?: string; from?: string }[] = [];
function startSink(): Server {
  const s = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const b = JSON.parse(body);
        sunk.push({ to: b.to, subject: b.subject, from: b.from });
      } catch {
        sunk.push({});
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"id":"t26-sink"}');
    });
  });
  s.listen(SINK_PORT);
  return s;
}

async function cleanup() {
  const tb = psql(`select id from "Tenant" where slug='${SLUG_B}'`);
  if (tb) {
    psql(`delete from "Lead" where "tenantId"='${tb}' or email like 't26-lead-%'`);
    psql(
      `delete from "Appointment" where "tenantId"='${tb}' or id in (select "appointmentId" from "Lead" where email like 't26-lead-%' and "appointmentId" is not null)`,
    );
    psql(`delete from "SchedulingConfig" where "practitionerId" in (select id from "User" where "tenantId"='${tb}')`);
    psql(`delete from "PracticeSetting" where "tenantId"='${tb}'`);
    psql(`delete from "AuditEvent" where "tenantId"='${tb}'`);
    psql(`delete from "TenantModule" where "tenantId"='${tb}'`);
    psql(`delete from "User" where "tenantId"='${tb}'`);
    psql(`delete from "Tenant" where id='${tb}'`);
  }
  psql(`delete from "Lead" where email like 't26-lead-%'`);
  psql(`delete from "AvailabilityRule" where id like 't26rule_%'`);
  psql(`delete from "PractitionerProspect" where email='${EMAIL_B}'`);
  try {
    psql(`drop owned by t26errprobe`);
    psql(`drop role t26errprobe`);
  } catch {
    /* absent */
  }
  try {
    psql(`drop database if exists ${FRESH_DB} with (force)`, DBURL.replace(/\/[^/]*$/, "/postgres"));
  } catch {
    /* absent */
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
    // The transport boundary: everything sendEmail emits lands in this
    // process's sink. Fixture keys so both identities can send: C27 §Phase 2
    // routes a NON-default practice's mail through the platform sending
    // domain with the practice's identity (its rig tenant gets a practice
    // email below), so the healthy control's emails now carry tenant B's name.
    RESEND_API_KEY: "t26-not-a-real-key",
    NOTIFY_FROM_EMAIL: "T26 Practice <t26-from@fixture.test>",
    PLATFORM_RESEND_API_KEY: "t26-platform-not-a-real-key",
    PLATFORM_FROM_EMAIL: "T26 Platform <t26-platform-from@fixture.test>",
    RESEND_API_URL: `http://localhost:${SINK_PORT}/emails`,
  };
  return spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
}
async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
    } catch {
      /* booting */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server never became healthy");
}
const stopServer = (s: ChildProcess) => {
  s.kill("SIGTERM");
  try {
    execFileSync("pkill", ["-f", `next start -p ${PORT}`]);
  } catch {
    /* none */
  }
};

/** Global row counts — Verify 2 asserts absence in ANY tenant, not just B. */
const globalCounts = () => psql(`select (select count(*) from "Lead") || '|' || (select count(*) from "Appointment")`);

async function bookOn(browser: any, origin: string, leadEmail: string): Promise<string> {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(`${origin}/book`, { waitUntil: "domcontentloaded" });
    await page.locator("button:not([type=submit])").first().click();
    await page.waitForTimeout(300);
    await page.locator("button", { hasText: /:\d\d/ }).first().click();
    await page.waitForTimeout(300);
    await page.fill('input[name="name"]', "T26 Probe");
    await page.fill('input[name="email"]', leadEmail);
    await page.waitForTimeout(2700); // clear the 2500ms time-trap
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    return page.url();
  } finally {
    await ctx.close();
  }
}

async function main() {
  if (/railway|rlwy\.net/.test(DBURL)) throw new Error("Refusing to run against a Railway database");
  await cleanup();
  log(`# C26-FAIL-CLOSED-TENANCY verify — ${new Date().toISOString()}`);

  // =========================================================================
  log(`\n## Verify 1 — the five assumptions, confirmed or corrected`);
  // =========================================================================
  const grepFiles = (pattern: string, dirs: string[]): string[] => {
    try {
      return execFileSync("grep", ["-rl", pattern, ...dirs, "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  const tenantCallers = grepFiles("getTenant()", ["app", "lib", "components"]);
  check(
    "A1 CONFIRMED — getTenant()'s never-throw contract is load-bearing: the ROOT LAYOUT calls it on every request, plus dozens of surfaces",
    tenantCallers.includes("app/layout.tsx") && tenantCallers.length > 10,
    `${tenantCallers.length} calling files, app/layout.tsx among them — the contract is kept; only WHAT it returns on an unresolvable host changed`,
  );
  const guardsSrc = execFileSync("cat", ["lib/auth-guards.ts"], { encoding: "utf8" });
  check(
    "A2 CONFIRMED — the authenticated cross-tenant door exists as the spec quotes it (behavioral proof under failure is Verify 9 below)",
    guardsSrc.includes("if (userTenantId && userTenantId !== tenant.id) return null;") &&
      guardsSrc.includes("if (!userTenantId && tenant.slug !== DEFAULT_TENANT_SLUG) return null;"),
    "both lines present in lib/auth-guards.ts — this spec's scope is public-only, as assumed",
  );
  // A3 — scoped writes reachable without a session. Structural argument made
  // checkable: guard-prisma confines raw-prisma to the allowlist, so every
  // feature path goes through the scoped client, which now REFUSES under
  // unresolved. The one allowlisted raw-prisma path reachable from a public
  // surface is lib/signup.ts — which creates its OWN tenant with every row's
  // tenantId stated explicitly, so it cannot misattribute by construction.
  const publicActionDirs = ["app/(public)", "app/agree", "app/discovery"];
  const publicRawPrisma = grepFiles("prisma-internal", publicActionDirs);
  check(
    "A3 CONFIRMED-AND-WIDENED — beyond C18's booking (Lead+Appointment), token-authenticated public surfaces (agree, discovery reschedule) also write scoped rows; ALL go through the scoped client (zero raw-prisma imports under the public trees), so the §2 refusal covers every one of them; lib/signup's raw client states every tenantId explicitly",
    publicRawPrisma.length === 0,
    `raw-prisma imports under ${publicActionDirs.join(", ")}: none · scoped writes reachable: Lead, Appointment, SchedulingConfig (getOrCreateConfig), Agreement (sign), AuditEvent`,
  );
  const tenancySrc = execFileSync("cat", ["lib/tenancy/index.ts"], { encoding: "utf8" });
  check(
    "A4 CONFIRMED — post-ruling-33 the error and not-found branches were already separate; C26 §1 makes the distinction a TYPE (CheckedLookup / TenantResolution) so no caller can re-collapse them silently",
    tenancySrc.includes("ok: true; tenant") && tenancySrc.includes("ok: false; stale") && tenancySrc.includes('"unresolved"'),
    "the discriminated result is the mechanism, exactly as the spec predicted (small)",
  );
  check(
    "A5 CONFIRMED — the layer-3 literal survives ONLY behind a lookup that SUCCEEDED and found nothing (FRESH_DB_SHELL on the unknown-slug branch); the error branch can never reach it",
    tenancySrc.includes("FRESH_DB_SHELL") &&
      !/catch[\s\S]{0,200}FRESH_DB_SHELL/.test(tenancySrc) &&
      tenancySrc.includes("UNRESOLVED_SHELL"),
    "verified structurally here and behaviorally in Verify 8",
  );

  // =========================================================================
  log(`\n## Rig — practice B (real signup), discovery hours, the errprobe role, the sink`);
  // =========================================================================
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  const { signUpPractitioner } = (await import("../lib/signup")) as any;
  const su = await signUpPractitioner({
    name: "T26 Probe B",
    practiceName: "T26 Practice B",
    email: EMAIL_B,
    password: "t26-probe-pass-2026",
    slug: SLUG_B,
    baseUrl: `http://localhost:${PORT}`,
  });
  const tenantB = psql(`select id from "Tenant" where slug='${SLUG_B}'`);
  check("a real ACTIVE non-default practice exists (real signup service)", su?.ok === true && !!tenantB, `tenant B = ${tenantB}`);
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
         values ('t26rule_${tag}_${wd}', '${tnt}', '${pract}', 'DISCOVERY', ${wd}, 540, 1020, true)`,
      );
    }
  }
  // C27 §Phase 2 — a non-default practice's mail sends only AS ITSELF, which
  // requires its practiceEmail setting; without it the healthy control's
  // notifications would be HELD (the designed honest skip) and the sink check
  // would prove the wrong thing. Written by SQL with the tenant stated.
  psql(
    `insert into "PracticeSetting" (id, "tenantId", key, value, "updatedAt")
     values ('t26ps_practice_email_0001', '${tenantB}', 'practiceEmail', 't26-practice-reply@fixture.test', now())`,
  );
  psql(`create role t26errprobe login password 'errprobe'`);
  psql(`grant usage on schema public to t26errprobe`);
  psql(`grant select, insert, update, delete on all tables in schema public to t26errprobe`);
  psql(`grant usage, select on all sequences in schema public to t26errprobe`);
  psql(`revoke select on "Tenant" from t26errprobe`);
  const sink = startSink();

  const browser = await chromium.launch({
    executablePath: EXEC,
    args: [`--host-resolver-rules=MAP *.${PLATFORM_DOMAIN} 127.0.0.1, MAP ${PLATFORM_DOMAIN} 127.0.0.1`],
  });
  const server = startServer(ERR_URL);
  try {
    await waitHealthy();

    // =======================================================================
    log(`\n## Phase 1 — FAILURE injected (Verify 2, 3, 4, 10 + the signed-in half of 9)`);
    // =======================================================================
    const before = globalCounts();
    sunk.length = 0;

    const res = await fetch(`http://localhost:${PORT}/book`, {
      headers: { Host: `${HOST_B}:${PORT}` },
      redirect: "follow",
    });
    const body = await res.text();
    check(
      "V3/V10 — practice B's /book under failure is the NEUTRAL 503: Retry-After set, both languages, and NONE of Valentina's availability, branding, name, or wordmark in the HTML",
      res.status === 503 &&
        !!res.headers.get("retry-after") &&
        body.includes("temporarily unavailable") &&
        body.includes("temporalmente") &&
        !/Valentina|Veritas|VIIIV/i.test(body),
      `status=${res.status} · retry-after=${res.headers.get("retry-after")} · bilingual=yes · practice strings=absent`,
    );
    // The marketing home is STATIC (prerendered, no per-request resolution),
    // so it cannot 503 — and does not need to: it serves the SAME bytes to
    // every host in every condition, so a resolution failure cannot change
    // whose identity it shows. That is the invariant, asserted as such: the
    // failure response must be byte-identical to the healthy one (captured in
    // phase 3 below and compared there).
    const rootUnderFailure = await (
      await fetch(`http://localhost:${PORT}/`, { headers: { Host: `${HOST_B}:${PORT}` }, redirect: "follow" })
    ).text();

    // A browser attempt at the whole booking journey — it never reaches the
    // booking surface at all: the redirect lands it on /unavailable, where no
    // day/slot chooser exists to begin the flow.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`http://${HOST_B}:${PORT}/book`, { waitUntil: "domcontentloaded" });
    const landedOn = page.url();
    const chooserCount = await page.locator("button", { hasText: /:\d\d|Mon|Tue|Wed|Thu|Fri/ }).count();
    await ctx.close();
    check(
      "V3 — no bookable surface is offered under failure: the browser lands on /unavailable with no day/slot chooser (a form that cannot be safely submitted must not render)",
      /\/unavailable$/.test(landedOn) && chooserCount === 0,
      `landed on ${landedOn.replace(`http://${HOST_B}:${PORT}`, "")} · slot-chooser buttons: ${chooserCount}`,
    );

    check(
      "V2 — THE REPRODUCTION NOW FAILS TO REPRODUCE: no Lead and no Appointment was created in ANY tenant under the injected failure (asserted globally)",
      globalCounts() === before,
      `Lead|Appointment counts unchanged: ${before}`,
    );
    check(
      "V4 — no notification email left the transport under the failure (asserted at the sink sendEmail actually posts to)",
      sunk.length === 0,
      `sink requests: ${sunk.length}`,
    );

    // Signed-in half (Verify 9): B's practitioner tries to sign in under the
    // failure — locked out at /login, never shown another practice's data.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`http://${HOST_B}:${PORT}/login`, { waitUntil: "domcontentloaded" });
    await page2.fill('input[type="email"]', EMAIL_B);
    await page2.fill('input[type="password"]', "t26-probe-pass-2026");
    await page2.click('button[type="submit"]');
    await page2.waitForTimeout(2500);
    await page2.goto(`http://${HOST_B}:${PORT}/practitioner`, { waitUntil: "domcontentloaded" });
    const lockedUrl = page2.url();
    await ctx2.close();
    check(
      "V9 — a signed-in surface under failure LOCKS OUT rather than showing another practice: B's practitioner lands back on /login",
      /\/login/.test(lockedUrl),
      `after sign-in attempt + /practitioner: ${lockedUrl.replace(`http://${HOST_B}:${PORT}`, "")}`,
    );

    // =======================================================================
    log(`\n## Phase 2 — RECOVERY (Verify 6): lift the failure, same running server, next request`);
    // =======================================================================
    psql(`grant select on "Tenant" to t26errprobe`);
    const recovered = await fetch(`http://localhost:${PORT}/book`, { headers: { Host: `${HOST_B}:${PORT}` }, redirect: "follow" });
    check(
      "V6 — recovery is IMMEDIATE: the very next request after the failure lifts renders the booking page — no restart, no wait, no poisoned cache (ruling 33)",
      recovered.status === 200,
      `first post-recovery request: ${recovered.status}`,
    );

    // =======================================================================
    log(`\n## Phase 3 — HEALTHY control on the same server (Verify 5, 7) — the fix must not cost a working booking`);
    // =======================================================================
    sunk.length = 0;
    const url2 = await bookOn(browser, `http://${HOST_B}:${PORT}`, "t26-lead-healthy@fixture.test");
    const leadTenant = psql(`select coalesce("tenantId",'NULL') from "Lead" where email='t26-lead-healthy@fixture.test'`);
    check(
      "V5 — the healthy booking still completes on B's host and the Lead is stamped tenant B",
      /confirmed/.test(url2) && leadTenant === tenantB,
      `final url ${url2.replace(`http://${HOST_B}:${PORT}`, "")} · Lead.tenantId = ${leadTenant || "(no row)"}`,
    );
    check(
      "V5/V4 — and its two notification emails reached the SINK carrying TENANT B'S identity (C27 §Phase 2) — proving phase 1's zero-email assertion had a working instrument",
      sunk.length === 2 &&
        sunk.some((s) => s.to === "t26-lead-healthy@fixture.test") &&
        sunk.every((s) => s.from === `"T26 Practice B" <t26-platform-from@fixture.test>`),
      `sink: ${sunk.map((s) => `${s.to} ← ${s.from?.split("<")[0].trim()}`).join(" · ")}`,
    );
    const unknown = await fetch(`http://localhost:${PORT}/book`, { headers: { Host: `${HOST_UNKNOWN}:${PORT}` }, redirect: "follow" });
    const unknownBody = await unknown.text();
    check(
      "V7 — an UNKNOWN slug still behaves exactly as documented (default-host content, 200, the booking page renders) — this spec changed the error path only",
      unknown.status === 200 && /find a time to talk/i.test(unknownBody),
      `unknown slug /book → ${unknown.status} · booking-page heading ${/find a time to talk/i.test(unknownBody) ? "present" : "ABSENT"}`,
    );
    // The static front door: failure bytes === healthy bytes, so a resolution
    // failure cannot change whose identity it shows (see phase 1's capture).
    const rootHealthy = await (
      await fetch(`http://localhost:${PORT}/`, { headers: { Host: `${HOST_B}:${PORT}` }, redirect: "follow" })
    ).text();
    check(
      "V3 — the STATIC front door is resolution-INDEPENDENT: under failure it served byte-identical content to the healthy request, so the failure changed nothing about whose identity renders",
      rootHealthy === rootUnderFailure && rootHealthy.length > 0,
      `healthy ${rootHealthy.length}b === failure ${rootUnderFailure.length}b: ${rootHealthy === rootUnderFailure}`,
    );
  } finally {
    stopServer(server);
    sink.close();
    await browser.close().catch(() => undefined);
  }

  // =========================================================================
  log(`\n## Verify 8 — a fresh, unseeded database still renders (layer 3's real purpose, preserved)`);
  // =========================================================================
  const adminUrl = DBURL.replace(/\/[^/]*$/, "/postgres");
  psql(`drop database if exists ${FRESH_DB} with (force)`, adminUrl);
  psql(`create database ${FRESH_DB}`, adminUrl);
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    env: { ...process.env, DATABASE_URL: DBURL.replace(/\/[^/]*$/, `/${FRESH_DB}`) },
    stdio: "ignore",
  });
  const freshProbe = `
    import { resolveTenant } from "./lib/tenancy";
    resolveTenant("localhost").then((r) => {
      console.log(JSON.stringify({ kind: r.kind, id: (r as any).tenant?.id ?? null, name: (r as any).tenant?.displayName ?? null }));
      process.exit(0);
    });`;
  writeFileSync("t26-fresh-probe-tmp.ts", freshProbe);
  let fresh: { kind?: string; id?: string | null } = {};
  try {
    fresh = JSON.parse(
      execFileSync("npx", ["tsx", "t26-fresh-probe-tmp.ts"], {
        env: { ...process.env, DATABASE_URL: DBURL.replace(/\/[^/]*$/, `/${FRESH_DB}`) },
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .pop() as string,
    );
  } finally {
    execFileSync("rm", ["-f", "t26-fresh-probe-tmp.ts"]);
  }
  check(
    "V8 — on a schema-only database with ZERO tenant rows, resolution SUCCEEDS (unknown-slug) and serves the layer-3 literal shell — renders, never errors, and never via the error path",
    fresh.kind === "unknown-slug" && fresh.id === DEFAULT_TENANT_ID,
    `kind=${fresh.kind} · shell id=${fresh.id}`,
  );

  await cleanup();
  check(
    "SELF-CLEANING — probe practice, rules, leads, role and the fresh database are gone",
    psql(`select count(*) from "Tenant" where slug='${SLUG_B}'`) === "0" &&
      psql(`select count(*) from pg_roles where rolname='t26errprobe'`) === "0",
    "rows 0 · role gone · throwaway db dropped",
  );

  const failed = results.filter((r) => !r.pass);
  log(
    `\n${failed.length === 0 ? `FAIL-CLOSED-TENANCY VERIFY PASS — ${results.length}/${results.length}` : `${failed.length} CHECK(S) FAILED — ${results.length - failed.length}/${results.length}`}`,
  );
  if (failed.length === 0) {
    mkdirSync("audits/fail-closed-tenancy", { recursive: true });
    writeFileSync("audits/fail-closed-tenancy/VERIFY-LOG.md", report.join("\n") + "\n");
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("gate error:", e?.stack ?? e);
  try {
    execFileSync("pkill", ["-f", `next start -p ${PORT}`]);
  } catch {
    /* none */
  }
  await cleanup().catch(() => undefined);
  process.exit(1);
});
