import { spawn, execSync, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// C23-ENGAGE acceptance — follow-up sequences, against the BUILT app, and
// DELIBERATELY PASSING WITH NO `RESEND_API_KEY` PRESENT. That constraint is the
// whole shape of this harness:
//
//   · the SERVER is started with no email credential at all, so every tick
//     driven over HTTP exercises the real no-credential path;
//   · the checks that need a configured transport run IN THIS PROCESS with an
//     INJECTED transport (`engageTick({ send })`) and a throwaway key set on
//     this process only — nothing is ever handed to Resend, and the assertion
//     for suppression is made AT THE TRANSPORT BOUNDARY (did the transport get
//     called at all) rather than on the ledger row.
//
// Verify list (spec §Verify):
//    1 sequence definitions well-formed; every step renders in BOTH locales;
//      no step references a merge field that does not exist
//    2 eligibility, including the explicit NEGATIVE case (`source: web`)
//    3 offsets honoured against an injected "as of"
//    4 idempotency: two ticks → one row per step; the unique constraint itself
//      refuses a duplicate insert
//    5 mid-sequence conversion: no "still thinking?" after signup
//    6 locale: ES → Spanish, EN → English, none → a defined default
//    7 suppression: SUPPRESSED and NO send attempted (transport boundary)
//    8 the unsubscribe route: one click, both languages, idempotent, forged
//      token neither unsubscribes anyone nor 500s
//    9 kill-switch: gate closed → SKIPPED with a reason; global pause → same
//   10 NO-CREDENTIAL: every due step UNCONFIGURED, nothing thrown, and the
//      rows STILL RE-SENDABLE once configured (the point of the seam)
//   11 money/reward-language scanner over both catalogs and every rendered
//      message; every message carries an unsubscribe link
//   12 AuditEvent rows are metadata only
//   13 admin: history + queue + dry-run for the allowlist, 404 otherwise, and
//      the dry-run writes NOTHING
//
// Self-cleaning: throwaway prospects, one throwaway tenant, two throwaway
// practitioners, and the two switch rows are all removed at the end.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/engage/verify.ts

const PORT = 3129;
const BASE = `http://localhost:${PORT}`;
const PLATFORM_DOMAIN = "platform.test";
const DEFAULT_TENANT_ID = "tnt_valentina_000000001";
const JOBS_SECRET = "engage-verify-jobs-secret";

const ADMIN_EMAIL = "engage-admin@fixture.test";
const STRANGER_EMAIL = "engage-stranger@fixture.test";
const PASSWORD = "engage-probe-2026";
const PROBE_TENANT_SLUG = "engprobe";

// One fixed clock for the whole run; every tick states its own "as of".
const T0 = new Date(Date.now() - 60_000);
const DAY = 86_400_000;
const asOfT0 = T0.toISOString();
const asOfT3 = new Date(T0.getTime() + 3 * DAY).toISOString();
const asOfT10 = new Date(T0.getTime() + 10 * DAY).toISOString();

// ---- fixtures -------------------------------------------------------------
const P = {
  leadEn: { email: "engage-lead-en@fixture.test", name: "Rosalind Ashworth-Blake", code: "ENGLEDEN", locale: "en" },
  leadEs: { email: "engage-lead-es@fixture.test", name: "Ximena Alcántara", code: "ENGLEDES", locale: "es" },
  leadWeb: { email: "engage-lead-web@fixture.test", name: "Web Only Lead", code: "ENGLEDWB", locale: "en" },
  leadNoLocale: { email: "engage-lead-nolocale@fixture.test", name: "Thaddeus Okonkwo", code: "ENGLEDNL", locale: null },
  unsubbed: { email: "engage-unsubbed@fixture.test", name: "Priya Raghunathan", code: "ENGUNSUB", locale: "en" },
  signedUp: { email: "engage-signedup@fixture.test", name: "Ingrid Halvorsen", code: "ENGSIGND", locale: "en" },
  converter: { email: "engage-converter@fixture.test", name: "Mattias Lindqvist", code: "ENGCONVR", locale: "en" },
  unsubProbe: { email: "engage-unsub-probe@fixture.test", name: "Delphine Marchetti", code: "ENGUNSPR", locale: "en" },
  // Seeded LATE, after the sequences have run for everyone else: the only way
  // to prove "unsubscribes mid-sequence and is suppressed from then on" is on
  // a prospect whose later steps have not already been sent.
  lateUnsub: { email: "engage-late-unsub@fixture.test", name: "Cornelius Abernathy", code: "ENGLATEU", locale: "en" },
  // Seeded late and never ticked, so the admin queue has something in it.
  queueProbe: { email: "engage-queue-probe@fixture.test", name: "Solveig Bjørnstad", code: "ENGQUEUE", locale: "en" },
} as const;

const PROBE_EMAILS = [ADMIN_EMAIL, STRANGER_EMAIL, ...Object.values(P).map((p) => p.email)];

const results: { name: string; pass: boolean; note?: string }[] = [];
const report: string[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  const line = `- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`;
  console.log(line);
  report.push(line);
}
function section(title: string) {
  console.log(`\n## ${title}`);
  report.push(`\n## ${title}`);
}

async function cleanup() {
  const rows = await prisma.practitionerProspect
    .findMany({ where: { email: { in: PROBE_EMAILS } }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await prisma.prospectMessage.deleteMany({ where: { prospectId: { in: ids } } }).catch(() => {});
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } }).catch(() => {});
  }
  const t = await prisma.tenant.findFirst({ where: { slug: PROBE_TENANT_SLUG } }).catch(() => null);
  if (t) {
    await prisma.auditEvent.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: { in: PROBE_EMAILS } } }).catch(() => {});
  await prisma.practitionerProspect.deleteMany({ where: { email: { in: PROBE_EMAILS } } }).catch(() => {});
  await prisma.practiceSetting.deleteMany({ where: { key: { in: ["engageEnabled", "engagePaused"] } } }).catch(() => {});
}

async function setSwitch(key: string, value: "on" | "off") {
  await prisma.practiceSetting.upsert({
    where: { tenantId_key: { tenantId: DEFAULT_TENANT_ID, key } },
    create: { tenantId: DEFAULT_TENANT_ID, key, value },
    update: { value },
  });
}

async function httpTick(asOf: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}/api/jobs/tick?only=engage&asOf=${encodeURIComponent(asOf)}&secret=${JOBS_SECRET}`);
  return { status: res.status, body: await res.text() };
}

async function ledger(email: string) {
  const p = await prisma.practitionerProspect.findUnique({ where: { email }, select: { id: true } });
  if (!p) return [];
  return await prisma.prospectMessage.findMany({
    where: { prospectId: p.id },
    orderBy: [{ sequenceKey: "asc" }, { scheduledFor: "asc" }],
  });
}
async function ledgerCount(): Promise<number> {
  const ids = (await prisma.practitionerProspect.findMany({
    where: { email: { in: PROBE_EMAILS } },
    select: { id: true },
  })).map((r) => r.id);
  return await prisma.prospectMessage.count({ where: { prospectId: { in: ids } } });
}
function keysOf(rows: { sequenceKey: string; stepKey: string; status: string }[]): string {
  return rows.map((r) => `${r.sequenceKey}/${r.stepKey}=${r.status}`).join(" ");
}

async function signIn(email: string, password: string, host: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => {
    for (const c of sc) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": host } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "x-forwarded-host": host, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// Verify item 11 — the money/reward-language scanner, REUSED VERBATIM from
// audits/referral/verify.ts (extended there for C23-REFERRAL). Every template
// in both languages runs through it: founding-partner recognition only, no
// unratified price and no promised reward.
const MONEY = [
  /\$\s?\d/, /\bUSD\b/, /\bfree\b/i, /\bgratis\b/i, /\bsin costo\b/i, /\bper month\b/i, /\/mo\b/, /\bal mes\b/i,
  /\bearn(s|ed|ing)?\b/i, /\breward(s|ed|ing)?\b/i, /\bcommission(s)?\b/i, /\bbonus(es)?\b/i,
  /\bdiscount(s|ed)?\b/i, /\bcredit(s|ed)?\b/i,
  /\bgana(r|s|n)?\b/i, /\brecompensa(s)?\b/i, /\bcomisi[oó]n(es)?\b/i, /\bbono(s)?\b/i,
  /\bdescuento(s)?\b/i, /\bcr[eé]dito(s)?\b/i,
];
function moneyHit(text: string): RegExp | undefined {
  return MONEY.find((re) => re.test(text));
}

type SentMail = { to: string; subject: string; text: string; html: string };

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  // The premise of this whole harness, asserted rather than assumed.
  const keyPresent = Boolean(process.env.RESEND_API_KEY);
  await cleanup();

  console.log(`~ starting built app on :${PORT} (NO email credential in its environment)`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(PORT),
    PLATFORM_DOMAIN,
    AUTH_TRUST_HOST: "true",
    PLATFORM_ADMIN_EMAILS: ADMIN_EMAIL,
    JOBS_SECRET,
  };
  delete (env as Record<string, unknown>).RESEND_API_KEY;
  delete (env as Record<string, unknown>).NOTIFY_FROM_EMAIL;
  delete (env as Record<string, unknown>).ENGAGE_ENABLED;
  delete (env as Record<string, unknown>).ENGAGE_PAUSED;
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFY_FROM_EMAIL;
  delete process.env.ENGAGE_ENABLED;
  delete process.env.ENGAGE_PAUSED;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const { emailConfigured } = await import("../../lib/notify");
    const engage = await import("../../lib/engage");
    const cfg = await import("../../lib/engage-config");
    const seq = await import("../../lib/engage-sequences");
    const tpl = await import("../../lib/engage-templates");
    const enCat = (await import("../../messages/en/engage.json")).default.engage;
    const esCat = (await import("../../messages/es/engage.json")).default.engage;

    section("0. the premise");
    check("no RESEND_API_KEY is present in this environment", !keyPresent, keyPresent ? "A KEY IS SET — this run does not prove the seam" : "absent, as the spec requires");
    check("emailConfigured() is false, so the seam is the path under test", emailConfigured() === false);

    // ---------------------------------------------------------------- 1 ----
    section("1. sequence definitions are well-formed");
    check("exactly the two specified sequences ship", seq.SEQUENCES.length === 2 && Boolean(seq.sequenceByKey("event-lead")) && Boolean(seq.sequenceByKey("founding-welcome")),
      seq.SEQUENCES.map((s) => `${s.key}(${s.steps.length})`).join(", "));
    check("event-lead has THREE steps at +0/+3/+10 days",
      JSON.stringify(seq.sequenceByKey("event-lead")!.steps.map((s) => s.offsetDays)) === "[0,3,10]",
      JSON.stringify(seq.sequenceByKey("event-lead")!.steps.map((s) => `${s.key}+${s.offsetDays}`)));
    check("founding-welcome has TWO steps at +0/+7 days",
      JSON.stringify(seq.sequenceByKey("founding-welcome")!.steps.map((s) => s.offsetDays)) === "[0,7]",
      JSON.stringify(seq.sequenceByKey("founding-welcome")!.steps.map((s) => `${s.key}+${s.offsetDays}`)));
    check("step keys are unique within each sequence",
      seq.SEQUENCES.every((s) => new Set(s.steps.map((x) => x.key)).size === s.steps.length));

    const vars = {
      firstName: "Probe", referralCode: "PROBECODE",
      signupUrl: "https://platform.test/signup?src=engage&ref=PROBECODE",
      portalUrl: "https://engprobe.platform.test",
      unsubscribeUrl: "https://platform.test/unsubscribe/probe.token",
    };
    for (const s of seq.SEQUENCES) {
      for (const step of s.steps) {
        for (const locale of ["en", "es"] as const) {
          check(`${s.key}/${step.key} has a template in ${locale}`, tpl.templateExists(locale, step.templateKey), step.templateKey);
          const bad = tpl.templatePlaceholders(locale, step.templateKey)
            .filter((ph) => !(cfg.MERGE_FIELDS as readonly string[]).includes(ph));
          check(`${s.key}/${step.key} (${locale}) references only real merge fields`, bad.length === 0, bad.join(",") || tpl.templatePlaceholders(locale, step.templateKey).join(","));
          const r = tpl.renderEngageMessage(locale, step.templateKey, vars);
          check(`${s.key}/${step.key} (${locale}) renders subject + heading + text`,
            r.subject.trim().length > 0 && r.heading.trim().length > 0 && r.text.trim().length > 40 && r.paragraphs.length > 0,
            `subject "${r.subject}" / ${r.text.length} chars of text`);
          check(`${s.key}/${step.key} (${locale}) leaves no unfilled placeholder`, !/\{[a-zA-Z]\w*\}/.test(r.text + r.subject + (r.button?.url ?? "")),
            (r.text.match(/\{[a-zA-Z]\w*\}/) ?? ["none"])[0]);
          check(`${s.key}/${step.key} (${locale}) carries the unsubscribe link`, r.text.includes(vars.unsubscribeUrl) && r.unsubscribe.url === vars.unsubscribeUrl);
        }
        // A step's EN and ES copy must actually differ — a "translation" that
        // is the English string is a parity failure that renders fine.
        const en = tpl.renderEngageMessage("en", step.templateKey, vars);
        const es = tpl.renderEngageMessage("es", step.templateKey, vars);
        check(`${s.key}/${step.key} EN and ES copy genuinely differ`, en.subject !== es.subject && en.paragraphs[0] !== es.paragraphs[0],
          `"${en.subject}" vs "${es.subject}"`);
      }
    }
    check("an unknown template key throws rather than sending an empty email",
      (() => { try { tpl.renderEngageMessage("en", "no-such-template", vars); return false; } catch { return true; } })());

    // ---------------------------------------------------------------- 2 ----
    section("2. eligibility (including the negative case)");
    const audFor = (status: string, source: string | null) => seq.sequencesFor({ status, source }).map((s) => s.key);
    check("an event- LEAD gets event-lead", JSON.stringify(audFor("LEAD", "event-sept23")) === '["event-lead"]', JSON.stringify(audFor("LEAD", "event-sept23")));
    check("a SIGNED_UP prospect gets founding-welcome", JSON.stringify(audFor("SIGNED_UP", "event-sept23")) === '["founding-welcome"]', JSON.stringify(audFor("SIGNED_UP", "event-sept23")));
    check("a NON-event LEAD (source: web) gets NEITHER", audFor("LEAD", "web").length === 0, JSON.stringify(audFor("LEAD", "web")));
    check("a LEAD with no source at all gets neither", audFor("LEAD", null).length === 0, JSON.stringify(audFor("LEAD", null)));
    check("a DECLINED prospect gets neither", audFor("DECLINED", "event-sept23").length === 0, JSON.stringify(audFor("DECLINED", "event-sept23")));

    // ---- seed the fixtures -------------------------------------------------
    const hash = await bcrypt.hash(PASSWORD, 10);
    const tenant = await prisma.tenant.create({
      data: {
        slug: PROBE_TENANT_SLUG, displayName: "Engage Probe Practice", status: "ACTIVE",
        layoutKey: "journey-v1", skinKey: "warm-clay", branding: { portalTitle: "Engage Probe Practice" },
      },
    });
    await prisma.tenantBilling.create({ data: { tenantId: tenant.id, plan: "FOUNDING_COMP", status: "ACTIVE" } });
    for (const [email, name] of [[ADMIN_EMAIL, "Engage Admin"], [STRANGER_EMAIL, "Engage Stranger"]] as const) {
      await prisma.user.create({
        data: { email, name, role: "PRACTITIONER", active: true, passwordHash: hash, mustChangePassword: false, tenantId: DEFAULT_TENANT_ID },
      });
    }
    const mk = async (p: { email: string; name: string; code: string; locale: string | null }, extra: Record<string, unknown>) =>
      await prisma.practitionerProspect.create({
        data: { name: p.name, email: p.email, referralCode: p.code, locale: p.locale, createdAt: T0, ...extra },
      });
    await mk(P.leadEn, { status: "LEAD", source: "event-sept23" });
    await mk(P.leadEs, { status: "LEAD", source: "event-sept23" });
    await mk(P.leadWeb, { status: "LEAD", source: "web" });
    await mk(P.leadNoLocale, { status: "LEAD", source: "event-sept23" });
    await mk(P.unsubbed, { status: "LEAD", source: "event-sept23", unsubscribedAt: T0 });
    await mk(P.signedUp, { status: "SIGNED_UP", source: "event-sept23", convertedAt: T0, tenantId: tenant.id });
    await mk(P.converter, { status: "LEAD", source: "event-sept23" });
    await mk(P.unsubProbe, { status: "LEAD", source: "event-sept23" });

    // ---------------------------------------------------------------- 3 ----
    section("3. scheduling honours the offsets against an injected as-of");
    const plan0 = await engage.planEngage({ asOf: T0 });
    const dueFor = (steps: typeof plan0.steps, email: string) =>
      steps.filter((s) => s.email === email && s.due).map((s) => `${s.sequenceKey}/${s.stepKey}`);
    check("at as-of = T0 the event LEAD's step 1 is due", JSON.stringify(dueFor(plan0.steps, P.leadEn.email)) === '["event-lead/thanks"]', JSON.stringify(dueFor(plan0.steps, P.leadEn.email)));
    check("at as-of = T0 step 2 (+3 days) is NOT due", !dueFor(plan0.steps, P.leadEn.email).includes("event-lead/what-it-does"));
    const plan3 = await engage.planEngage({ asOf: new Date(T0.getTime() + 3 * DAY) });
    check("at as-of = T0+3d step 2 IS due", dueFor(plan3.steps, P.leadEn.email).includes("event-lead/what-it-does"), JSON.stringify(dueFor(plan3.steps, P.leadEn.email)));
    check("at as-of = T0+3d step 3 (+10 days) is still NOT due", !dueFor(plan3.steps, P.leadEn.email).includes("event-lead/last-note"));
    const plan10 = await engage.planEngage({ asOf: new Date(T0.getTime() + 10 * DAY) });
    check("at as-of = T0+10d all three steps are due", dueFor(plan10.steps, P.leadEn.email).length === 3, JSON.stringify(dueFor(plan10.steps, P.leadEn.email)));
    check("the SIGNED_UP prospect's welcome is due immediately", dueFor(plan0.steps, P.signedUp.email).includes("founding-welcome/welcome"), JSON.stringify(dueFor(plan0.steps, P.signedUp.email)));
    check("the SIGNED_UP prospect's check-in (+7d) is not due at T0", !dueFor(plan0.steps, P.signedUp.email).includes("founding-welcome/check-in"));
    check("the NON-event LEAD is planned NOTHING at any as-of",
      dueFor(plan0.steps, P.leadWeb.email).length === 0 && plan10.steps.filter((s) => s.email === P.leadWeb.email).length === 0,
      "web-sourced lead never enters a sequence");

    // ---------------------------------------------------------------- 9 ----
    section("9. kill-switch and global pause (over HTTP, real tick)");
    const unauth = await fetch(`${BASE}/api/jobs/tick?only=engage`);
    check("the tick refuses an unauthenticated caller", unauth.status === 401, `status ${unauth.status}`);

    await prisma.practiceSetting.deleteMany({ where: { key: { in: ["engageEnabled", "engagePaused"] } } });
    const closedTick = await httpTick(asOfT0);
    check("with NO switch row at all the gate is CLOSED by default", closedTick.status === 200 && /gate=closed/.test(closedTick.body), closedTick.body.slice(0, 220));
    const closedRows = await prisma.prospectMessage.findMany({
      where: { prospectId: { in: (await prisma.practitionerProspect.findMany({ where: { email: { in: PROBE_EMAILS } }, select: { id: true } })).map((r) => r.id) } },
    });
    const closedNonSuppressed = closedRows.filter((r) => r.status !== "SUPPRESSED");
    check("with the gate closed a full tick SENDS NOTHING", closedRows.every((r) => r.status !== "SENT"), keysOf(closedRows));
    check("…and records SKIPPED with a reason for every due step",
      closedNonSuppressed.length > 0 && closedNonSuppressed.every((r) => r.status === "SKIPPED" && r.reason === "engine-gate-closed"),
      `${closedNonSuppressed.length} rows, reason ${closedNonSuppressed[0]?.reason}`);
    check("…and the unsubscribed prospect is SUPPRESSED even with the gate closed",
      (await ledger(P.unsubbed.email)).every((r) => r.status === "SUPPRESSED" && r.reason === "prospect-unsubscribed"),
      keysOf(await ledger(P.unsubbed.email)));

    await setSwitch("engageEnabled", "on");
    await setSwitch("engagePaused", "on");
    const pausedTick = await httpTick(asOfT0);
    check("with the gate OPEN but the global pause ON the tick still sends nothing",
      pausedTick.status === 200 && /gate=open/.test(pausedTick.body) && /paused=true/.test(pausedTick.body), pausedTick.body.slice(0, 220));
    const pausedRows = (await ledger(P.leadEn.email));
    check("…and records SKIPPED with the pause as its reason",
      pausedRows.length === 1 && pausedRows[0].status === "SKIPPED" && pausedRows[0].reason === "globally-paused",
      keysOf(pausedRows));
    check("…re-deciding a step did NOT create a second ledger row", pausedRows.length === 1, `${pausedRows.length} row(s)`);

    // --------------------------------------------------------------- 10 ----
    section("10. no-credential behaviour (the seam)");
    await setSwitch("engagePaused", "off");
    const beforeUnconfigured = await ledgerCount();
    const unconfTick = await httpTick(asOfT0);
    check("a full tick with no email credential returns 200 and throws nothing",
      unconfTick.status === 200 && !/error/.test(unconfTick.body), unconfTick.body.slice(0, 220));
    check("the tick reports itself as unconfigured", /configured=false/.test(unconfTick.body));
    const dueEmails = [P.leadEn.email, P.leadEs.email, P.leadNoLocale.email, P.signedUp.email, P.converter.email, P.unsubProbe.email];
    let unconfOk = true;
    let unconfDetail = "";
    for (const email of dueEmails) {
      const rows = await ledger(email);
      const ok = rows.length > 0 && rows.every((r) => r.status === "UNCONFIGURED" && r.reason === "email-not-configured");
      if (!ok) { unconfOk = false; unconfDetail += `${email}: ${keysOf(rows)} `; }
    }
    check("EVERY due step for EVERY eligible prospect records UNCONFIGURED", unconfOk, unconfDetail || `${dueEmails.length} prospects, all UNCONFIGURED`);
    const unconfAll = await prisma.prospectMessage.findMany({
      where: { prospectId: { in: (await prisma.practitionerProspect.findMany({ where: { email: { in: PROBE_EMAILS } }, select: { id: true } })).map((r) => r.id) } },
    });
    check("no UNCONFIGURED row claims a sentAt", unconfAll.filter((r) => r.status === "UNCONFIGURED").every((r) => r.sentAt === null));
    check("nothing anywhere is marked SENT", unconfAll.every((r) => r.status !== "SENT"), keysOf(unconfAll));
    check("the ledger did not grow by re-deciding SKIPPED rows into UNCONFIGURED",
      (await ledgerCount()) === beforeUnconfigured, `${beforeUnconfigured} → ${await ledgerCount()} rows`);

    // ---------------------------------------------------------------- 4 ----
    section("4. idempotency");
    const beforeSecond = await ledgerCount();
    await httpTick(asOfT0);
    const afterSecond = await ledgerCount();
    check("two ticks for the same as-of produce exactly ONE ledger row per step",
      afterSecond === beforeSecond, `${beforeSecond} → ${afterSecond} rows`);
    const perStep = await prisma.prospectMessage.groupBy({
      by: ["prospectId", "sequenceKey", "stepKey"],
      where: { prospectId: { in: (await prisma.practitionerProspect.findMany({ where: { email: { in: PROBE_EMAILS } }, select: { id: true } })).map((r) => r.id) } },
      _count: { _all: true },
    });
    check("no (prospect, sequence, step) triple has more than one row",
      perStep.every((g) => g._count._all === 1), `${perStep.length} distinct steps, max ${Math.max(...perStep.map((g) => g._count._all))}`);
    // …and the constraint itself, not the application's care, is what refuses it.
    const dupRow = (await ledger(P.leadEn.email))[0];
    let dupCode = "none";
    try {
      await prisma.prospectMessage.create({
        data: {
          prospectId: dupRow.prospectId, sequenceKey: dupRow.sequenceKey, stepKey: dupRow.stepKey,
          locale: dupRow.locale, status: "PENDING", scheduledFor: dupRow.scheduledFor,
        },
      });
    } catch (e) {
      dupCode = (e as { code?: string }).code ?? "thrown";
    }
    check("the UNIQUE constraint itself refuses a duplicate insert", dupCode === "P2002", `prisma error ${dupCode}`);

    // ------------------------------------------------------- 6, 7, 10b, 11 --
    section("6/7/10b. a CONFIGURED transport — injected, never Resend");
    // A throwaway credential on THIS process only (the server still has none)
    // plus an injected transport: nothing leaves this machine, and the
    // suppression assertion is made at the boundary itself.
    process.env.RESEND_API_KEY = "engage-verify-not-a-real-key";
    process.env.NOTIFY_FROM_EMAIL = "engage-verify@fixture.test";
    check("emailConfigured() now reports true for this process", emailConfigured() === true);

    const outbox: SentMail[] = [];
    const spy = (async (args: { to: string; subject: string; text: string; envelope?: unknown }) => {
      const { renderEnvelope } = await import("../../emails/envelope");
      const e = args.envelope as Record<string, unknown> | undefined;
      const rendered = e
        ? renderEnvelope({
            locale: (e.locale as "en" | "es") ?? "en",
            heading: (e.heading as string) ?? args.subject,
            paragraphs: (e.paragraphs as string[]) ?? [args.text],
            preheader: e.preheader as string | undefined,
            button: e.button as { label: string; url: string } | null,
            signoff: e.signoff as string | undefined,
            unsubscribe: e.unsubscribe as { label: string; url: string } | null,
          })
        : { html: "", text: args.text };
      outbox.push({ to: args.to, subject: args.subject, text: rendered.text || args.text, html: rendered.html });
      return { ok: true };
    }) as unknown as typeof import("../../lib/notify").sendEmail;

    const beforeConfigured = await ledgerCount();
    const sentTick = await engage.engageTick({ asOf: T0, send: spy });
    const afterConfigured = await ledgerCount();
    check("THE SEAM: the UNCONFIGURED rows were still re-sendable — they now send",
      sentTick.counts.SENT === dueEmails.length, `SENT ${sentTick.counts.SENT} of ${dueEmails.length} due prospects`);
    check("…and no prospect was permanently marked as messaged by the empty tick: NO new rows",
      afterConfigured === beforeConfigured, `${beforeConfigured} → ${afterConfigured} rows`);
    const sentRows = await ledger(P.leadEn.email);
    check("…the once-UNCONFIGURED row is now SENT with a sentAt", sentRows[0]?.status === "SENT" && sentRows[0]?.sentAt !== null, keysOf(sentRows));

    // item 7 — suppression AT THE TRANSPORT BOUNDARY
    check("SUPPRESSED: the unsubscribed prospect's step never reached the transport",
      !outbox.some((m) => m.to === P.unsubbed.email), `${outbox.length} transport calls, none to the unsubscribed address`);
    check("…and its ledger row says SUPPRESSED with a reason",
      (await ledger(P.unsubbed.email)).every((r) => r.status === "SUPPRESSED" && r.reason === "prospect-unsubscribed"),
      keysOf(await ledger(P.unsubbed.email)));
    check("the non-event LEAD never reached the transport either", !outbox.some((m) => m.to === P.leadWeb.email));
    check("an eligible prospect DID reach the transport (so the boundary check means something)",
      outbox.some((m) => m.to === P.leadEn.email), outbox.map((m) => m.to).join(", "));

    // item 6 — locale
    const mailTo = (email: string) => outbox.filter((m) => m.to === email);
    check("an EN prospect's message is English", mailTo(P.leadEn.email)[0]?.subject === enCat.templates.eventLeadThanks.subject, mailTo(P.leadEn.email)[0]?.subject);
    check("an ES prospect's message is Spanish", mailTo(P.leadEs.email)[0]?.subject === esCat.templates.eventLeadThanks.subject, mailTo(P.leadEs.email)[0]?.subject);
    check("a prospect with NO recorded locale gets the defined default (en), not an empty string",
      mailTo(P.leadNoLocale.email)[0]?.subject === enCat.templates.eventLeadThanks.subject &&
        (await ledger(P.leadNoLocale.email))[0]?.locale === "en",
      `${mailTo(P.leadNoLocale.email)[0]?.subject} / ledger locale ${(await ledger(P.leadNoLocale.email))[0]?.locale}`);
    check("engageLocale() never yields an empty locale, whatever it is handed",
      [null, undefined, "", "  ", "fr", "es-419", "EN", "zz"].every((v) => ["en", "es"].includes(cfg.engageLocale(v as string))),
      `defaults to ${cfg.DEFAULT_ENGAGE_LOCALE}`);
    check("the SIGNED_UP prospect's welcome carries their own portal address",
      mailTo(P.signedUp.email)[0]?.text.includes(`${PROBE_TENANT_SLUG}.${PLATFORM_DOMAIN}`),
      (mailTo(P.signedUp.email)[0]?.text.match(/https?:\/\/[^\s]+/) ?? ["none"])[0]);
    check("an event LEAD's message carries their referral code and the signup link",
      mailTo(P.leadEn.email)[0]?.text.includes(P.leadEn.code) && mailTo(P.leadEn.email)[0]?.text.includes("/signup?"),
      P.leadEn.code);

    // item 11b — every message carries a WORKING unsubscribe link
    let unsubOk = true;
    let unsubDetail = "";
    for (const m of outbox) {
      const inText = /\/unsubscribe\/[A-Za-z0-9_.-]+/.test(m.text);
      const inHtml = /<a href="[^"]*\/unsubscribe\/[A-Za-z0-9_.-]+"/.test(m.html);
      if (!inText || !inHtml) { unsubOk = false; unsubDetail += `${m.to}(text:${inText} html:${inHtml}) `; }
    }
    check("EVERY message carries an unsubscribe link in BOTH the text and the HTML part", unsubOk,
      unsubDetail || `${outbox.length} messages checked`);
    for (const m of outbox) {
      const hit = moneyHit(visibleText(m.html));
      if (hit) check(`rendered message to ${m.to} carries no reward/price language`, false, `matched ${hit}`);
    }
    check("no rendered message carries reward, price or earning language",
      !outbox.some((m) => moneyHit(visibleText(m.html))), `${outbox.length} messages scanned`);
    check("the plain-text part is mandatory and present on every message",
      outbox.every((m) => m.text.trim().length > 80), `shortest ${Math.min(...outbox.map((m) => m.text.length))} chars`);

    // a second configured tick must send nothing more
    const outboxAt = outbox.length;
    const again = await engage.engageTick({ asOf: T0, send: spy });
    check("a THIRD tick at the same as-of sends nothing more (SENT is terminal)",
      outbox.length === outboxAt && again.counts.SENT === 0, `${outbox.length - outboxAt} new transport calls`);
    check("…and still no new ledger rows", (await ledgerCount()) === afterConfigured, `${afterConfigured} → ${await ledgerCount()}`);

    // ---------------------------------------------------------------- 5 ----
    section("5. mid-sequence conversion");
    const conv = await prisma.practitionerProspect.findUnique({ where: { email: P.converter.email } });
    check("the converting prospect received event-lead step 1 while still a LEAD",
      (await ledger(P.converter.email)).some((r) => r.sequenceKey === "event-lead" && r.stepKey === "thanks" && r.status === "SENT"));
    await prisma.practitionerProspect.update({
      where: { id: conv!.id },
      data: { status: "SIGNED_UP", convertedAt: new Date(T0.getTime() + 1 * DAY), tenantId: tenant.id },
    });
    const convTick = await engage.engageTick({ asOf: new Date(T0.getTime() + 3 * DAY), send: spy });
    const convRows = await ledger(P.converter.email);
    check("after signup NO further event-lead step is ever created",
      !convRows.some((r) => r.sequenceKey === "event-lead" && r.stepKey !== "thanks"), keysOf(convRows));
    check("no 'still thinking it over' message reached the transport after signup",
      mailTo(P.converter.email).length === 2 &&
        !mailTo(P.converter.email).some((m) => m.subject === enCat.templates.eventLeadLastNote.subject || m.subject === enCat.templates.eventLeadWhatItDoes.subject),
      mailTo(P.converter.email).map((m) => m.subject).join(" | "));
    check("they DO pick up founding-welcome instead",
      convRows.some((r) => r.sequenceKey === "founding-welcome" && r.stepKey === "welcome" && r.status === "SENT"), keysOf(convRows));
    check("the welcome was anchored on conversion, not on capture",
      convRows.find((r) => r.stepKey === "welcome")!.scheduledFor.getTime() === T0.getTime() + 1 * DAY,
      convRows.find((r) => r.stepKey === "welcome")!.scheduledFor.toISOString());
    check("the still-LEAD prospect DID advance to step 2 at T0+3d",
      (await ledger(P.leadEn.email)).some((r) => r.stepKey === "what-it-does" && r.status === "SENT"), keysOf(await ledger(P.leadEn.email)));
    check("the tick at T0+3d reported its work", convTick.counts.SENT > 0, `SENT ${convTick.counts.SENT}`);

    const lastTick = await engage.engageTick({ asOf: new Date(T0.getTime() + 10 * DAY), send: spy });
    check("at T0+10d the last note goes out, and the sequence then stops",
      (await ledger(P.leadEn.email)).filter((r) => r.sequenceKey === "event-lead").length === 3, keysOf(await ledger(P.leadEn.email)));
    check("event-lead never produces a fourth step", lastTick.steps.every((s) => ["thanks", "what-it-does", "last-note", "welcome", "check-in"].includes(s.stepKey)));
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFY_FROM_EMAIL;
    check("the harness returned to the no-credential state for the remaining items", emailConfigured() === false);

    // ---------------------------------------------------------------- 8 ----
    section("8. the unsubscribe route");
    const probe = await prisma.practitionerProspect.findUnique({ where: { email: P.unsubProbe.email } });
    const token = cfg.unsubscribeToken(probe!.id);
    check("the token is unguessable (id + a 32-char HMAC) and single-purpose",
      token.startsWith(`${probe!.id}.`) && token.length === probe!.id.length + 33, `${token.length} chars`);
    check("a token minted for one prospect does not verify for another",
      cfg.prospectIdFromToken(`${(await prisma.practitionerProspect.findUnique({ where: { email: P.leadEn.email } }))!.id}.${token.split(".")[1]}`) === null);

    const first = await fetch(`${BASE}/unsubscribe/${token}`);
    const firstHtml = await first.text();
    const afterFirst = await prisma.practitionerProspect.findUnique({ where: { email: P.unsubProbe.email } });
    check("one click sets unsubscribedAt", first.status === 200 && afterFirst?.unsubscribedAt !== null,
      `status ${first.status}, unsubscribedAt ${afterFirst?.unsubscribedAt?.toISOString() ?? "NOT SET"}`);
    check("…and says so plainly in English", firstHtml.includes(enCat.page.doneHeading), enCat.page.doneHeading);
    const second = await fetch(`${BASE}/unsubscribe/${token}`);
    const secondHtml = await second.text();
    const afterSecond2 = await prisma.practitionerProspect.findUnique({ where: { email: P.unsubProbe.email } });
    check("a second click is idempotent — it changes nothing and says so",
      second.status === 200 && secondHtml.includes(enCat.page.alreadyHeading) &&
        afterSecond2?.unsubscribedAt?.getTime() === afterFirst?.unsubscribedAt?.getTime(),
      `status ${second.status}, timestamp unchanged: ${afterSecond2?.unsubscribedAt?.getTime() === afterFirst?.unsubscribedAt?.getTime()}`);
    const esRes = await fetch(`${BASE}/unsubscribe/${token}?lang=es`);
    const esHtml = await esRes.text();
    check("the route renders in Spanish too", esRes.status === 200 && esHtml.includes(esCat.page.alreadyHeading), esCat.page.alreadyHeading);
    for (const [label, html] of [["en", firstHtml], ["es", esHtml]] as const) {
      const hit = moneyHit(visibleText(html));
      check(`the unsubscribe page (${label}) carries no reward or price language`, !hit, hit ? `matched ${hit}` : "");
    }

    const unsubbedBefore = await prisma.practitionerProspect.count({ where: { email: { in: PROBE_EMAILS }, unsubscribedAt: { not: null } } });
    for (const [label, bad] of [
      ["forged signature", `${probe!.id}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`],
      ["unknown id", "clnonexistentprospectid000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      ["no signature", probe!.id],
      ["path traversal", "..%2F..%2Fetc%2Fpasswd"],
      ["empty-ish", "."],
    ] as const) {
      const res = await fetch(`${BASE}/unsubscribe/${bad}`);
      const html = res.status === 200 ? await res.text() : "";
      check(`a ${label} token does not 500`, res.status === 200 || res.status === 404, `status ${res.status}`);
      if (res.status === 200) {
        check(`a ${label} token renders the plain "not valid" page`, html.includes(enCat.page.invalidHeading));
      }
    }
    const unsubbedAfter = await prisma.practitionerProspect.count({ where: { email: { in: PROBE_EMAILS }, unsubscribedAt: { not: null } } });
    check("no forged or unknown token unsubscribed anybody", unsubbedAfter === unsubbedBefore, `${unsubbedBefore} → ${unsubbedAfter} unsubscribed`);

    // Suppression from then on, proven on a prospect seeded LATE so that its
    // later steps genuinely have not gone out yet.
    await mk(P.lateUnsub, { status: "LEAD", source: "event-sept23" });
    await httpTick(asOfT0);
    const lateBefore = await ledger(P.lateUnsub.email);
    check("the late prospect has step 1 recorded (and steps 2-3 not yet)",
      lateBefore.length === 1 && lateBefore[0].stepKey === "thanks", keysOf(lateBefore));
    const lateProspect = await prisma.practitionerProspect.findUnique({ where: { email: P.lateUnsub.email } });
    const lateRes = await fetch(`${BASE}/unsubscribe/${cfg.unsubscribeToken(lateProspect!.id)}`);
    check("the late prospect unsubscribes with one click mid-sequence", lateRes.status === 200 &&
      (await prisma.practitionerProspect.findUnique({ where: { email: P.lateUnsub.email } }))?.unsubscribedAt !== null,
      `status ${lateRes.status}`);
    const postUnsubTick = await httpTick(asOfT10);
    const lateRows = await ledger(P.lateUnsub.email);
    check("a prospect who unsubscribes mid-sequence is SUPPRESSED from then on — every remaining step",
      postUnsubTick.status === 200 && lateRows.length === 3 && lateRows.every((r) => r.status === "SUPPRESSED" && r.reason === "prospect-unsubscribed"),
      keysOf(lateRows));

    // --------------------------------------------------------------- 12 ----
    section("12. AuditEvent rows are metadata only");
    const prospectIds = (await prisma.practitionerProspect.findMany({ where: { email: { in: PROBE_EMAILS } }, select: { id: true } })).map((r) => r.id);
    const audits = await prisma.auditEvent.findMany({ where: { actorId: { in: prospectIds }, action: { in: ["engage-message", "engage-unsubscribe"] } } });
    check("every send decision is recorded as an AuditEvent", audits.length > 0, `${audits.length} rows`);
    check("every audit row carries a reason", audits.filter((a) => a.action === "engage-message").every((a) => Boolean(a.reason)));
    const blob = JSON.stringify(audits);
    const leaked = [
      ...PROBE_EMAILS,
      ...Object.values(P).map((p) => p.name),
      enCat.templates.eventLeadThanks.paragraphs[0],
      esCat.templates.eventLeadThanks.paragraphs[0],
      enCat.templates.eventLeadThanks.subject,
    ].filter((s) => blob.includes(s));
    check("no email address, name, subject or template body appears in the meta blob", leaked.length === 0, leaked.join(" | ") || "metadata only");
    check("the unsubscribe itself is audited", audits.some((a) => a.action === "engage-unsubscribe"));
    check("no engage audit row is left with a null tenantId (the stamp audit stays clean)",
      audits.every((a) => a.tenantId !== null), `${audits.filter((a) => a.tenantId === null).length} null-tenant rows`);

    // --------------------------------------------------------------- 13 ----
    section("13. the admin surface");
    // Seeded here and never ticked, so the queue has both a due-now step and
    // two upcoming ones to render.
    await mk(P.queueProbe, { status: "LEAD", source: "event-sept23" });
    const adminCookie = await signIn(ADMIN_EMAIL, PASSWORD, "localhost");
    const strangerCookie = await signIn(STRANGER_EMAIL, PASSWORD, "localhost");
    const adminRes = await fetch(`${BASE}/admin/prospects?q=engage-`, { headers: { Cookie: adminCookie } });
    const adminHtml = await adminRes.text();
    const adminText = visibleText(adminHtml);
    check("/admin/prospects renders for an allowlisted email", adminRes.status === 200, `status ${adminRes.status}`);
    check("the follow-up section renders", adminHtml.includes("Follow-up sequences") && adminHtml.includes("event-lead"));
    check("the kill-switch and pause state are shown", /Feature gate/.test(adminText) && /Global pause/.test(adminText) && /OPEN|CLOSED/.test(adminText),
      (adminText.match(/Feature gate [^·]{0,60}/) ?? ["not found"])[0].trim());
    const step = (name: string) => new RegExp(`event-lead\\s*/\\s*${name}`);
    check("the queue view renders what is due next (due now AND upcoming)",
      /Queue/.test(adminText) && /due now/.test(adminText) && /upcoming/.test(adminText) &&
        step("thanks").test(adminText) && step("last-note").test(adminText) && adminText.includes(P.queueProbe.email),
      (adminText.match(/due now[^|]{0,120}/) ?? ["not found"])[0].trim());
    check("per-prospect message history renders with status and reason",
      step("thanks").test(adminText) && /SENT|SUPPRESSED|UNCONFIGURED/.test(adminText) &&
        /prospect-unsubscribed|delivered-to-transport|email-not-configured/.test(adminText),
      (adminText.match(new RegExp(`event-lead\\s*/\\s*thanks\\s*[A-Z]+\\s*·?\\s*[a-z-]*`)) ?? ["not found"])[0].trim());
    const strangerRes = await fetch(`${BASE}/admin/prospects`, { headers: { Cookie: strangerCookie } });
    check("/admin/prospects 404s for a signed-in practitioner who is not allowlisted", strangerRes.status === 404, `status ${strangerRes.status}`);
    const anonRes = await fetch(`${BASE}/admin/prospects`, { redirect: "manual" });
    check("…and does not render for a signed-out visitor", anonRes.status !== 200, `status ${anonRes.status}`);

    const beforeDry = await prisma.prospectMessage.count();
    const beforeAudit = await prisma.auditEvent.count({ where: { action: "engage-message" } });
    const dryRes = await fetch(`${BASE}/admin/prospects?dryRun=1`, { headers: { Cookie: adminCookie } });
    const dryHtml = await dryRes.text();
    const afterDry = await prisma.prospectMessage.count();
    const afterAudit = await prisma.auditEvent.count({ where: { action: "engage-message" } });
    check("the dry-run renders what the next tick would do", dryRes.status === 200 && dryHtml.includes("what the next tick would do"), `status ${dryRes.status}`);
    check("the dry-run creates NO ledger rows", afterDry === beforeDry, `${beforeDry} → ${afterDry} ProspectMessage rows`);
    check("the dry-run creates NO audit rows either", afterAudit === beforeAudit, `${beforeAudit} → ${afterAudit} engage-message audit rows`);
    const dryStranger = await fetch(`${BASE}/admin/prospects?dryRun=1`, { headers: { Cookie: strangerCookie } });
    check("the dry-run 404s for a non-allowlisted practitioner", dryStranger.status === 404, `status ${dryStranger.status}`);

    // --------------------------------------------------------------- 11a ---
    section("11. the money / reward-language scanner over both catalogs");
    for (const locale of ["en", "es"] as const) {
      const raw = JSON.stringify((await import(`../../messages/${locale}/engage.json`)).default);
      const hit = moneyHit(raw);
      check(`messages/${locale}/engage.json carries no reward, price or earning language`, !hit, hit ? `matched ${hit}` : "");
    }
    for (const locale of ["en", "es"] as const) {
      for (const s of seq.SEQUENCES) {
        for (const step of s.steps) {
          const r = tpl.renderEngageMessage(locale, step.templateKey, vars);
          const hit = moneyHit([r.subject, r.heading, r.preheader, ...r.paragraphs, r.button?.label ?? ""].join(" "));
          check(`${s.key}/${step.key} (${locale}) passes the scanner`, !hit, hit ? `matched ${hit}` : "");
        }
      }
    }
    check("both catalogs expose exactly the same template keys (bilingual parity)",
      JSON.stringify(Object.keys(enCat.templates).sort()) === JSON.stringify(Object.keys(esCat.templates).sort()),
      Object.keys(enCat.templates).join(","));
    check("both catalogs expose the same unsubscribe + page keys",
      JSON.stringify(Object.keys(enCat.page).sort()) === JSON.stringify(Object.keys(esCat.page).sort()) &&
      JSON.stringify(Object.keys(enCat.unsubscribe).sort()) === JSON.stringify(Object.keys(esCat.unsubscribe).sort()));
  } finally {
    server.kill();
    await cleanup();
    console.log("~ probe prospects, tenant, practitioners and switch rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  const summary = failed === 0
    ? `\nENGAGE VERIFY PASS — ${results.length}/${results.length}`
    : `\n${failed} CHECK(S) FAILED — ${results.length - failed}/${results.length}`;
  console.log(summary);

  // Ruling 17 — a verify log is written BY the gate that produced it, or not
  // at all. This is that write.
  mkdirSync(join(__dirname), { recursive: true });
  writeFileSync(
    join(__dirname, "VERIFY-LOG.md"),
    [
      "# C23-ENGAGE — acceptance log",
      "",
      `Run: ${new Date().toISOString()} · \`npx tsx audits/engage/verify.ts\` against the BUILT app on :${PORT}`,
      `RESEND_API_KEY present: ${process.env.RESEND_API_KEY ? "YES (this run does NOT prove the seam)" : "no — the seam is the path under test"}`,
      "",
      ...report,
      summary,
      "",
    ].join("\n"),
  );
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none */ }
  });
