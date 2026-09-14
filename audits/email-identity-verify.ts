// C27-EMAIL-IDENTITY — Phase 1 acceptance gate.
//
// Verifies: the five spec assumptions (item 1) · the platform identity at the
// transport AND at the wire (item 2) · the BLOCKING byte-identity of a default-
// practice booking confirmation against a fixture captured at the pinned
// pre-change commit (item 3, ruling 35: pin commits, never HEAD) · the staging
// allowlist for BOTH identities (item 8) · DEMO-tenant suppression for BOTH
// identities (item 9) · the unsubscribe line on platform messages (item 10).
// Items 4/5/6 and the per-practice footer half of item 7 are PHASE 2 and are
// logged as NOT BUILT, never faked.
//
// PASSES WITH NO RESEND_API_KEY PRESENT: every "send" in this gate goes to a
// mocked global fetch that captures the exact Resend request body — the wire —
// and the engage engine is additionally asserted at its injected-transport
// seam. Self-cleaning: every row this gate creates is deleted on the way out,
// and the tenant-stamp audit stays at zero (fixture rows are inserted by SQL
// with their tenantId stated).
//
//   npm run build   (not required — this gate spawns no server)
//   DATABASE_URL=...scratch npx tsx audits/email-identity-verify.ts
//   DATABASE_URL=...scratch npx tsx audits/email-identity-verify.ts --capture-fixture
//
// --capture-fixture regenerates audits/email-identity/booking-confirmation.fixture.json.
// Run it ONLY at the pinned pre-change commit (PINNED_PRE_CHANGE below) — the
// fixture IS the baseline that protects what Valentina's clients receive.
import { AsyncLocalStorage } from "async_hooks";
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const PINNED_PRE_CHANGE = "8a3f960"; // last commit before C27 Phase 1 (ruling 35)
const FIXTURE_PATH = "audits/email-identity/booking-confirmation.fixture.json";
const CAPTURE_MODE = process.argv.includes("--capture-fixture");

const DEFAULT_TENANT_ID = "tnt_valentina_000000001";
const PLATFORM_DOMAIN = "psx.test";

// Fixed identifiers — every one deleted by cleanup().
const P2_SLUG = "t27p2probeb";
const P2_HOST = `${P2_SLUG}.${PLATFORM_DOMAIN}`;
const P2_EMAIL = "t27-p2-owner@fixture.test";
const P2_SLUG_C = "t27p2probec";
const P2_HOST_C = `${P2_SLUG_C}.${PLATFORM_DOMAIN}`;
const P2_EMAIL_C = "t27-p2-owner-c@fixture.test";
const PRACT_ID = "t27pract000000000000000001";
const PRACT_EMAIL = "t27-practitioner@fixture.test";
const LEAD_ID = "t27lead0000000000000000001";
const LEAD_EMAIL = "t27-lead@fixture.test";
const APPT_ID = "t27appt0000000000000000001";
const SCHED_ID = "t27sched000000000000000001";
const DEMO_TENANT_ID = "tnt_t27demo_000000000001";
const PROSPECT_EN = "t27prospect_en_0000000001";
const PROSPECT_ES = "t27prospect_es_0000000001";

// Fixed env for deterministic rendering. SAME values at capture and compare —
// identical inputs + identical code must give identical bytes.
const FIXED_ENV: Record<string, string> = {
  RESEND_API_KEY: "t27-not-a-real-key",
  NOTIFY_FROM_EMAIL: "Valentina Vélez <t27-practice-from@fixture.test>",
  REPLY_TO_EMAIL: "t27-practice-reply@fixture.test",
  AUTH_SECRET: "t27-fixed-secret-for-signed-links",
};
const PLATFORM_ENV: Record<string, string> = {
  // Assumption-4 CORRECTION (Architect, 2026-09-12): psychefolio.com lives in a
  // SEPARATE Resend account, so the platform identity carries its OWN key.
  PLATFORM_RESEND_API_KEY: "t27-platform-not-a-real-key",
  PLATFORM_FROM_EMAIL: "T27 Platform <t27-platform-from@fixture.test>",
  PLATFORM_REPLY_TO: "t27-platform-reply@fixture.test",
  PLATFORM_LEGAL_ENTITY: "T27 Entity, Inc.",
  PLATFORM_POSTAL_ADDRESS: "123 Fixture Way, Testville FL 00000",
};

const results: { name: string; pass: boolean; note?: string }[] = [];
const lines: string[] = [];
function log(s: string) {
  console.log(s);
  lines.push(s);
}
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

const { execFileSync: run } = require("child_process") as typeof import("child_process");
const psql = (sql: string): string =>
  run("psql", [process.env.DATABASE_URL ?? "", "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const grepRepo = (pattern: string, dirs: string[]): string[] => {
  try {
    return run("grep", ["-rln", pattern, ...dirs, "--include=*.ts", "--include=*.tsx"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // grep exits 1 on no match
  }
};

// ---------------------------------------------------------------------------
// The wire: a mocked fetch that captures every Resend request body verbatim.
// ---------------------------------------------------------------------------
type WireCall = { from: string; reply_to?: string; to: string; subject: string; html: string; text: string; attachments?: unknown; authorization?: string };
const wire: WireCall[] = [];
const realFetch = globalThis.fetch;
function installWire() {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string" && url.includes("api.resend.com")) {
      // The credential is part of the wire too (assumption-4 correction):
      // record which account's key authenticated this send.
      wire.push({ ...JSON.parse(init.body), authorization: init?.headers?.Authorization });
      return new Response('{"id":"t27-wire"}', { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
function uninstallWire() {
  globalThis.fetch = realFetch;
}

// ---------------------------------------------------------------------------
// Simulated request scope (the nested-stamp/tenant-scope gates' proven rig) —
// needed only for the DEMO-suppression checks, which read the request's host.
// ---------------------------------------------------------------------------
let runInRequest: (host: string, fn: () => Promise<void>) => Promise<void>;
async function installRequestScope(): Promise<boolean> {
  try {
    const { requestAsyncStorage } = (await import(
      "next/dist/client/components/request-async-storage.external.js"
    )) as any;
    const { headers } = await import("next/headers");
    runInRequest = (host, fn) =>
      requestAsyncStorage.run(
        { headers: new Headers({ host }), cookies: new Map(), mutableCookies: new Map(), reactLoadableManifest: {}, assetPrefix: "" },
        fn,
      );
    let seen: string | null = null;
    await runInRequest(`t27.${PLATFORM_DOMAIN}`, async () => {
      seen = headers().get("host");
    });
    return seen === `t27.${PLATFORM_DOMAIN}`;
  } catch {
    return false;
  }
}

async function cleanup() {
  psql(`delete from "AuditEvent" where "actorId" in ('${PROSPECT_EN}','${PROSPECT_ES}')`);
  psql(`delete from "ProspectMessage" where "prospectId" in ('${PROSPECT_EN}','${PROSPECT_ES}')`);
  psql(`delete from "PractitionerProspect" where id in ('${PROSPECT_EN}','${PROSPECT_ES}')`);
  psql(`delete from "Lead" where id='${LEAD_ID}'`);
  psql(`delete from "Appointment" where id='${APPT_ID}'`);
  psql(`delete from "SchedulingConfig" where id='${SCHED_ID}'`);
  psql(`delete from "User" where id='${PRACT_ID}'`);
  psql(`delete from "PracticeSetting" where "tenantId"='${DEMO_TENANT_ID}'`);
  psql(`delete from "Tenant" where id='${DEMO_TENANT_ID}'`);
  for (const slug of [P2_SLUG, P2_SLUG_C]) {
    const t = psql(`select id from "Tenant" where slug='${slug}'`);
    if (!t) continue;
    psql(`delete from "PracticeSetting" where "tenantId"='${t}'`);
    psql(`delete from "AuditEvent" where "tenantId"='${t}'`);
    psql(`delete from "TenantModule" where "tenantId"='${t}'`);
    psql(`delete from "User" where "tenantId"='${t}'`);
    psql(`delete from "Tenant" where id='${t}'`);
  }
  psql(`delete from "PractitionerProspect" where email in ('${P2_EMAIL}','${P2_EMAIL_C}')`);
}

function seedBookingRows() {
  psql(
    `insert into "User" (id, email, name, "passwordHash", role, active, "updatedAt", "tenantId")
     values ('${PRACT_ID}', '${PRACT_EMAIL}', 'T27 Practitioner', 'x', 'PRACTITIONER', true, '2026-09-01T12:00:00Z', '${DEFAULT_TENANT_ID}')`,
  );
  psql(
    `insert into "SchedulingConfig" (id, "practitionerId", timezone, "calendarFeedSecret", "updatedAt", "tenantId")
     values ('${SCHED_ID}', '${PRACT_ID}', 'America/New_York', 't27-feed-secret', '2026-09-01T12:00:00Z', '${DEFAULT_TENANT_ID}')`,
  );
  psql(
    `insert into "Appointment" (id, "practitionerId", "startAt", "endAt", status, location, "videoUrl", "bookedBy", kind, "updatedAt", "tenantId")
     values ('${APPT_ID}', '${PRACT_ID}', '2026-10-06T14:00:00Z', '2026-10-06T14:20:00Z', 'SCHEDULED', 'VIRTUAL', 'https://video.fixture.test/t27-room', 'lead', 'DISCOVERY', '2026-09-01T12:00:00Z', '${DEFAULT_TENANT_ID}')`,
  );
  psql(
    `insert into "Lead" (id, name, email, phone, note, status, "appointmentId", source, "updatedAt", "tenantId")
     values ('${LEAD_ID}', 'T27 Fixture Lead', '${LEAD_EMAIL}', null, null, 'NEW', '${APPT_ID}', '/book', '2026-09-01T12:00:00Z', '${DEFAULT_TENANT_ID}')`,
  );
}

/** Canonical, order-stable form of the two captured booking emails. */
function canonicalWire(calls: WireCall[]): string {
  const shaped = calls.map((c) => ({
    from: c.from,
    reply_to: c.reply_to ?? null,
    to: c.to,
    subject: c.subject,
    text: c.text,
    html: c.html,
    attachments: c.attachments ?? null,
  }));
  return JSON.stringify(shaped, null, 2);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  const originalEnv: Record<string, string | undefined> = {};
  for (const k of [...Object.keys(FIXED_ENV), ...Object.keys(PLATFORM_ENV), "RAILWAY_ENVIRONMENT_NAME", "EMAIL_TEAM_ALLOWLIST", "PLATFORM_DOMAIN", "ENGAGE_ENABLED", "ENGAGE_PAUSED"]) {
    originalEnv[k] = process.env[k];
  }
  const restoreEnv = () => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const keyWasPresent = Boolean(process.env.RESEND_API_KEY);

  await cleanup();
  log(`# C27-EMAIL-IDENTITY Phase 1 verify — ${new Date().toISOString()}`);
  log(`RESEND_API_KEY present in this environment: ${keyWasPresent ? "YES (does not prove the no-key seam)" : "no — as the spec requires"}`);

  Object.assign(process.env, FIXED_ENV);
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  delete process.env.ENGAGE_ENABLED;
  delete process.env.ENGAGE_PAUSED;

  // =========================================================================
  log(`\n## Item 1 — the five assumptions, confirmed or corrected (ruling 18)`);
  // =========================================================================
  const dirs = ["app", "lib", "components", "emails", "prisma", "scripts"];
  const fromReads = grepRepo("NOTIFY_FROM_EMAIL\\|REPLY_TO_EMAIL\\|PRACTICE_EMAIL", dirs).filter(
    (f) => !/^audits\//.test(f),
  );
  const fromReadsReal = fromReads.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /process\.env\.(NOTIFY_FROM_EMAIL|REPLY_TO_EMAIL|PRACTICE_EMAIL)/.test(src);
  });
  check(
    "A1 CONFIRMED — the sender env vars are READ only in lib/notify.ts and lib/agreements/index.ts (one page mentions the names in copy, reads nothing)",
    fromReadsReal.sort().join(",") === "lib/agreements/index.ts,lib/notify.ts",
    `process.env reads: ${fromReadsReal.join(", ")} · name-in-copy only: ${fromReads.filter((f) => !fromReadsReal.includes(f)).join(", ") || "none"}`,
  );
  const directApi = grepRepo("api\\.resend\\.com", dirs).filter((f) => f !== "lib/notify.ts");
  check(
    "A2 CONFIRMED — api.resend.com is called ONLY from lib/notify.ts; every other 'resend' in the app is the English word (resendInvite, resendReceipt)",
    directApi.length === 0,
    directApi.join(", ") || "no bypass — all mail funnels through sendEmail",
  );
  const footerComposers = grepRepo("Veritas Consulting", ["emails", "lib/notify.ts"]);
  check(
    "A3 CONFIRMED — emails/envelope.ts is the single place the practice footer is composed for EMAIL (other 'Veritas Consulting' sites are PDFs and sign pages, out of scope)",
    footerComposers.length === 1 && footerComposers[0] === "emails/envelope.ts",
    footerComposers.join(", "),
  );
  log(
    `- ~ A4 was CORRECTED BY THE ARCHITECT (2026-09-12, in the spec, before build-on): psychefolio.com lives in a SEPARATE Resend account, so the platform identity carries its OWN credential (PLATFORM_RESEND_API_KEY). The per-identity key is asserted BEHAVIORALLY below: at the wire's Authorization header, in the missing-key degradation, and in both directions of account independence.`,
  );
  const notifySrc = readFileSync("lib/notify.ts", "utf8");
  const guardBeforeIdentity =
    notifySrc.indexOf("allowedInThisEnvironment(args.to)") !== -1 &&
    notifySrc.indexOf("allowedInThisEnvironment(args.to)") < notifySrc.indexOf("renderPlatformEnvelope") ||
    CAPTURE_MODE; // pre-change code has no platform branch yet
  check(
    "A5 CONFIRMED — EMAIL_TEAM_ALLOWLIST + RAILWAY_ENVIRONMENT_NAME live in sendEmail and run BEFORE any identity branch, so the staging guard is identity-independent by construction",
    /EMAIL_TEAM_ALLOWLIST/.test(notifySrc) && /RAILWAY_ENVIRONMENT_NAME/.test(notifySrc) && guardBeforeIdentity,
    "asserted again behaviorally in item 8 below",
  );

  // =========================================================================
  log(`\n## Item 3 — the BLOCKING byte-identity: a default-practice booking confirmation, against the fixture captured at ${PINNED_PRE_CHANGE}`);
  // =========================================================================
  seedBookingRows();
  const { notifyDiscovery } = await import("../lib/discovery");
  installWire();
  wire.length = 0;
  await notifyDiscovery(APPT_ID, "booked", "http://t27.fixture.test");
  uninstallWire();
  const captured = canonicalWire(wire);
  check(
    "the booking path produced exactly its two sends (practitioner notify + lead confirmation) through the real sendEmail, captured at the wire",
    wire.length === 2 && wire[1].to === LEAD_EMAIL,
    `${wire.length} wire call(s): ${wire.map((w) => w.to).join(" · ")}`,
  );

  if (CAPTURE_MODE) {
    const head = run("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    mkdirSync("audits/email-identity", { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        { capturedAt: head, note: `Byte-identity baseline for C27 Verify item 3. Captured at commit ${head}; the gate pins ${PINNED_PRE_CHANGE}. Regenerate ONLY as a deliberate re-pin.`, calls: JSON.parse(captured) },
        null,
        2,
      ) + "\n",
    );
    await cleanup();
    restoreEnv();
    console.log(`\nFIXTURE CAPTURED at ${head} → ${FIXTURE_PATH}${head.startsWith(PINNED_PRE_CHANGE) ? "" : `  *** WARNING: HEAD ${head} is not the pinned ${PINNED_PRE_CHANGE} — update PINNED_PRE_CHANGE if this re-pin is deliberate ***`}`);
    process.exit(0);
  }

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const fixtureCanonical = JSON.stringify(fixture.calls, null, 2);
  const identical = captured === fixtureCanonical;
  if (!identical) {
    // Show WHERE it diverged — the first differing line, not a wall of HTML.
    const a = captured.split("\n");
    const b = fixtureCanonical.split("\n");
    const i = a.findIndex((l, idx) => l !== b[idx]);
    log(`  first divergence at canonical line ${i}:\n    now:     ${a[i]?.slice(0, 160)}\n    fixture: ${b[i]?.slice(0, 160)}`);
  }
  check(
    `BLOCKING — the default practice's booking emails are BYTE-IDENTICAL to the ${fixture.capturedAt} fixture: from, reply_to, subject, text, html, attachments — what Valentina's clients receive did not change`,
    identical && fixture.capturedAt === PINNED_PRE_CHANGE,
    identical ? `byte-identical (${captured.length} canonical bytes) · fixture pinned at ${fixture.capturedAt}` : "DIVERGED — see above",
  );

  // =========================================================================
  log(`\n## Item 2 — the platform identity: fail-closed config, the engage engine's identity, and the wire`);
  // =========================================================================
  const notify = await import("../lib/notify");
  check(
    "platformEmailConfigured() is FALSE with no platform values set — the engage gate cannot fall back to Valentina's identity (falling back is the bug)",
    notify.platformEmailConfigured() === false && notify.platformIdentity() === null,
    "unset PLATFORM_* → null identity, unconfigured",
  );
  Object.assign(process.env, PLATFORM_ENV);
  check(
    "…and TRUE once all five platform values exist; the identity carries them — INCLUDING its own account's credential — verbatim",
    notify.platformEmailConfigured() === true &&
      notify.platformIdentity()?.from === PLATFORM_ENV.PLATFORM_FROM_EMAIL &&
      notify.platformIdentity()?.replyTo === PLATFORM_ENV.PLATFORM_REPLY_TO &&
      notify.platformIdentity()?.apiKey === PLATFORM_ENV.PLATFORM_RESEND_API_KEY,
    `from=${notify.platformIdentity()?.from}`,
  );
  delete process.env.PLATFORM_LEGAL_ENTITY;
  check(
    "…and a MISSING legal entity fails closed again — a footer that names no entity must not send (spec Phase 1 §4)",
    notify.platformEmailConfigured() === false,
    "PLATFORM_LEGAL_ENTITY removed → unconfigured",
  );
  process.env.PLATFORM_LEGAL_ENTITY = PLATFORM_ENV.PLATFORM_LEGAL_ENTITY;
  delete process.env.PLATFORM_RESEND_API_KEY;
  check(
    "A4-correction — a missing PLATFORM key fails closed the same way, even with the PRACTICE key present: the other account's credential is never borrowed",
    notify.platformEmailConfigured() === false && Boolean(process.env.RESEND_API_KEY),
    "PLATFORM_RESEND_API_KEY removed (practice RESEND_API_KEY still set) → unconfigured",
  );

  // The engage engine: first a tick with NO platform key — the spec's explicit
  // sentence: a missing platform key degrades like a missing practice key does
  // today. UNCONFIGURED, no exception, re-sendable.
  const nowAnchor = new Date(Date.now() - 60_000).toISOString();
  psql(
    `insert into "PractitionerProspect" (id, name, email, status, source, locale, "referralCode", "createdAt", "updatedAt")
     values ('${PROSPECT_EN}', 'T27 Prospect EN', 't27-prospect-en@fixture.test', 'LEAD', 'event-t27', 'en', 't27refen', '${nowAnchor}', '${nowAnchor}'),
            ('${PROSPECT_ES}', 'T27 Prospecto ES', 't27-prospect-es@fixture.test', 'LEAD', 'event-t27', 'es', 't27refes', '${nowAnchor}', '${nowAnchor}')`,
  );
  process.env.ENGAGE_ENABLED = "on"; // in-process only — the DB row that governs production is untouched, asserted below
  const { engageTick } = await import("../lib/engage");
  const asOf = new Date();
  const transportSaw: any[] = [];
  const spy = async (args: any) => {
    transportSaw.push(args);
    return { ok: true };
  };
  const keylessTick = await engageTick({ asOf, send: spy });
  const keylessRows = psql(
    `select status, count(*) from "ProspectMessage" where "prospectId" like 't27prospect%' group by status`,
  );
  check(
    "with NO platform key, every due step records UNCONFIGURED — no exception, no send, no borrowed credential (degrades exactly as a missing practice key does today)",
    keylessTick.emailConfigured === false && transportSaw.length === 0 && /UNCONFIGURED\|2/.test(keylessRows),
    `tick configured=${keylessTick.emailConfigured} · transport calls=${transportSaw.length} · ledger: ${keylessRows.replace(/\n/g, " ")}`,
  );

  // Restore the key and re-tick the SAME asOf: the SAME rows flip to SENT.
  process.env.PLATFORM_RESEND_API_KEY = PLATFORM_ENV.PLATFORM_RESEND_API_KEY;
  const tick = await engageTick({ asOf, send: spy });
  const t27Steps = transportSaw.filter((a) => /t27-prospect/.test(a.to));
  const flippedRows = psql(`select count(*) from "ProspectMessage" where "prospectId" like 't27prospect%'`);
  check(
    "…and once the platform key exists, the SAME re-sendable rows flip to SENT (no third row) with the PLATFORM identity — its own key included — on every step, both locales (injected-transport seam)",
    t27Steps.length === 2 &&
      flippedRows === "2" &&
      t27Steps.every(
        (a) =>
          a.identity?.from === PLATFORM_ENV.PLATFORM_FROM_EMAIL &&
          a.identity?.replyTo === PLATFORM_ENV.PLATFORM_REPLY_TO &&
          a.identity?.apiKey === PLATFORM_ENV.PLATFORM_RESEND_API_KEY,
      ) &&
      new Set(t27Steps.map((a) => a.envelope?.locale)).size === 2,
    `${t27Steps.length} sends: ${t27Steps.map((a) => `${a.envelope?.locale}→${a.identity?.from?.split("<")[0].trim()}`).join(" · ")} · ledger rows=${flippedRows} · tick configured=${tick.emailConfigured}`,
  );

  // The same messages through the REAL sendEmail, asserted at the wire.
  installWire();
  wire.length = 0;
  for (const args of t27Steps) await notify.sendEmail(args);
  uninstallWire();
  const forbidden = /Veritas|VIIIV|Valentina|Neuropsych|Psych-K|Psych-K®/i;
  const wireOk =
    wire.length === 2 &&
    wire.every(
      (w) =>
        w.from === PLATFORM_ENV.PLATFORM_FROM_EMAIL &&
        w.reply_to === PLATFORM_ENV.PLATFORM_REPLY_TO &&
        w.authorization === `Bearer ${PLATFORM_ENV.PLATFORM_RESEND_API_KEY}`,
    );
  const cleanOk = wire.every((w) => !forbidden.test(w.html) && !forbidden.test(w.text) && !forbidden.test(w.subject));
  const footerOk = wire.every(
    (w) =>
      w.html.includes("T27 Entity, Inc.") &&
      w.html.includes("123 Fixture Way, Testville FL 00000") &&
      w.text.includes("T27 Entity, Inc."),
  );
  check(
    "at the WIRE: platform from + platform reply-to + the PLATFORM account's Authorization, and the html, text and subject contain NONE of Veritas / VIIIV / Valentina / her credential line — both locales",
    wireOk && cleanOk,
    `from=${wire[0]?.from} · reply_to=${wire[0]?.reply_to} · auth=platform key · forbidden-string scan clean=${cleanOk}`,
  );
  // Account independence, both directions: the platform sends with NO practice
  // key at all; the practice path is untouched by the platform key's absence.
  const savedPracticeKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  installWire();
  wire.length = 0;
  const noPracticeKeyPlatform = await notify.sendEmail({ ...t27Steps[0] });
  uninstallWire();
  process.env.RESEND_API_KEY = savedPracticeKey;
  check(
    "A4-correction — account independence: a platform send succeeds with NO practice RESEND_API_KEY present, authenticating with the platform account's own key",
    noPracticeKeyPlatform.ok === true && wire.length === 1 && wire[0].authorization === `Bearer ${PLATFORM_ENV.PLATFORM_RESEND_API_KEY}`,
    `ok=${noPracticeKeyPlatform.ok} · auth=${wire[0]?.authorization === `Bearer ${PLATFORM_ENV.PLATFORM_RESEND_API_KEY}` ? "platform key" : wire[0]?.authorization}`,
  );
  check(
    "…and the platform footer names the configured legal entity and postal address in html AND text (no practice letterhead, no borrowed wordmark)",
    footerOk,
    `entity + postal present in both parts of both locales`,
  );
  check(
    "item 10 — every platform message still carries a working unsubscribe link: a real <a> in the html and the labeled URL in the text part",
    wire.every((w) => /<a href="[^"]*unsubscribe[^"]*"/.test(w.html) && /unsubscribe/i.test(w.text)),
    "anchor + text line present in both locales",
  );

  // Default behaviour with no identity: exactly today's.
  installWire();
  wire.length = 0;
  await notify.sendEmail({ to: "t27-default@fixture.test", subject: "T27 default-path probe", text: "One paragraph." });
  uninstallWire();
  check(
    "with NO identity passed, sendEmail behaves exactly as before: NOTIFY_FROM_EMAIL from, REPLY_TO_EMAIL reply-to, the PRACTICE account's Authorization, the practice Envelope (Valentina's footer intact for HER mail)",
    wire.length === 1 &&
      wire[0].from === FIXED_ENV.NOTIFY_FROM_EMAIL &&
      wire[0].reply_to === FIXED_ENV.REPLY_TO_EMAIL &&
      wire[0].authorization === `Bearer ${FIXED_ENV.RESEND_API_KEY}` &&
      wire[0].html.includes("Veritas Consulting"),
    `from=${wire[0]?.from} · auth=practice key · footer=practice`,
  );

  // =========================================================================
  log(`\n## Item 8 — the staging allowlist blocks non-fixture recipients for BOTH identities`);
  // =========================================================================
  process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
  process.env.EMAIL_TEAM_ALLOWLIST = "";
  installWire();
  wire.length = 0;
  const blockedPractice = await notify.sendEmail({ to: "real-person@example.com", subject: "T27", text: "x" });
  const blockedPlatform = await notify.sendEmail({ to: "real-person@example.com", subject: "T27", text: "x", identity: notify.platformIdentity()! });
  const allowedFixture = await notify.sendEmail({ to: "t27-ok@fixture.test", subject: "T27", text: "x", identity: notify.platformIdentity()! });
  uninstallWire();
  check(
    "on a non-production RAILWAY_ENVIRONMENT_NAME, a real recipient is refused for the practice identity AND the platform identity — zero wire calls; a fixture address still sends",
    blockedPractice.skipped === true && blockedPlatform.skipped === true && allowedFixture.ok === true && wire.length === 1,
    `blocked practice=${blockedPractice.skipped} · blocked platform=${blockedPlatform.skipped} · fixture sent=${allowedFixture.ok} · wire calls=${wire.length}`,
  );
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  delete process.env.EMAIL_TEAM_ALLOWLIST;

  // =========================================================================
  log(`\n## Item 9 — DEMO-tenant suppression holds for BOTH identities`);
  // =========================================================================
  const scopeOk = await installRequestScope();
  check("the simulated request scope is real (host readable via next/headers) before any check is built on it", scopeOk, scopeOk ? "verified" : "UNAVAILABLE — cannot assert item 9");
  psql(
    `insert into "Tenant" (id, slug, "displayName", status, "layoutKey", "skinKey")
     values ('${DEMO_TENANT_ID}', 't27demo', 'T27 Demo', 'DEMO', 'journey-v1', 'warm-clay')`,
  );
  // Phase 2 made unconfigured non-default practices SKIP before the DEMO
  // guard can speak — so give the demo tenant a practice email, ensuring the
  // check below proves DEMO SUPPRESSION and not mere unconfiguredness.
  {
    const { withTenantScope } = (await import("../lib/tenancy/tenant-scope")) as any;
    const { writePracticeSetting } = (await import("../lib/practice-settings")) as any;
    await withTenantScope(DEMO_TENANT_ID, async () => {
      await writePracticeSetting("practiceEmail", "t27-demo-practice@fixture.test");
    });
  }
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  let demoPractice: any = null;
  let demoPlatform: any = null;
  installWire();
  wire.length = 0;
  await runInRequest(`t27demo.${PLATFORM_DOMAIN}`, async () => {
    demoPractice = await notify.sendEmail({ to: "real-person@example.com", subject: "T27", text: "x" });
    demoPlatform = await notify.sendEmail({ to: "real-person@example.com", subject: "T27", text: "x", identity: notify.platformIdentity()! });
  });
  uninstallWire();
  check(
    "on a DEMO tenant's host, a real recipient is suppressed for BOTH identities — zero wire calls",
    demoPractice?.skipped === true && demoPlatform?.skipped === true && wire.length === 0,
    `practice=${demoPractice?.skipped} · platform=${demoPlatform?.skipped} · wire calls=${wire.length}`,
  );

  // =========================================================================
  log(`\n## The engage gate stays CLOSED (law #10) — this build opens nothing`);
  // =========================================================================
  delete process.env.ENGAGE_ENABLED;
  const gateRow = psql(`select count(*) from "PracticeSetting" where key='engageEnabled'`);
  const { engageEnvEnabled } = await import("../lib/engage-config");
  check(
    "no engageEnabled PracticeSetting row exists and the env override is off — the production gate is exactly as closed as before this build",
    gateRow === "0" && engageEnvEnabled() === false,
    `rows=${gateRow} · env=off (the tick above ran on an in-process env override, removed)`,
  );

  // =========================================================================
  log(`\n## PHASE 2 — items 4, 5, 6: the per-practice identity, the silent-failure case, and no cross-identity in one process`);
  // =========================================================================
  const { withTenantScope } = (await import("../lib/tenancy/tenant-scope")) as any;
  const { writePracticeSetting } = (await import("../lib/practice-settings")) as any;
  const { signUpPractitioner } = (await import("../lib/signup")) as any;
  const suB = await signUpPractitioner({
    name: "T27 P2 Owner",
    practiceName: "T27 P2 Practice",
    email: P2_EMAIL,
    password: "t27-p2-pass-2026",
    slug: P2_SLUG,
    baseUrl: "http://localhost:3999",
  });
  const suC = await signUpPractitioner({
    name: "T27 P2 Owner C",
    practiceName: "T27 P2 Practice C",
    email: P2_EMAIL_C,
    password: "t27-p2-pass-2026",
    slug: P2_SLUG_C,
    baseUrl: "http://localhost:3999",
  });
  const tB = psql(`select id from "Tenant" where slug='${P2_SLUG}'`);
  const tC = psql(`select id from "Tenant" where slug='${P2_SLUG_C}'`);
  check("two real non-default practices exist (real signup service); B configures contact details, C deliberately does NOT", suB?.ok === true && suC?.ok === true && !!tB && !!tC, `B=${tB} · C=${tC}`);
  await withTenantScope(tB, async () => {
    await writePracticeSetting("practiceEmail", "t27-p2-reply@fixture.test");
    await writePracticeSetting("practicePostalAddress", "9 Practice Row, Testville FL");
  });

  // Item 4 — B's client mail carries B's identity, at the wire, inside a real
  // request scope on B's own host, with NO explicit identity passed.
  const sendNoIdentity = async (host: string, to: string) => {
    let r: any = null;
    await runInRequest(`${host}`, async () => {
      r = await notify.sendEmail({ to, subject: "Your booking is confirmed", text: "See you soon.\n\nWarmly," });
    });
    return r;
  };
  installWire();
  wire.length = 0;
  const rB = await sendNoIdentity(P2_HOST, "t27-p2-client@fixture.test");
  uninstallWire();
  const wB = wire[0];
  check(
    "ITEM 4 — practice B's client mail (no explicit identity, resolved from B's host) carries B's DISPLAY NAME, B's REPLY-TO, B's FOOTER, the platform account's key — and none of Valentina's identity strings",
    rB?.ok === true &&
      wire.length === 1 &&
      wB.from === `"T27 P2 Practice" <t27-platform-from@fixture.test>` &&
      wB.reply_to === "t27-p2-reply@fixture.test" &&
      wB.authorization === `Bearer ${PLATFORM_ENV.PLATFORM_RESEND_API_KEY}` &&
      wB.html.includes("T27 P2 Practice") &&
      wB.html.includes("9 Practice Row, Testville FL") &&
      // Envelope-less sends keep the caller's raw text part (pre-existing
      // behaviour, same as the default path) — the footer lives in the html.
      !forbidden.test(wB.html) &&
      !forbidden.test(wB.text),
    `from=${wB?.from} · reply_to=${wB?.reply_to} · auth=${wB?.authorization === `Bearer ${PLATFORM_ENV.PLATFORM_RESEND_API_KEY}` ? "platform key" : wB?.authorization} · footer=B's · forbidden strings absent`,
  );

  // Item 5 — the silent-failure case: C has no practice email. What it does
  // instead: an HONEST SKIP (ok:false, skipped:true, a log line) — the mail is
  // held, and no identity is borrowed. Asserted at the wire: zero calls.
  installWire();
  wire.length = 0;
  const rC = await sendNoIdentity(P2_HOST_C, "t27-p2-client-c@fixture.test");
  uninstallWire();
  check(
    "ITEM 5 — a practice with NO email configured sends as NO ONE: the send is skipped (ok:false, skipped:true), zero wire calls, nothing borrowed — honest degradation, same shape as a missing credential",
    rC?.ok === false && rC?.skipped === true && wire.length === 0,
    `result={ok:${rC?.ok}, skipped:${rC?.skipped}} · wire calls=${wire.length}`,
  );

  // Item 6 — A (default), then B, then A again, one process: no crossing.
  installWire();
  wire.length = 0;
  const a1 = await notify.sendEmail({ to: "t27-a1@fixture.test", subject: "T27 A1", text: "x" }); // CLI: no scope → default
  const b1 = await sendNoIdentity(P2_HOST, "t27-b1@fixture.test");
  const a2 = await notify.sendEmail({ to: "t27-a2@fixture.test", subject: "T27 A2", text: "x" });
  uninstallWire();
  const [wA1, wB1, wA2] = wire;
  check(
    "ITEM 6 — A then B then A in ONE process: A's sends are byte-consistent legacy (practice key, NOTIFY_FROM_EMAIL, Veritas footer), B's is B's — no identity crosses in either direction",
    a1?.ok === true && b1?.ok === true && a2?.ok === true && wire.length === 3 &&
      wA1.from === FIXED_ENV.NOTIFY_FROM_EMAIL &&
      wA2.from === FIXED_ENV.NOTIFY_FROM_EMAIL &&
      wA1.authorization === `Bearer ${FIXED_ENV.RESEND_API_KEY}` &&
      wA2.authorization === wA1.authorization &&
      wA1.html.includes("Veritas Consulting") &&
      wA2.html.includes("Veritas Consulting") &&
      wA1.reply_to === FIXED_ENV.REPLY_TO_EMAIL &&
      wA2.reply_to === wA1.reply_to &&
      wB1.from === `"T27 P2 Practice" <t27-platform-from@fixture.test>` &&
      !wB1.html.includes("Veritas") &&
      !wA1.html.includes("T27 P2 Practice") &&
      !wA2.html.includes("T27 P2 Practice"),
    `A1 from=${wA1?.from?.split("<")[0]} · B from=${wB1?.from?.split("<")[0]} · A2 from=${wA2?.from?.split("<")[0]} — A1 and A2 identical, B untouched by A, A untouched by B`,
  );

  // Item 7's per-practice half — the agreements placeholder now fills from the
  // practice setting: structural assertion that the env var survives ONLY
  // behind the default-tenant guard (behavioral no-regress for the default
  // tenant is carried by c20/c21/v31 in the regression set).
  const agreementsSrc = readFileSync("lib/agreements/index.ts", "utf8");
  check(
    "ITEM 7 (per-practice half) — PRACTICE_EMAIL is retired as a global: lib/agreements reads the per-practice setting first, and the env fallback is reachable ONLY for the default tenant",
    /readPracticeSetting\(PRACTICE_EMAIL_KEY\)/.test(agreementsSrc) &&
      /tid === null \|\| tid === DEFAULT_TENANT_ID/.test(agreementsSrc) &&
      agreementsSrc.indexOf("PRACTICE_EMAIL ??") > agreementsSrc.indexOf("tid === null || tid === DEFAULT_TENANT_ID"),
    "setting first · env fallback behind the default-tenant guard · non-default unset leaves the placeholder visibly unfilled",
  );

  // =========================================================================
  log(`\n## F1 — RESEND_API_URL is IGNORED on a production environment (fail-safe, not just config-safe)`);
  // =========================================================================
  process.env.RAILWAY_ENVIRONMENT_NAME = "production";
  process.env.RESEND_API_URL = "http://localhost:9/never-here";
  installWire(); // intercepts the REAL api.resend.com URL only
  wire.length = 0;
  const f1 = await notify.sendEmail({ to: "t27-f1@fixture.test", subject: "T27 F1", text: "x" });
  uninstallWire();
  delete process.env.RESEND_API_URL;
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  check(
    "F1 — with RESEND_API_URL SET and RAILWAY_ENVIRONMENT_NAME=production, the send goes to the REAL endpoint: a stray override variable can never redirect credentialed production mail",
    f1?.ok === true && wire.length === 1,
    `send ok=${f1?.ok} · reached api.resend.com=${wire.length === 1} (the override pointed at localhost:9 and was ignored)`,
  );

  await cleanup();
  restoreEnv();
  check(
    "SELF-CLEANING — every fixture row this gate created is gone, and the environment is restored",
    psql(`select count(*) from "User" where id='${PRACT_ID}'`) === "0" &&
      psql(`select count(*) from "PractitionerProspect" where id like 't27prospect%'`) === "0" &&
      psql(`select count(*) from "Tenant" where id='${DEMO_TENANT_ID}'`) === "0" &&
      Boolean(process.env.RESEND_API_KEY) === keyWasPresent,
    "rows 0 · env restored",
  );

  const failed = results.filter((r) => !r.pass);
  log(`\n${failed.length === 0 ? `EMAIL-IDENTITY VERIFY PASS — ${results.length}/${results.length}` : `${failed.length} CHECK(S) FAILED — ${results.length - failed.length}/${results.length}`}`);
  if (failed.length === 0) {
    // Ruling 17 — the log is written BY the gate, or not at all.
    mkdirSync("audits/email-identity", { recursive: true });
    writeFileSync("audits/email-identity/VERIFY-LOG.md", lines.join("\n") + "\n");
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("gate error:", e?.stack ?? e);
  uninstallWire();
  await cleanup().catch(() => undefined);
  process.exit(1);
});
