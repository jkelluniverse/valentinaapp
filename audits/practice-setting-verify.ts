/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "async_hooks";

// Next's request-scoped storage modules throw at load time if this global is
// absent, and lib/prisma.ts imports next/headers. Set it BEFORE anything that
// reaches into next — which is why every next-touching import below is
// dynamic and happens inside main().
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;

import { spawn, execFileSync, execSync, type ChildProcess } from "child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { chromium } from "playwright";
import { rawPrisma as prisma } from "../lib/prisma-internal";
import { SCOPED_MODELS, DEFAULT_TENANT_ID } from "../lib/tenancy/scope";
import { identitySelectFor, identitySelect, ModelIdentityError, type ModelMeta } from "../lib/tenancy/model-identity";
import { auditNullTenantRows } from "../lib/tenancy/stamp-audit";

// C25-PRACTICE-SETTING-TENANCY acceptance — the founding practitioner's portal.
//
// WHAT IS UNDER TEST, and why each half is load-bearing:
//
//   §1 the fail-closed ownership pre-check in lib/prisma.ts. Its select now
//      comes from the Prisma DMMF (lib/tenancy/model-identity.ts) instead of
//      being hardcoded to `{ id: true }`, and it can NEVER be skipped: a model
//      whose identity cannot be derived makes the write THROW. The same
//      section corrected what `upsert` is checked for — "the row is somebody
//      else's" is refused, "there is no row yet" is the create branch.
//   §2 PracticeSetting's identity: `id` primary key + UNIQUE (tenantId, key),
//      migration 49, and lib/practice-settings.ts as the one place that
//      addresses a setting by its unique key.
//   §3 the practitioner path end to end, in a REAL BROWSER against the BUILT
//      app, on the practitioner's OWN host, for a practice created by the
//      REAL signup service.
//
// Verify list (spec §Verify): 1 the five assumptions · 2 the reproduction
// before and after · 3 a real request on its own host · 4 two practices, same
// key, isolated · 5 a real-signup practitioner · 6 the engage switches
// (ruling 19) · 7 Valentina's rows survive the migration · 8 fail-closed
// preserved · 9 the migration is counted, idempotent and reversible.
// Items 10–11 are whole-gate/regression conditions run as separate gates —
// see docs/reports/outbox/BUILD-REPORT-C25-PRACTICE-SETTING-TENANCY.md.
//
// HOW THE "BEFORE" IN ITEM 2 IS DEMONSTRATED, stated plainly because it
// cannot be re-run in this process: the pre-fix behaviour was reproduced live
// at HEAD (a6c8bd8) before any edit, and the exact error is quoted in the
// build report. What this gate can and does prove mechanically is that the
// two ingredients of that failure are gone — HEAD's pre-check hardcoded
// `select: { id: true }` and HEAD's PracticeSetting had `key String @id` with
// no `id` column (both read out of git here) — that a select of a column a
// model does not have is still a Prisma VALIDATION error (demonstrated live),
// and that the same write now succeeds.
//
// Self-cleaning: two throwaway practices on `psxprobe*` slugs, probe settings
// under `psxProbe*` keys, and the harness asserts it leaves zero null-tenant
// rows behind.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/practice-setting-verify.ts

const PORT = 3141;
const BASE = `http://localhost:${PORT}`;
const PLATFORM_DOMAIN = "psx.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

const SLUG_A = "psxprobea";
const SLUG_B = "psxprobeb";
const HOST_A = `${SLUG_A}.${PLATFORM_DOMAIN}`;
const HOST_B = `${SLUG_B}.${PLATFORM_DOMAIN}`;
const EMAIL_A = "psx-probe-a@fixture.test";
const EMAIL_B = "psx-probe-b@fixture.test";
const PASSWORD = "psx-probe-pass-2026";
const PROBE_KEY = "psxProbeSharedKey";
const PROBE_KEY_2 = "psxProbeSecondKey";

// Rows that stand in for Valentina's production settings for item 7. Real
// keys with real values, on the DEFAULT tenant, asserted byte-for-byte
// through the migration's reversal and re-application.
const VALENTINA_ROWS: [string, string][] = [
  ["psxProbeAssistNotify", "off"],
  ["psxProbeMethodText", "Hold the tension between belonging and sovereignty."],
  ["psxProbeAwayNote", "Back Monday. Urgent matters: call the office."],
];

const MIGRATION = "prisma/migrations/49_practice_setting_tenancy/migration.sql";

// The reversal EXACTLY as migration 49's own comment documents it. Kept in one
// place so the gate can prove both that it works and that it refuses when the
// old single-practice shape can no longer represent the data.
const REVERSAL_SQL = `DO $reverse$
BEGIN
  ALTER TABLE "PracticeSetting" DROP CONSTRAINT IF EXISTS "PracticeSetting_tenantId_key_key";
  DROP INDEX IF EXISTS "PracticeSetting_tenantId_key_key";
  UPDATE "PracticeSetting" t SET "tenantId" = NULL
    FROM "_PracticeSettingTenancy49" b WHERE b.id_assigned = t."id";
  ALTER TABLE "PracticeSetting" DROP CONSTRAINT IF EXISTS "PracticeSetting_pkey";
  ALTER TABLE "PracticeSetting" ADD CONSTRAINT "PracticeSetting_pkey" PRIMARY KEY ("key");
  ALTER TABLE "PracticeSetting" DROP COLUMN "id";
  DROP TABLE "_PracticeSettingTenancy49";
END $reverse$;`;

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

const p: any = prisma;
// The "BEFORE" archaeology is pinned to the last pre-fix commit, not HEAD:
// this gate was written against an uncommitted working tree (where HEAD *was*
// the pre-fix state), and once the fix is committed a HEAD reference would
// make every BEFORE check permanently unpassable. a6c8bd8 is the commit the
// header names — the defect's documented resting place.
const PRE_FIX_COMMIT = "a6c8bd8";
const gitShow = (path: string) =>
  execFileSync("git", ["show", `${PRE_FIX_COMMIT}:${path}`], { encoding: "utf8", cwd: process.cwd() });
const psql = (sql: string): string =>
  execFileSync("psql", [process.env.DATABASE_URL ?? "", "-v", "ON_ERROR_STOP=1", "-tAc", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/** Every row, as an order-independent fingerprint of (key, value, owner). */
async function settingsFingerprint(): Promise<string> {
  const rows = (await p.practiceSetting.findMany({
    select: { key: true, value: true, tenantId: true },
  })) as any[];
  // The ONE row the migration deliberately re-owns (null → default tenant) is
  // asserted separately; every other row must be identical, owner included.
  return rows
    .filter((r: any) => r.key !== "psxProbeLegacyNull")
    .map((r: any) => `${r.key}${r.value}${r.tenantId ?? "<null>"}`)
    .sort()
    .join("");
}

async function dropTenant(slug: string) {
  const t = await p.tenant.findFirst({ where: { slug } }).catch(() => null);
  if (!t) return;
  for (const model of SCOPED_MODELS) {
    await p[model].deleteMany({ where: { tenantId: t.id } }).catch(() => undefined);
  }
  await p.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => undefined);
  await p.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => undefined);
  await p.tenant.delete({ where: { id: t.id } }).catch(() => undefined);
}

async function cleanup() {
  await p.practiceSetting.deleteMany({ where: { key: { startsWith: "psxProbe" } } }).catch(() => undefined);
  for (const slug of [SLUG_A, SLUG_B]) await dropTenant(slug);
  await p.practitionerProspect.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }).catch(() => undefined);
  await p.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  log(`# C25-PRACTICE-SETTING-TENANCY verify — ${new Date().toISOString()}`);
  await cleanup();

  // =========================================================================
  log(`\n## Verify 1 — the five assumptions, confirmed or corrected`);
  // =========================================================================

  // A1 — the sweep the spec asks for, over ALL scoped models.
  const dmmf = (await import("@prisma/client")).Prisma.dmmf;
  const dk = (n: string) => n.charAt(0).toLowerCase() + n.slice(1);
  const byKey = new Map(dmmf.datamodel.models.map((m: any) => [dk(m.name), m]));
  const noIdColumn: string[] = [];
  const pkNotId: string[] = [];
  for (const s of SCOPED_MODELS) {
    const m: any = byKey.get(s);
    if (!m) throw new Error(`scoped model ${s} is missing from the DMMF`);
    if (!m.fields.some((f: any) => f.name === "id")) noIdColumn.push(m.name);
    const pk = m.fields.find((f: any) => f.isId);
    if (!pk || pk.name !== "id") pkNotId.push(`${m.name}(pk=${pk?.name ?? "compound"})`);
  }
  check(
    `A1 — the ${SCOPED_MODELS.length}-model sweep: no scoped model lacks an \`id\` column, and none is keyed by anything else`,
    SCOPED_MODELS.length === 79 && noIdColumn.length === 0 && pkNotId.length === 0,
    `${SCOPED_MODELS.length} models swept · no-id: ${noIdColumn.join(", ") || "none"} · pk≠id: ${pkNotId.join(", ") || "none"}`,
  );
  // The same sweep against HEAD's schema — which is what the assumption was
  // actually about. PracticeSetting was the only one, so the spec's blast
  // radius was right.
  const headSchema = gitShow("prisma/schema.prisma");
  const headModels = [...headSchema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1], body: m[2] }));
  const headNoId = headModels
    .filter((m) => SCOPED_MODELS.includes(dk(m.name) as any))
    .filter((m) => !/^\s*id\s+/m.test(m.body))
    .map((m) => m.name);
  check(
    "A1 — CONFIRMED at HEAD too: `PracticeSetting` was the ONLY scoped model with no `id` column, so the blast radius was exactly as the spec assumed",
    headNoId.length === 1 && headNoId[0] === "PracticeSetting",
    `HEAD scoped models with no id column: ${headNoId.join(", ") || "none"}`,
  );
  check(
    "A1 — and the pre-check no longer hardcodes a key: HEAD selected `{ id: true }`, the current file derives it from the DMMF and cannot skip the check",
    /select:\s*\{\s*id:\s*true\s*\}/.test(gitShow("lib/prisma.ts")) &&
      !/select:\s*\{\s*id:\s*true\s*\}/.test(readFileSync("lib/prisma.ts", "utf8")) &&
      readFileSync("lib/prisma.ts", "utf8").includes("identitySelect(model)"),
    "HEAD: `select: { id: true }` present · now: identitySelect(model), which THROWS when it cannot derive one",
  );

  // A2 — the PK and the uniqueness constraints, read from the live catalog.
  const headPs = headModels.find((m) => m.name === "PracticeSetting")!;
  const headUniques = (headPs.body.match(/@unique|@@unique|@id|@@id/g) ?? []).sort().join(",");
  check(
    "A2 — CONFIRMED: at HEAD `key` was the primary key AND the only uniqueness constraint on the table (no @unique, no @@unique, no @@id)",
    headUniques === "@id",
    `HEAD constraint annotations on PracticeSetting: ${headUniques}`,
  );
  const liveIdx = psql(
    `select string_agg(i.indexname, ' | ' order by i.indexname) from pg_indexes i where i.tablename = 'PracticeSetting'`,
  );
  const livePk = psql(
    `select string_agg(a.attname, ',' order by a.attnum) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum = any(c.conkey) where c.conrelid='"PracticeSetting"'::regclass and c.contype='p'`,
  );
  check(
    "A2 — and it is now (tenantId, key): primary key on `id`, one unique index on (tenantId, key)",
    livePk === "id" && /PracticeSetting_tenantId_key_key/.test(liveIdx),
    `pk=(${livePk}) · indexes: ${liveIdx}`,
  );

  // A3 — the call sites, counted, and the claim that they used `where: { key }`.
  const srcFiles: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (["node_modules", ".next", ".git"].includes(e)) continue;
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e)) srcFiles.push(full);
    }
  };
  for (const d of ["app", "lib", "audits", "prisma", "scripts", "components"]) {
    try {
      walk(d);
    } catch {
      /* absent */
    }
  }
  const headTouching = new Set<string>();
  const headWriteSites: string[] = [];
  for (const f of srcFiles) {
    let head = "";
    try {
      head = gitShow(f);
    } catch {
      continue; // new in this build
    }
    if (!/practiceSetting\./.test(head)) continue;
    headTouching.add(f);
    for (const m of head.matchAll(/practiceSetting\.(upsert|update|delete|findUnique|findUniqueOrThrow)\b/g)) {
      headWriteSites.push(`${f}:${m[1]}`);
    }
  }
  const headByKey = headWriteSites.length;
  const headUpserts = headWriteSites.filter((s) => s.endsWith(":upsert")).length;
  check(
    "A3 — CORRECTED, and upward: the spec's \"roughly ten\" write paths is right for `upsert` alone, but the unique-key surface is larger",
    headUpserts >= 9 && headByKey > headUpserts,
    `at HEAD: ${headUpserts} \`upsert\` sites and ${headByKey} unique-key call sites in total (upsert/update/delete/findUnique) across ${headTouching.size} files — every one of them addressed the row by \`key\` alone`,
  );
  // Where the unique-key surface lives NOW. Two claims, and both matter:
  // no PRODUCT code addresses a setting by unique key at all, and every
  // remaining CLI site names the TENANT-QUALIFIED key — nothing anywhere
  // addresses a setting by `key` alone.
  const remaining = srcFiles
    .filter((f) => f !== "audits/practice-setting-verify.ts" && f !== "lib/practice-settings.ts")
    .flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/practiceSetting\.(upsert|update|delete|findUnique|findUniqueOrThrow)\s*\(\{[\s\S]{0,200}/g)].map(
        (m) => ({ file: f, method: m[1], snippet: m[0] }),
      );
    });
  const productRemaining = remaining.filter((r) => r.file.startsWith("app/") || r.file.startsWith("lib/"));
  const byBareKey = remaining.filter((r) => !/tenantId_key\s*:/.test(r.snippet));
  check(
    "A3 — and NO product code addresses a setting by unique key any more: lib/practice-settings.ts is the only place that does",
    productRemaining.length === 0,
    productRemaining.map((r) => `${r.file}:${r.method}`).join(", ") ||
      `0 remaining sites under app/ and lib/ · ${remaining.length} CLI harness site(s) remain, each on its own client`,
  );
  check(
    "A3 — and nothing anywhere addresses a setting by `key` ALONE: every remaining CLI site names the tenant-qualified (tenantId, key)",
    byBareKey.length === 0,
    byBareKey.map((r) => `${r.file}:${r.method}`).join(", ") ||
      remaining.map((r) => `${r.file}:${r.method}`).join(", "),
  );

  // A4 — the engage switches really do live in PracticeSetting.
  const engageSrc = readFileSync("lib/engage.ts", "utf8");
  const engageHead = gitShow("lib/engage.ts");
  check(
    "A4 — CONFIRMED: the engage kill-switch and pause are `PracticeSetting` rows, read by `findFirst({ where: { key } })`, and lib/engage.ts is BYTE-IDENTICAL to HEAD",
    /practiceSetting\.findFirst\(\{ where: \{ key: ENGAGE_ENABLED_KEY \} \}\)/.test(engageSrc) &&
      /practiceSetting\.findFirst\(\{ where: \{ key: ENGAGE_PAUSED_KEY \} \}\)/.test(engageSrc) &&
      engageSrc === engageHead,
    "both switches read through a filter-form findFirst, which the scoped client already scopes — so this build changed zero lines of lib/engage.ts",
  );

  // A5 — the default-tenant path, and what actually exists today.
  const defaultRows = await p.practiceSetting.findMany({ where: { tenantId: DEFAULT_TENANT_ID } });
  const nullRows = await p.practiceSetting.count({ where: { tenantId: null } });
  check(
    "A5 — CONFIRMED: the default tenant's settings are readable, and after migration 49 none of them is a null-tenant row",
    nullRows === 0,
    `${defaultRows.length} default-tenant row(s) · ${nullRows} null-tenant row(s)`,
  );

  // =========================================================================
  log(`\n## Verify 2 — the reproduction, before and after`);
  // =========================================================================
  // The "before" ingredients, read out of git (see the header note on how the
  // pre-fix behaviour itself was demonstrated).
  check(
    "BEFORE — both ingredients of the failure are documented at HEAD: a hardcoded `{ id: true }` select, and a model with no `id` column",
    /select:\s*\{\s*id:\s*true\s*\}/.test(gitShow("lib/prisma.ts")) && headNoId[0] === "PracticeSetting",
    "reproduced live at HEAD before any edit: `PrismaClientValidationError: Invalid d.findFirst() invocation in lib/prisma.ts:139` — quoted in full in the build report",
  );
  // The failure MODE, demonstrated live rather than asserted: selecting a
  // column a model does not have is a Prisma VALIDATION error, which is why
  // the pre-check died before it could check anything.
  let selectErr = "";
  try {
    await p.practiceSetting.findFirst({ where: { key: "psxProbeNope" }, select: { thisColumnDoesNotExist: true } });
  } catch (e: any) {
    selectErr = e?.constructor?.name ?? "";
  }
  check(
    "BEFORE — and the failure mode is live, not asserted: selecting a column the model does not have is a PrismaClientValidationError, thrown before any tenancy check can run",
    selectErr === "PrismaClientValidationError",
    `error class: ${selectErr || "none — the bogus select did not throw"}`,
  );
  const { prisma: scoped } = (await import("../lib/prisma")) as any;
  const { withTenantScope } = (await import("../lib/tenancy/tenant-scope")) as any;
  const { writePracticeSetting, readPracticeSetting } = (await import("../lib/practice-settings")) as any;

  // =========================================================================
  log(`\n## Verify 5 (first, because 3 and 4 build on it) — two practices created by the REAL signup service`);
  // =========================================================================
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  const { signUpPractitioner } = (await import("../lib/signup")) as any;
  const signups: Record<string, any> = {};
  for (const [slug, email, name] of [
    [SLUG_A, EMAIL_A, "Practice A"],
    [SLUG_B, EMAIL_B, "Practice B"],
  ] as const) {
    signups[slug] = await signUpPractitioner({
      name: `Probe ${name}`,
      practiceName: `PSX ${name}`,
      email,
      password: PASSWORD,
      slug,
      baseUrl: BASE,
    });
  }
  const tenantA = await p.tenant.findFirst({ where: { slug: SLUG_A } });
  const tenantB = await p.tenant.findFirst({ where: { slug: SLUG_B } });
  check(
    "two ACTIVE non-default practices exist, provisioned by lib/signup.ts exactly as a founding practitioner creates one",
    signups[SLUG_A]?.ok === true &&
      signups[SLUG_B]?.ok === true &&
      tenantA?.status === "ACTIVE" &&
      tenantB?.status === "ACTIVE" &&
      tenantA.id !== DEFAULT_TENANT_ID &&
      tenantB.id !== DEFAULT_TENANT_ID,
    `${tenantA?.id} (${tenantA?.status}) · ${tenantB?.id} (${tenantB?.status})`,
  );

  // =========================================================================
  log(`\n## Verify 2 (after) + 4 — the write succeeds, and two practices hold the same key independently`);
  // =========================================================================
  await withTenantScope(tenantA.id, async () => {
    await writePracticeSetting(PROBE_KEY, "A-value");
  });
  await withTenantScope(tenantB.id, async () => {
    await writePracticeSetting(PROBE_KEY, "B-value");
  });
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await writePracticeSetting(PROBE_KEY, "default-value");
  });
  const rowsForKey = await p.practiceSetting.findMany({ where: { key: PROBE_KEY }, orderBy: { value: "asc" } });
  check(
    "AFTER — the exact write this spec exists to fix now SUCCEEDS for a non-default tenant, and is stamped to that tenant",
    rowsForKey.some((r: any) => r.tenantId === tenantA.id && r.value === "A-value"),
    `${rowsForKey.length} rows for the one key: ${rowsForKey.map((r: any) => `${r.tenantId}=${r.value}`).join(" · ")}`,
  );
  check(
    "V4 — THREE practices hold the SAME key with DIFFERENT values (the model was structurally single-practice before this build)",
    rowsForKey.length === 3 &&
      new Set(rowsForKey.map((r: any) => r.tenantId)).size === 3 &&
      new Set(rowsForKey.map((r: any) => r.value)).size === 3,
    rowsForKey.map((r: any) => r.value).join(", "),
  );
  const readA = await withTenantScope(tenantA.id, async () => (await readPracticeSetting(PROBE_KEY))?.value);
  const readB = await withTenantScope(tenantB.id, async () => (await readPracticeSetting(PROBE_KEY))?.value);
  const readD = await withTenantScope(DEFAULT_TENANT_ID, async () => (await readPracticeSetting(PROBE_KEY))?.value);
  check(
    "V4 — each practice reads its OWN value and only its own",
    readA === "A-value" && readB === "B-value" && readD === "default-value",
    `A=${readA} · B=${readB} · default=${readD}`,
  );
  // A cannot see a key only B holds.
  await withTenantScope(tenantB.id, async () => {
    await writePracticeSetting(PROBE_KEY_2, "B-only");
  });
  const aSeesBOnly = await withTenantScope(tenantA.id, async () => await readPracticeSetting(PROBE_KEY_2));
  check(
    "V4 — a practice cannot READ a key only another practice holds",
    aSeesBOnly === null,
    `A reading B's ${PROBE_KEY_2}: ${aSeesBOnly === null ? "nothing" : JSON.stringify(aSeesBOnly)}`,
  );
  // A writing "the same" key cannot touch B's row.
  await withTenantScope(tenantA.id, async () => {
    await writePracticeSetting(PROBE_KEY_2, "A-own");
  });
  const bStillOwn = (await p.practiceSetting.findFirst({ where: { key: PROBE_KEY_2, tenantId: tenantB.id } }))?.value;
  const aOwn = (await p.practiceSetting.findFirst({ where: { key: PROBE_KEY_2, tenantId: tenantA.id } }))?.value;
  check(
    "V4 — a practice cannot OVERWRITE another practice's value for the same key: it gets its own row",
    bStillOwn === "B-only" && aOwn === "A-own",
    `B=${bStillOwn} (untouched) · A=${aOwn} (its own row)`,
  );
  // And a targeted attempt at another tenant's row is REFUSED, not silently redirected.
  let crossErr = "";
  await withTenantScope(tenantA.id, async () => {
    try {
      await scoped.practiceSetting.update({
        where: { tenantId_key: { tenantId: tenantB.id, key: PROBE_KEY_2 } },
        data: { value: "hijacked" },
      });
    } catch (e: any) {
      crossErr = e?.message ?? "";
    }
  });
  check(
    "V4 — naming another practice's row EXPLICITLY is refused by the pre-check, and that practice's value is unchanged",
    /not found in tenant scope/.test(crossErr) &&
      (await p.practiceSetting.findFirst({ where: { key: PROBE_KEY_2, tenantId: tenantB.id } }))?.value === "B-only",
    crossErr.split("\n")[0] || "no error — the pre-check did not fire",
  );

  // =========================================================================
  log(`\n## Verify 8 — fail-closed preserved, on PracticeSetting AND on a normal id-keyed model`);
  // =========================================================================
  let psUpsertCross = "";
  await withTenantScope(tenantA.id, async () => {
    try {
      await scoped.practiceSetting.upsert({
        where: { tenantId_key: { tenantId: tenantB.id, key: PROBE_KEY_2 } },
        create: { tenantId: tenantB.id, key: PROBE_KEY_2, value: "hijacked" },
        update: { value: "hijacked" },
      });
    } catch (e: any) {
      psUpsertCross = e?.message ?? "";
    }
  });
  check(
    "V8 — an UPSERT aimed at another practice's existing PracticeSetting row is REFUSED (the fix did not trade fail-closed away)",
    /belongs to another tenant/.test(psUpsertCross) &&
      (await p.practiceSetting.findFirst({ where: { key: PROBE_KEY_2, tenantId: tenantB.id } }))?.value === "B-only",
    psUpsertCross.split("\n")[0] || "no error — the pre-check did not fire",
  );
  let psDeleteCross = "";
  await withTenantScope(tenantA.id, async () => {
    try {
      await scoped.practiceSetting.delete({
        where: { tenantId_key: { tenantId: tenantB.id, key: PROBE_KEY_2 } },
      });
    } catch (e: any) {
      psDeleteCross = e?.message ?? "";
    }
  });
  check(
    "V8 — a DELETE aimed at another practice's PracticeSetting row is REFUSED and the row survives",
    /not found in tenant scope/.test(psDeleteCross) &&
      (await p.practiceSetting.count({ where: { key: PROBE_KEY_2, tenantId: tenantB.id } })) === 1,
    psDeleteCross.split("\n")[0] || "no error — the pre-check did not fire",
  );
  // A normal id-keyed model: PatternArchetype, whose `label` is globally unique.
  await p.patternArchetype.deleteMany({ where: { label: { startsWith: "psx-probe" } } }).catch(() => undefined);
  await withTenantScope(tenantB.id, async () => {
    await scoped.patternArchetype.upsert({
      where: { label: "psx-probe-b" },
      create: { label: "psx-probe-b", kind: "PATTERN", definition: "b" },
      update: { definition: "b" },
    });
  });
  const archB = await p.patternArchetype.findFirst({ where: { label: "psx-probe-b" } });
  let archCross = "";
  await withTenantScope(tenantA.id, async () => {
    try {
      await scoped.patternArchetype.upsert({
        where: { label: "psx-probe-b" },
        create: { label: "psx-probe-b", kind: "PATTERN", definition: "hijack" },
        update: { definition: "hijack" },
      });
    } catch (e: any) {
      archCross = e?.message ?? "";
    }
  });
  const archAfter = await p.patternArchetype.findFirst({ where: { label: "psx-probe-b" } });
  check(
    "V8 — on a normal `id`-keyed model the pre-check still refuses a cross-tenant unique write, and the target row is untouched",
    archB?.tenantId === tenantB.id &&
      /belongs to another tenant/.test(archCross) &&
      archAfter?.definition === "b" &&
      archAfter?.tenantId === tenantB.id,
    `${archCross.split("\n")[0] || "no error"} · target still ${archAfter?.definition}/${archAfter?.tenantId}`,
  );
  let archUpdateCross = "";
  await withTenantScope(tenantA.id, async () => {
    try {
      await scoped.patternArchetype.update({ where: { id: archB.id }, data: { definition: "hijack" } });
    } catch (e: any) {
      archUpdateCross = e?.message ?? "";
    }
  });
  check(
    "V8 — and an UPDATE by another tenant's primary key is still refused",
    /not found in tenant scope/.test(archUpdateCross) &&
      (await p.patternArchetype.findFirst({ where: { id: archB.id } }))?.definition === "b",
    archUpdateCross.split("\n")[0] || "no error — the pre-check did not fire",
  );
  await p.patternArchetype.deleteMany({ where: { label: { startsWith: "psx-probe" } } }).catch(() => undefined);

  // The pre-check can NEVER be skipped: the derivation throws rather than
  // returning "nothing to select". Proven on the pure function, including the
  // two shapes this schema does not contain.
  const compound = identitySelectFor({
    name: "Synthetic",
    fields: [{ name: "a" }, { name: "b" }, { name: "rel", kind: "object" }],
    primaryKey: { fields: ["a", "b"] },
    uniqueIndexes: [],
  } as ModelMeta);
  const keyed = identitySelectFor({
    name: "SyntheticKeyed",
    fields: [{ name: "key", isId: true }, { name: "value" }],
    primaryKey: null,
    uniqueIndexes: [],
  } as ModelMeta);
  let unkeyableErr = "";
  try {
    identitySelectFor({ name: "Unkeyable", fields: [{ name: "a" }, { name: "b" }], primaryKey: null, uniqueIndexes: [] } as ModelMeta);
  } catch (e: any) {
    unkeyableErr = e instanceof ModelIdentityError ? e.message : `wrong error: ${e?.message}`;
  }
  let unknownModelErr = "";
  try {
    identitySelect("noSuchDelegate");
  } catch (e: any) {
    unknownModelErr = e instanceof ModelIdentityError ? "ModelIdentityError" : `wrong error: ${e?.message}`;
  }
  check(
    "V8 — the DMMF derivation serves a compound PK and a non-`id` PK, and FAILS CLOSED (throws) for a model it cannot identify — it never returns a skip",
    JSON.stringify(compound) === '{"a":true,"b":true}' &&
      JSON.stringify(keyed) === '{"key":true}' &&
      /refusing to skip the fail-closed ownership pre-check/.test(unkeyableErr) &&
      unknownModelErr === "ModelIdentityError",
    `compound=${JSON.stringify(compound)} · non-id pk=${JSON.stringify(keyed)} · unkeyable throws ModelIdentityError · unknown delegate throws ModelIdentityError`,
  );
  check(
    `V8 — and the derivation covers every one of the ${SCOPED_MODELS.length} scoped models, so no write reaches the fail-closed branch unidentified`,
    SCOPED_MODELS.every((m) => {
      try {
        return Object.keys(identitySelect(m)).length > 0;
      } catch {
        return false;
      }
    }),
    `${SCOPED_MODELS.length}/${SCOPED_MODELS.length} scoped delegates resolve to a non-empty identity select`,
  );

  // =========================================================================
  log(`\n## Verify 6 — the engage kill-switch and pause (ruling 19), unchanged`);
  // =========================================================================
  const engage = (await import("../lib/engage")) as any;
  await p.practiceSetting
    .deleteMany({ where: { key: { in: ["engageEnabled", "engagePaused"] } } })
    .catch(() => undefined);
  delete process.env.ENGAGE_ENABLED;
  delete process.env.ENGAGE_PAUSED;
  const sw0 = await engage.engageSwitches();
  check(
    "V6 — with NO rows and no env override the gate is CLOSED and nothing is paused (an absent row still means closed)",
    sw0.gateOpen === false && sw0.paused === false,
    `gateOpen=${sw0.gateOpen} paused=${sw0.paused}`,
  );
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await writePracticeSetting("engageEnabled", "on");
  });
  const sw1 = await engage.engageSwitches();
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await writePracticeSetting("engagePaused", "on");
  });
  const sw2 = await engage.engageSwitches();
  check(
    "V6 — a deliberate row OPENS the gate, and the pause then BEATS the gate (both stored in the model this build changed)",
    sw1.gateOpen === true && sw1.paused === false && sw2.gateOpen === true && sw2.paused === true,
    `after engageEnabled=on: open=${sw1.gateOpen}/paused=${sw1.paused} · after engagePaused=on: open=${sw2.gateOpen}/paused=${sw2.paused}`,
  );
  await p.practiceSetting
    .deleteMany({ where: { key: { in: ["engageEnabled", "engagePaused"] } } })
    .catch(() => undefined);
  const swBack = await engage.engageSwitches();
  const plan = await engage.planEngage({ includeUpcoming: false, limit: 50 });
  const dueSteps = plan.steps.filter((s: any) => s.due);
  check(
    "V6 — back to CLOSED by default, and a closed gate still records SKIPPED for every due step (never SENT)",
    swBack.gateOpen === false &&
      plan.switches.gateOpen === false &&
      dueSteps.every((s: any) => s.plannedStatus === "SKIPPED" || s.plannedStatus === "SUPPRESSED"),
    `gateOpen=${swBack.gateOpen} · ${dueSteps.length} due step(s), planned: ${
      [...new Set(dueSteps.map((s: any) => s.plannedStatus))].join(", ") || "none due"
    }`,
  );

  // =========================================================================
  log(`\n## Verify 7 + 9 — Valentina's rows through the migration, and the migration itself`);
  // =========================================================================
  // The migration's comment states a limitation out loud: once a second
  // practice holds a key the first practice also holds, restoring a PRIMARY
  // KEY on `key` is impossible, so the reversal FAILS rather than silently
  // dropping a practice's row. Three practices are currently holding
  // PROBE_KEY, so assert that refusal before clearing them.
  let reversalRefused = "";
  try {
    execFileSync("psql", [process.env.DATABASE_URL ?? "", "-v", "ON_ERROR_STOP=1", "-c", REVERSAL_SQL], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e: any) {
    reversalRefused = String(e?.stderr ?? e?.message ?? "");
  }
  check(
    "V9 — the reversal FAILS LOUDLY (never silently) while two practices hold the same key, exactly as the migration's comment states",
    /could not create unique index "PracticeSetting_pkey"/.test(reversalRefused) &&
      /is duplicated/.test(reversalRefused) &&
      psql(`select count(*) from "PracticeSetting" where "key" = '${PROBE_KEY}'`) === "3",
    `${(reversalRefused.split("\n").find((l) => /ERROR|DETAIL/.test(l)) ?? "no error").trim()} · all 3 rows still present`,
  );
  // Clear the multi-practice probe rows; V4 is proven, and the reversal test
  // below needs a table the OLD single-practice shape can still represent.
  await p.practiceSetting.deleteMany({ where: { key: { in: [PROBE_KEY, PROBE_KEY_2] } } });

  for (const [key, value] of VALENTINA_ROWS) {
    await withTenantScope(DEFAULT_TENANT_ID, async () => {
      await writePracticeSetting(key, value);
    });
  }
  // Plus one legacy null-tenant row, so the backfill has something to count.
  await p.practiceSetting.create({
    data: { key: "psxProbeLegacyNull", value: "legacy-value", tenantId: null },
  });
  const beforeAll = await settingsFingerprint();
  const beforeValentina = (await p.practiceSetting.findMany({
    where: { key: { in: VALENTINA_ROWS.map(([k]) => k) } },
    select: { key: true, value: true, tenantId: true },
  })) as any[];
  check(
    "V7 — Valentina's specific default-tenant rows asserted BEFORE the migration is touched",
    beforeValentina.length === VALENTINA_ROWS.length &&
      VALENTINA_ROWS.every(([k, v]) =>
        beforeValentina.some((r) => r.key === k && r.value === v && r.tenantId === DEFAULT_TENANT_ID),
      ),
    beforeValentina.map((r) => `${r.key}=${JSON.stringify(r.value)}`).join(" · "),
  );

  // Reverse migration 49 exactly as its comment documents, then assert the
  // prior shape AND the prior values.
  execFileSync("psql", [process.env.DATABASE_URL ?? "", "-v", "ON_ERROR_STOP=1", "-c", REVERSAL_SQL], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const revPk = psql(
    `select string_agg(a.attname, ',' order by a.attnum) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.conrelid='"PracticeSetting"'::regclass and c.contype='p'`,
  );
  const revHasId = psql(
    `select count(*) from information_schema.columns where table_name='PracticeSetting' and column_name='id'`,
  );
  const revValentina = psql(
    `select string_agg("key"||'='||"value"||'@'||coalesce("tenantId",'<null>'), ' | ' order by "key") from "PracticeSetting" where "key" like 'psxProbe%'`,
  );
  check(
    "V9 — the documented REVERSAL restores the prior schema exactly: primary key back on (key), no `id` column, no unique (tenantId, key)",
    revPk === "key" && revHasId === "0" && !/PracticeSetting_tenantId_key_key/.test(psql(`select coalesce(string_agg(indexname,','),'') from pg_indexes where tablename='PracticeSetting'`)),
    `pk=(${revPk}) · id column present: ${revHasId} rows`,
  );
  check(
    "V9 — and restores the prior DATA exactly: the stamped legacy row is null again, and Valentina's rows are untouched",
    /psxProbeLegacyNull=legacy-value@<null>/.test(revValentina) &&
      VALENTINA_ROWS.every(([k, v]) => revValentina.includes(`${k}=${v}@${DEFAULT_TENANT_ID}`)),
    revValentina,
  );

  // Re-apply the migration file itself and capture its counts.
  const runMigration = () =>
    execSync(`psql "${process.env.DATABASE_URL}" -v ON_ERROR_STOP=1 -f ${MIGRATION} 2>&1 | grep NOTICE || true`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => /49_practice_setting_tenancy:|·/.test(l))
      .map((l) => l.replace(/^.*NOTICE:\s*/, "").trim())
      .join(" | ");
  const firstRun = runMigration();
  const secondRun = runMigration();
  check(
    "V9 — the migration REPORTS ITS COUNTS on the run that does the work",
    /given an id, 1 stamped to the default tenant, 0 values changed/.test(firstRun) &&
      /id column added; \d+ existing row\(s\) given an id/.test(firstRun) &&
      /primary key moved from \(key\) to \(id\)/.test(firstRun) &&
      /unique index \(tenantId, key\) created/.test(firstRun),
    firstRun,
  );
  check(
    "V9 — and the second run is IDEMPOTENT: 0 ids, 0 stamps, 0 values changed, nothing to move, nothing to add",
    /0 given an id, 0 stamped to the default tenant, 0 values changed/.test(secondRun),
    secondRun,
  );
  const afterAll = await settingsFingerprint();
  const afterValentina = (await p.practiceSetting.findMany({
    where: { key: { in: VALENTINA_ROWS.map(([k]) => k) } },
    select: { key: true, value: true, tenantId: true },
  })) as any[];
  check(
    "V7 — Valentina's rows survive the round trip READABLE and UNCHANGED: same keys, same values, same owner",
    VALENTINA_ROWS.every(([k, v]) =>
      afterValentina.some((r) => r.key === k && r.value === v && r.tenantId === DEFAULT_TENANT_ID),
    ) && afterValentina.length === VALENTINA_ROWS.length,
    afterValentina.map((r) => `${r.key}=${JSON.stringify(r.value)}@${r.tenantId}`).join(" · "),
  );
  check(
    "V7 — and EVERY OTHER ROW in the table is byte-identical across the reversal + re-application — key, value and owner, for every practice, not just the sampled ones",
    afterAll === beforeAll,
    `${afterAll.split("").length} rows fingerprinted, identical before and after`,
  );
  check(
    "V9 — the reversal ledger records exactly the rows whose tenantId the migration stamped, and nothing else",
    psql(`select count(*) from "_PracticeSettingTenancy49"`) === "1" &&
      psql(`select "key" from "_PracticeSettingTenancy49"`) === "psxProbeLegacyNull",
    `_PracticeSettingTenancy49: ${psql(`select "key" from "_PracticeSettingTenancy49"`)}`,
  );
  await p.practiceSetting.deleteMany({ where: { key: "psxProbeLegacyNull" } });
  execFileSync("psql", [process.env.DATABASE_URL ?? "", "-tAc", 'TRUNCATE "_PracticeSettingTenancy49"'], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  // =========================================================================
  log(`\n## Verify 3 — a founding practitioner writes and reads a setting INSIDE A REAL REQUEST on their own host`);
  // =========================================================================
  console.log(`~ starting built app on :${PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(PORT),
    PLATFORM_DOMAIN,
    AUTH_TRUST_HOST: "true",
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
  // REAL hosts, not forged headers. A Next server action rejects a request
  // whose `x-forwarded-host` disagrees with its `origin` (its own CSRF
  // defence), so a spoofed header cannot exercise the write path at all.
  // Resolving the tenant subdomains to loopback inside the browser gives the
  // app a genuine `Host: psxprobea.psx.test:PORT` on every request —
  // navigation, action POST and the redirect that follows it.
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: [`--host-resolver-rules=MAP *.${PLATFORM_DOMAIN} 127.0.0.1, MAP ${PLATFORM_DOMAIN} 127.0.0.1`],
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {
        /* booting */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // One browser context per practice, signed in through the real login form
    // on that practice's own host.
    const openPractice = async (host: string, email: string) => {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const origin = `http://${host}:${PORT}`;
      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2500);
      return { ctx, page, origin };
    };
    const settingsPage = async (page: any, origin: string) => {
      await page.goto(`${origin}/practitioner/settings`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
    };

    const a = await openPractice(HOST_A, EMAIL_A);
    const b = await openPractice(HOST_B, EMAIL_B);
    await settingsPage(a.page, a.origin);
    await settingsPage(b.page, b.origin);
    check(
      "both founding practitioners sign in on their OWN host and reach their own settings page (the surface the defect blocked)",
      /\/practitioner\/settings$/.test(a.page.url()) &&
        /\/practitioner\/settings$/.test(b.page.url()) &&
        (await a.page.locator('input[name="assistNotify"]').count()) === 1 &&
        (await b.page.locator('input[name="assistNotify"]').count()) === 1,
      `${a.page.url()} · ${b.page.url()}`,
    );
    const hostSeen = await a.page.evaluate(() => location.host);
    check(
      "…and the request really carries her own host, so this is the request path a practitioner uses, not a simulation",
      hostSeen === `${HOST_A}:${PORT}`,
      `Host: ${hostSeen}`,
    );

    const before = await p.practiceSetting.count({ where: { key: "assistNotifyEmail", tenantId: tenantA.id } });
    await a.page.uncheck('input[name="assistNotify"]');
    await a.page.click('form:has(input[name="assistNotify"]) button[type="submit"], form:has(input[name="assistNotify"]) button');
    await a.page.waitForTimeout(2500);
    const rowA = await p.practiceSetting.findFirst({ where: { key: "assistNotifyEmail", tenantId: tenantA.id } });
    check(
      "V3 — the setting is WRITTEN inside a real request on her own host, owned by HER practice",
      before === 0 && rowA?.value === "off" && rowA?.tenantId === tenantA.id,
      `rows before=${before} · after: value=${rowA?.value} tenantId=${rowA?.tenantId} · url ${a.page.url().replace(`http://${HOST_A}:${PORT}`, "")}`,
    );
    await settingsPage(a.page, a.origin);
    const checkedA = await a.page.locator('input[name="assistNotify"]').isChecked();
    check(
      "V3 — and READ BACK inside a real request: her page renders the value she just saved",
      checkedA === false,
      `assistNotify checkbox rendered checked=${checkedA} (she turned it off)`,
    );
    const checkedB = await b.page.locator('input[name="assistNotify"]').isChecked();
    const rowB = await p.practiceSetting.count({ where: { key: "assistNotifyEmail", tenantId: tenantB.id } });
    const rowDefault = await p.practiceSetting.count({
      where: { key: "assistNotifyEmail", tenantId: DEFAULT_TENANT_ID },
    });
    check(
      "V3/V4 — the OTHER practice's identical page is untouched by her save: no row of its own, default state, and Valentina's practice unaffected",
      checkedB === true && rowB === 0 && rowDefault === 0,
      `B checkbox=${checkedB} · B rows=${rowB} · default-tenant rows=${rowDefault}`,
    );
    await b.page.uncheck('input[name="assistNotify"]');
    await b.page.click('form:has(input[name="assistNotify"]) button[type="submit"], form:has(input[name="assistNotify"]) button');
    await b.page.waitForTimeout(2500);
    const bothRows = await p.practiceSetting.findMany({ where: { key: "assistNotifyEmail" } });
    check(
      "V3/V4 — both practices now hold `assistNotifyEmail` independently, each written through its own real request",
      bothRows.length === 2 &&
        new Set(bothRows.map((r: any) => r.tenantId)).size === 2 &&
        bothRows.every((r: any) => r.value === "off") &&
        bothRows.every((r: any) => r.tenantId === tenantA.id || r.tenantId === tenantB.id),
      bothRows.map((r: any) => `${r.tenantId}=${r.value}`).join(" · "),
    );
    // And a second real save on the same key UPDATES her row rather than
    // creating a duplicate — the (tenantId, key) unique constraint at work.
    await settingsPage(a.page, a.origin);
    await a.page.check('input[name="assistNotify"]');
    await a.page.click('form:has(input[name="assistNotify"]) button[type="submit"], form:has(input[name="assistNotify"]) button');
    await a.page.waitForTimeout(2500);
    const aRows = await p.practiceSetting.findMany({ where: { key: "assistNotifyEmail", tenantId: tenantA.id } });
    check(
      "V3 — saving the same key again UPDATES her one row (no duplicate), and the other practice's value is still its own",
      aRows.length === 1 &&
        aRows[0].value === "on" &&
        (await p.practiceSetting.findFirst({ where: { key: "assistNotifyEmail", tenantId: tenantB.id } }))?.value === "off",
      `A: ${aRows.length} row(s) = ${aRows.map((r: any) => r.value).join(",")} · B still off`,
    );
    for (const c of [a.ctx, b.ctx]) await c.close();
  } finally {
    await browser.close().catch(() => undefined);
    server.kill("SIGTERM");
    try {
      execSync(`pkill -f "next start -p ${PORT}"`);
    } catch {
      /* none */
    }
  }

  // =========================================================================
  await cleanup();
  log("~ probe practices, probe settings and probe archetypes removed");
  const residual = await auditNullTenantRows();
  check(
    "SELF-CLEANING: this harness leaves zero null-tenant rows behind",
    residual.total === 0,
    JSON.stringify(residual.byModel),
  );
  const leftover = await p.practiceSetting.count({ where: { key: { startsWith: "psxProbe" } } });
  check("SELF-CLEANING: no probe settings left in the table", leftover === 0, `${leftover} rows`);
  check(
    `the audit still covers every scoped table (${SCOPED_MODELS.length} tables, nothing narrowed)`,
    SCOPED_MODELS.length === 79,
    `${SCOPED_MODELS.length} tables`,
  );

  const total = results.length;
  const failed = results.filter((r) => !r.pass).length;
  const summary =
    failed === 0
      ? `\nPRACTICE-SETTING VERIFY PASS — ${total}/${total}`
      : `\n${failed} CHECK(S) FAILED — ${total - failed}/${total}`;
  console.log(summary);

  // Ruling 17 — the log is written BY the gate, or not at all.
  mkdirSync(join(__dirname, "practice-setting"), { recursive: true });
  writeFileSync(
    join(__dirname, "practice-setting", "VERIFY-LOG.md"),
    [
      "# C25-PRACTICE-SETTING-TENANCY — acceptance log",
      "",
      `Run: ${new Date().toISOString()} · \`npx tsx audits/practice-setting-verify.ts\``,
      `Database: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]*@/, ":***@")}`,
      "",
      "Verify 3 and 5 run in a REAL BROWSER against the BUILT app, on each",
      "practice's own host, for practices provisioned by the real signup service.",
      "Verify 7 and 9 reverse migration 49 and re-apply it against the live",
      "database, comparing every row before and after.",
      "",
      ...report,
      summary,
      "",
    ].join("\n"),
  );
  if (failed > 0) process.exit(1);
}

main()
  .catch(async (e) => {
    console.error(e);
    try {
      execSync(`pkill -f "next start -p ${PORT}"`);
    } catch {
      /* none */
    }
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
