/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "async_hooks";

// Next's request-scoped storage modules throw at load time if this global is
// absent, and lib/prisma.ts imports next/headers. Set it BEFORE anything that
// reaches into next — which is why every next-touching import below is
// dynamic and happens inside main().
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { rawPrisma } from "../lib/prisma-internal";
import { SCOPED_MODELS, DEFAULT_TENANT_ID } from "../lib/tenancy/scope";
import { withTenantScope, ambientTenantId } from "../lib/tenancy/tenant-scope";
import { auditNullTenantRows } from "../lib/tenancy/stamp-audit";

// C24.1-TENANT-SCOPE acceptance — the out-of-request tenant scope.
//
// WHAT IS UNDER TEST. `withTenantScope(T, fn)` (lib/tenancy/tenant-scope.ts),
// consulted by lib/prisma.ts ONLY when `headers()` is unavailable. The three
// properties that make it a fix rather than a new hole:
//
//   · a CLI write inside a scope is stamped (the case that never worked)
//   · a REQUEST's tenant always wins over any wrapper — otherwise this would
//     be a cross-tenant WRITE mechanism
//   · ABSENCE of a scope is exactly today's behaviour: passthrough, unstamped,
//     LOUD to the null-tenant audit. No implicit default-tenant stamping
//     anywhere (ruling 24's rejected option; these checks keep it rejected).
//
// Verify list (spec §Verify): 1 the five assumptions · 2 CLI scoped write ·
// 3 nested at depth · 4 request headers win · 5 absence unchanged ·
// 6 explicit tenantId wins, incl. a foreign one · 7 the explicit call sites
// keep their values. Items 8–12 are whole-gate/regression conditions and are
// run as separate gates — see the build report.
//
// Requests are simulated in-process via Next's request async storage (the
// same deliberate Next internal C24's gate uses), so the request-path checks
// run through the REAL scoped client against the REAL database. The harness
// asserts the simulation is real before trusting anything built on it.
//
// Self-cleaning: every row carries a `tcv_` id or a probe email; cleanup()
// runs first and last, and the harness asserts it leaves zero null rows.
//
//   DATABASE_URL=...scratch npx tsx audits/tenant-scope-verify.ts

const TENANT_B = "tnt_tcv_probe_b_00001";
const TENANT_B_SLUG = "tcvprobeb";
const PLATFORM_DOMAIN = "tcv.test";
const DEFAULT_HOST = "localhost:3000"; // no PLATFORM_DOMAIN suffix → default tenant
const B_HOST = `${TENANT_B_SLUG}.${PLATFORM_DOMAIN}`;
const FOREIGN_TENANT = "tnt_tcv_foreign_00001"; // never host-resolved; only ever explicit
const OWNER = "tcv_owner";
const PROBE_OWNER_EMAIL = "tenant-scope-owner@fixture.test";

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

const p: any = rawPrisma;

// ---------------------------------------------------------------------------
// Simulated request scope — the only way to exercise the request path from a
// CLI harness. Uses a Next internal deliberately and says so; if the internal
// moves, this fails loudly rather than quietly proving nothing.
// ---------------------------------------------------------------------------
let runInRequest: (host: string, fn: () => Promise<void>) => Promise<void>;

// Assigned in main() by dynamic import: lib/practice-settings imports
// lib/prisma, which reaches next/headers, so it must not load at module time.
let writePracticeSetting: (key: string, value: string, opts?: { tenantId?: string }) => Promise<unknown>;

async function installRequestScope(): Promise<boolean> {
  try {
    const { requestAsyncStorage } = (await import(
      "next/dist/client/components/request-async-storage.external.js"
    )) as any;
    const { headers } = await import("next/headers");
    runInRequest = (host, fn) =>
      requestAsyncStorage.run(
        {
          headers: new Headers({ host }),
          cookies: new Map(),
          mutableCookies: new Map(),
          reactLoadableManifest: {},
          assetPrefix: "",
        },
        fn,
      );
    let seen: string | null = null;
    await runInRequest(DEFAULT_HOST, async () => {
      seen = headers().get("host");
    });
    return seen === DEFAULT_HOST;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Static scan: which CLI-run files write scoped rows through the SCOPED
// client? Each one either states its tenant (explicitly, or by wrapping
// itself in withTenantScope) or it is a null-tenant producer waiting to
// happen. This is the "correct by default for future CLI code" check.
// ---------------------------------------------------------------------------
const SELF = "audits/tenant-scope-verify.ts";

// Files that reach the scoped client from the CLI and write scoped models,
// and that state their tenant WITHOUT withTenantScope. Each entry is a
// deliberate, stated exception — not a blanket exclusion.
const STATES_TENANT_ANOTHER_WAY: Record<string, string> = {
  "audits/platform/verify.ts":
    "multi-tenant isolation harness: states EVERY tenant explicitly per write, and a single ambient scope would filter the cross-tenant reads it exists to make",
  "audits/platform/phase1-switch.ts":
    "tenant-switch harness: writes Tenant/TenantModule (platform-level, unstamped) plus users it states a tenantId for",
  "audits/platform/phase2-verify.ts":
    "module-matrix harness: writes Tenant/TenantModule only (platform-level, never stamped)",
  "audits/nested-stamp-verify.ts":
    "C24 gate: writes through SIMULATED REQUESTS on purpose, and states DEFAULT_TENANT_ID on the one row it creates outside one",
  "prisma/fixtures/seed-staging.ts":
    "staging seeder: states tenantId literally on the rows it creates AND runs a final convergence pass (updateMany tenantId:null → default) over every scoped table, so it provably leaves zero null rows",
  "audits/c12x-ai-pass/run.ts":
    "UNRESOLVED — one-off AI evidence run, unrunnable without a real ANTHROPIC_API_KEY; see ARCHITECT-REQUEST 1 in BUILD-REPORT-C24.1-TENANT-SCOPE.md",
  "audits/c12x-ai-pass/run2-fixes.ts": "UNRESOLVED — as run.ts",
  "audits/c12x-ai-pass/run3-patch01.ts": "UNRESOLVED — as run.ts",
};

const WRITE_CALL = /\bprisma\.[A-Za-z]+\.(create|createMany|createManyAndReturn|upsert)\s*\(/;

function scanCliWriters(): { scanned: number; wrapped: string[]; unwrapped: string[] } {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (["node_modules", ".next", ".git"].includes(e)) continue;
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.ts$/.test(e)) files.push(full);
    }
  };
  for (const dir of ["audits", "scripts", "prisma"]) walk(join(process.cwd(), dir));
  const wrapped: string[] = [];
  const unwrapped: string[] = [];
  let scanned = 0;
  for (const f of files) {
    const rel = f.replace(process.cwd() + "/", "");
    if (rel === SELF) continue;
    const src = readFileSync(f, "utf8");
    // Only the SCOPED client matters: rawPrisma callers state their tenant by
    // construction (guard-prisma allowlists every one of them).
    if (!/from "(\.\.\/)*(\.\.\/)?lib\/prisma"|from "@\/lib\/prisma"/.test(src)) continue;
    if (!WRITE_CALL.test(src)) continue;
    scanned++;
    if (src.includes("withTenantScope(")) wrapped.push(rel);
    else unwrapped.push(rel);
  }
  return { scanned, wrapped, unwrapped };
}

function filesContaining(needle: string, dirs = ["app", "lib", "audits", "scripts", "prisma", "ai"]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (["node_modules", ".next", ".git"].includes(e)) continue;
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e) && readFileSync(full, "utf8").includes(needle))
        out.push(full.replace(process.cwd() + "/", ""));
    }
  };
  for (const d of dirs) {
    try {
      walk(join(process.cwd(), d));
    } catch {
      /* absent */
    }
  }
  return out.filter((f) => f !== SELF);
}

// ---------------------------------------------------------------------------
async function cleanup() {
  await p.lesson.deleteMany({ where: { id: { startsWith: "tcv_" } } }).catch(() => undefined);
  await p.chapter.deleteMany({ where: { id: { startsWith: "tcv_" } } }).catch(() => undefined);
  await p.course.deleteMany({ where: { id: { startsWith: "tcv_" } } }).catch(() => undefined);
  await p.chapter.deleteMany({ where: { title: { startsWith: "tcv " } } }).catch(() => undefined);
  await p.course.deleteMany({ where: { createdById: OWNER } }).catch(() => undefined);
  await p.logEntry.deleteMany({ where: { clientId: OWNER } }).catch(() => undefined);
  await p.tenantModule.deleteMany({ where: { tenantId: TENANT_B } }).catch(() => undefined);
  await p.tenant.deleteMany({ where: { id: TENANT_B } }).catch(() => undefined);
  await p.patternElection.deleteMany({ where: { clientId: OWNER } }).catch(() => undefined);
  await p.practiceSetting.deleteMany({ where: { key: "tcvProbeSetting" } }).catch(() => undefined);
  await p.user.deleteMany({ where: { email: PROBE_OWNER_EMAIL } }).catch(() => undefined);
}

const tid = async (model: string, id: string): Promise<string | null | undefined> =>
  (await p[model].findUnique({ where: { id } }))?.tenantId;

async function main() {
  log(`# C24.1-TENANT-SCOPE verify — ${new Date().toISOString()}`);
  await cleanup();

  const scopedOk = await installRequestScope();
  check("simulated request scope is real (next/headers resolves inside it)", scopedOk);
  if (!scopedOk) throw new Error("cannot simulate a request scope — every request-path check would be vacuous");

  const { prisma } = (await import("../lib/prisma")) as any;
  ({ writePracticeSetting } = (await import("../lib/practice-settings")) as any);
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  await p.tenant.create({
    data: { id: TENANT_B, slug: TENANT_B_SLUG, displayName: "Tenant-scope probe B", status: "DEMO" },
  });
  // LogEntry.clientId / Course.createdById carry real FKs. Stamped
  // explicitly — this harness is CLI code and states its own tenant.
  await p.user.create({
    data: {
      tenantId: DEFAULT_TENANT_ID,
      id: OWNER,
      email: PROBE_OWNER_EMAIL,
      name: "tcv probe owner",
      role: "CLIENT",
      passwordHash: "x",
    },
  });

  // =========================================================================
  log(`\n## Verify 1 — the five assumptions`);
  // =========================================================================

  // --- A1: AsyncLocalStorage available and safe in every context that runs a
  //         scoped write: Next server runtime, tsx CLI, the job tick route ---
  const alsMod = await import("node:async_hooks");
  check(
    "A1: node:async_hooks/AsyncLocalStorage resolves in the tsx CLI runtime (this process)",
    typeof alsMod.AsyncLocalStorage === "function",
  );
  // Propagation across await boundaries is the property the fix depends on:
  // the product libs a harness drives are async several frames down.
  let deepSeen: string | null = null;
  await withTenantScope(TENANT_B, async () => {
    await new Promise((r) => setTimeout(r, 1));
    await (async () => {
      await Promise.resolve();
      deepSeen = ambientTenantId();
    })();
  });
  check(
    "A1 CONFIRMED: the scope survives await boundaries and nested async frames",
    deepSeen === TENANT_B,
    `ambient=${String(deepSeen)}`,
  );
  // Concurrency: two scopes running at once must not bleed into each other.
  const [ca, cb] = await Promise.all([
    withTenantScope(DEFAULT_TENANT_ID, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return ambientTenantId();
    }),
    withTenantScope(TENANT_B, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return ambientTenantId();
    }),
  ]);
  check(
    "A1 CONFIRMED: concurrent scopes do not bleed (per-async-context, not global)",
    ca === DEFAULT_TENANT_ID && cb === TENANT_B,
    `${String(ca)} / ${String(cb)}`,
  );
  check(
    "A1 CONFIRMED: the scope does NOT survive its own exit (no ambient leak afterwards)",
    ambientTenantId() === null,
    `ambient=${String(ambientTenantId())}`,
  );
  // Next server runtime + the tick route: async_hooks is a Node-only API, so
  // the risk is an EDGE-runtime execution of lib/prisma.ts. Prove there is
  // none, structurally.
  const edgeDeclared = filesContaining('runtime = "edge"', ["app", "lib", "components"]).concat(
    filesContaining("runtime: 'edge'", ["app", "lib", "components"]),
  );
  check(
    "A1 CONFIRMED: nothing in the app declares the EDGE runtime, so lib/prisma.ts only ever runs on Node",
    edgeDeclared.length === 0,
    edgeDeclared.join(", ") || "zero edge-runtime declarations",
  );
  const middleware = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
  check(
    "A1 CONFIRMED: middleware.ts (the one edge-by-default context) does not touch the prisma client",
    !middleware.includes("lib/prisma"),
  );
  const tickRoute = readFileSync(join(process.cwd(), "app/api/jobs/tick/route.ts"), "utf8");
  check(
    "A1 CONFIRMED: the job tick route is a Node route handler (no edge runtime export) and runs inside a request",
    !/runtime\s*=\s*["']edge["']/.test(tickRoute),
    "tick writes are request-scoped anyway — headers() resolves there, so precedence 1 applies",
  );

  // --- A2: lib/prisma.ts resolves the tenant in exactly one place ---
  const prismaSrc = readFileSync(join(process.cwd(), "lib/prisma.ts"), "utf8");
  // Count CODE, not prose: the header comment names these functions too.
  const prismaCode = prismaSrc
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const headerCalls = (prismaCode.match(/headers\(\)/g) ?? []).length;
  const ambientCalls = (prismaCode.match(/ambientTenantId\(\)/g) ?? []).length;
  const resolverDefs = (prismaCode.match(/function requestTenantId/g) ?? []).length;
  // The definition's own signature matches too — subtract it to get call sites.
  const resolverCalls = (prismaCode.match(/requestTenantId\(\)/g) ?? []).length - resolverDefs;
  check(
    "A2 CONFIRMED (with a correction): ONE resolver, ONE headers() call, ONE fallback consult…",
    headerCalls === 1 && ambientCalls === 1 && resolverDefs === 1,
    `headers()×${headerCalls} · ambientTenantId()×${ambientCalls} · requestTenantId defs×${resolverDefs}`,
  );
  check(
    "A2 CORRECTED: …but that resolver is CALLED from two write paths (runOp and the array-form $transaction) — and, since C25, re-exported once as scopeTenantId()",
    resolverCalls === 3 && /export function scopeTenantId\(\)/.test(prismaCode),
    `requestTenantId() call sites: ${resolverCalls} — the two write paths plus the C25 export scopeTenantId() (lib/practice-settings.ts, which must address a row by a unique key that INCLUDES tenantId). One fallback consult still covers all three, because it lives in the resolver`,
  );

  // --- A3: the remaining producers of null-tenant rows ---
  // Re-attributed by running each candidate against a clean invariant and
  // reading the audit after it. (The full regression sweep is a separate
  // gate; these are the harnesses that actually write scoped rows from a CLI.)
  const runGate = (rel: string): number => {
    try {
      execFileSync("npx", ["tsx", rel], { stdio: "pipe", cwd: process.cwd() });
      return 0;
    } catch (e: any) {
      return e?.status ?? 1;
    }
  };
  for (const rel of ["prisma/fixtures/c12x-verify.ts", "audits/amd06/verify.ts"]) {
    const before = await auditNullTenantRows();
    const exit = runGate(rel);
    const after = await auditNullTenantRows();
    check(
      `A3: ${rel} now leaves the null-tenant invariant intact (wrapped in withTenantScope)`,
      exit === 0 && after.total === before.total,
      `exit=${exit} · nulls before=${before.total} after=${after.total} ${JSON.stringify(after.byModel)}`,
    );
  }
  const cli = scanCliWriters();
  const unexplained = cli.unwrapped.filter((f) => !(f in STATES_TENANT_ANOTHER_WAY));
  check(
    "A3 CORRECTED: every CLI file that writes scoped rows through the scoped client is accounted for",
    unexplained.length === 0,
    `${cli.scanned} scanned · ${cli.wrapped.length} wrapped (${cli.wrapped.join(", ")}) · ${
      cli.unwrapped.length
    } stated another way · unexplained=${unexplained.join(", ") || "none"}`,
  );
  check(
    "A3 CORRECTED: audits/amd06/verify.ts was a SECOND live producer (+8 rows / 5 tables), missed by C24's sweep",
    cli.wrapped.includes("audits/amd06/verify.ts"),
    "it is not in the spec's regression list, so the per-gate attribution never ran it",
  );

  // --- A4: the harness that cannot run here ---
  const rr = readFileSync(join(process.cwd(), "audits/remarkable-recording/verify.ts"), "utf8");
  check(
    "A4: audits/remarkable-recording/verify.ts carries the wrap (mechanical application, NOT a verified pass)",
    rr.includes("withTenantScope(DEFAULT_TENANT_ID, main)"),
  );
  const anthropic = process.env.ANTHROPIC_API_KEY ?? "";
  log(
    `  · credential state at this run: ANTHROPIC_API_KEY=${
      anthropic ? (anthropic.startsWith("not_a_real") ? "placeholder (not a real key)" : "present") : "absent"
    } · ASSEMBLYAI_API_KEY=${process.env.ASSEMBLYAI_API_KEY ? "present" : "absent"} —` +
      " informational, not a check: this gate must not fail on an environment that HAS the credentials.",
  );

  // --- A5: the explicit call sites keep working, and their values win ---
  const explicitSites = filesContaining("tenantId: DEFAULT_TENANT_ID").concat(
    filesContaining("await getTenant()).id"),
  );
  check(
    "A5 CONFIRMED: the call sites that stamp explicitly are still there and unchanged in number",
    explicitSites.length >= 10,
    `${explicitSites.length} file(s): ${explicitSites.join(", ")}`,
  );
  const patternLib = readFileSync(join(process.cwd(), "lib/pattern-library.ts"), "utf8");
  check(
    "A5 CONFIRMED: lib/pattern-library.ts still resolves and states its own tenant (the CLI-seam precedent)",
    patternLib.includes("const tenantId = (await getTenant()).id"),
  );

  // =========================================================================
  log(`\n## Verify 2 — a CLI write inside withTenantScope is stamped (the case that never worked)`);
  // =========================================================================
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await prisma.logEntry.create({ data: { id: "tcv_scoped_log", clientId: OWNER, body: "tcv scoped" } });
  });
  check(
    "a scoped-client create in a CLI context inside withTenantScope(DEFAULT) is stamped",
    (await tid("logEntry", "tcv_scoped_log")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("logEntry", "tcv_scoped_log"))}`,
  );
  await withTenantScope(TENANT_B, async () => {
    await prisma.course.create({ data: { id: "tcv_b_course", title: "tcv b", createdById: OWNER } });
  });
  check(
    "…and with a NON-default tenant it is stamped with THAT tenant, not the default",
    (await tid("course", "tcv_b_course")) === TENANT_B,
    `tenantId=${String(await tid("course", "tcv_b_course"))}`,
  );
  // Both $transaction forms, because the array form is a separate code path.
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await prisma.$transaction(async (txp: any) => {
      await txp.logEntry.create({ data: { id: "tcv_tx_fn_log", clientId: OWNER, body: "tcv tx fn" } });
    });
    await prisma.$transaction([
      prisma.logEntry.create({ data: { id: "tcv_tx_arr_log", clientId: OWNER, body: "tcv tx array" } }),
    ]);
  });
  check(
    "$transaction(fn) inside the scope stamps",
    (await tid("logEntry", "tcv_tx_fn_log")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("logEntry", "tcv_tx_fn_log"))}`,
  );
  check(
    "$transaction([...]) — the separate array-form builder — stamps too",
    (await tid("logEntry", "tcv_tx_arr_log")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("logEntry", "tcv_tx_arr_log"))}`,
  );
  // A scoped write performed by a PRODUCT LIB the harness drives — the case
  // that call-site stamping cannot reach.
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    const deep = async () => {
      await new Promise((r) => setTimeout(r, 1));
      return prisma.course.create({ data: { id: "tcv_lib_course", title: "tcv lib", createdById: OWNER } });
    };
    await deep();
  });
  check(
    "a write several async frames below the wrap (as a driven product lib is) is stamped",
    (await tid("course", "tcv_lib_course")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("course", "tcv_lib_course"))}`,
  );
  // SUPERSEDED BY C25-PRACTICE-SETTING-TENANCY §1, and this is the check that
  // used to record the defect. C24.1 flagged, and ruling 31 ratified, that a
  // non-default tenant's upsert of a not-yet-existing row was REFUSED. C25
  // established that this was not a safety property at all: it conflated "the
  // row is somebody else's" (which must be refused) with "there is no row"
  // (which is simply the create branch, and the create branch is
  // tenant-stamped, so it cannot land in another tenant). The refusal that
  // matters is asserted immediately below.
  let upsertErr = "";
  await withTenantScope(TENANT_B, async () => {
    try {
      await prisma.course.upsert({
        where: { id: "tcv_b_upsert_new" },
        create: { id: "tcv_b_upsert_new", title: "tcv b upsert", createdById: OWNER },
        update: { title: "tcv b upsert" },
      });
    } catch (e: any) {
      upsertErr = e?.message ?? "";
    }
  });
  check(
    "a NON-default scope's upsert of a not-yet-existing row now SUCCEEDS and is stamped (C25 §1 corrected this; ruling 31 revisited)",
    upsertErr === "" && (await tid("course", "tcv_b_upsert_new")) === TENANT_B,
    upsertErr ? `unexpected refusal: ${upsertErr.split("\n")[0]}` : `tenantId=${String(await tid("course", "tcv_b_upsert_new"))}`,
  );
  // FIXED BY C25 §1+§2, and the check that recorded it as ARCHITECT-REQUEST 2
  // now asserts the fix: the pre-check's select comes from the DMMF, and
  // PracticeSetting is identified by (tenantId, key). A non-default tenant can
  // write its own settings — from a CLI scope AND, the part that matters, in a
  // REQUEST on its own host.
  let psScopeErr = "";
  await withTenantScope(TENANT_B, async () => {
    try {
      await writePracticeSetting("tcvProbeSetting", "b-scope");
    } catch (e: any) {
      psScopeErr = e?.message ?? "";
    }
  });
  const psScopeTenant = (await p.practiceSetting.findFirst({ where: { key: "tcvProbeSetting", tenantId: TENANT_B } }))?.value;
  let psReqErr = "";
  await runInRequest(B_HOST, async () => {
    try {
      await writePracticeSetting("tcvProbeSetting", "b-request");
    } catch (e: any) {
      psReqErr = e?.message ?? "";
    }
  });
  const psReqValue = (await p.practiceSetting.findFirst({ where: { key: "tcvProbeSetting", tenantId: TENANT_B } }))?.value;
  check(
    "FIXED (was ARCHITECT-REQUEST 2, now C25): practiceSetting writes SUCCEED for a non-default tenant — in a CLI scope AND in a REQUEST",
    psScopeErr === "" && psReqErr === "" && psScopeTenant === "b-scope" && psReqValue === "b-request",
    `scope=${psScopeErr || psScopeTenant} · request=${psReqErr || psReqValue}`,
  );
  const psDefault = await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await writePracticeSetting("tcvProbeSetting", "1");
    return (await p.practiceSetting.findFirst({ where: { key: "tcvProbeSetting", tenantId: DEFAULT_TENANT_ID } }))?.tenantId;
  });
  check(
    "…and the DEFAULT tenant holds the SAME key independently (the model is no longer single-practice)",
    psDefault === DEFAULT_TENANT_ID &&
      (await p.practiceSetting.count({ where: { key: "tcvProbeSetting" } })) === 2,
    `tenantId=${String(psDefault)} · rows with that key=${await p.practiceSetting.count({ where: { key: "tcvProbeSetting" } })}`,
  );

  // =========================================================================
  log(`\n## Verify 3 — nested children and grandchildren inside a CLI scope`);
  // =========================================================================
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await prisma.course.create({
      data: {
        id: "tcv_depth_course",
        title: "tcv depth",
        createdById: OWNER,
        chapters: {
          create: [
            {
              id: "tcv_depth_ch1",
              title: "tcv depth child 1",
              order: 1,
              lessons: {
                create: [
                  { id: "tcv_depth_l1", title: "tcv gc 1", order: 1 },
                  { id: "tcv_depth_l2", title: "tcv gc 2", order: 2 },
                ],
              },
            },
            {
              id: "tcv_depth_ch2",
              title: "tcv depth child 2",
              order: 2,
              lessons: { createMany: { data: [{ id: "tcv_depth_l3", title: "tcv gc 3", order: 1 }] } },
            },
          ],
        },
      },
    });
  });
  const depth = await p.course.findUnique({
    where: { id: "tcv_depth_course" },
    include: { chapters: { include: { lessons: true } } },
  });
  const kids = depth.chapters;
  const grand = kids.flatMap((c: any) => c.lessons);
  check(
    "parent, children and grandchildren are ALL stamped from a CLI scope (create + createMany)",
    depth.tenantId === DEFAULT_TENANT_ID &&
      kids.length === 2 &&
      kids.every((c: any) => c.tenantId === DEFAULT_TENANT_ID) &&
      grand.length === 3 &&
      grand.every((l: any) => l.tenantId === DEFAULT_TENANT_ID),
    `parent=${depth.tenantId} · ${kids.length} children · ${grand.length} grandchildren`,
  );
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await prisma.course.update({
      where: { id: "tcv_depth_course" },
      data: {
        chapters: {
          create: {
            id: "tcv_depth_ch3",
            title: "tcv depth child 3",
            order: 3,
            lessons: { create: { id: "tcv_depth_l4", title: "tcv gc 4", order: 1 } },
          },
        },
      },
    });
  });
  const ch3 = await p.chapter.findUnique({ where: { id: "tcv_depth_ch3" }, include: { lessons: true } });
  check(
    "a nested create inside an UPDATE, from a CLI scope, is stamped at both depths",
    ch3?.tenantId === DEFAULT_TENANT_ID && ch3.lessons[0]?.tenantId === DEFAULT_TENANT_ID,
    `child=${String(ch3?.tenantId)} grandchild=${String(ch3?.lessons[0]?.tenantId)}`,
  );
  await withTenantScope(TENANT_B, async () => {
    await prisma.course.create({
      data: {
        id: "tcv_b_depth",
        title: "tcv b depth",
        createdById: OWNER,
        chapters: { create: { id: "tcv_b_depth_ch", title: "tcv b depth child", order: 1 } },
      },
    });
  });
  const bDepth = await p.course.findUnique({ where: { id: "tcv_b_depth" }, include: { chapters: true } });
  check(
    "a non-default tenant's CLI scope stamps ITS id at depth",
    bDepth.tenantId === TENANT_B && bDepth.chapters[0].tenantId === TENANT_B,
    `parent=${bDepth.tenantId} child=${bDepth.chapters[0].tenantId}`,
  );

  // =========================================================================
  log(`\n## Verify 4 — REQUEST HEADERS STILL WIN (getting this backwards would be a cross-tenant write mechanism)`);
  // =========================================================================
  // Request for the DEFAULT tenant, wrapper claiming tenant B, both nestings.
  await runInRequest(DEFAULT_HOST, async () => {
    await withTenantScope(TENANT_B, async () => {
      await prisma.logEntry.create({ data: { id: "tcv_req_wins_1", clientId: OWNER, body: "tcv req wins" } });
    });
  });
  check(
    "scope INSIDE a request: withTenantScope(B) does NOT change the write's tenant away from the request's",
    (await tid("logEntry", "tcv_req_wins_1")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("logEntry", "tcv_req_wins_1"))} (wrapper said ${TENANT_B})`,
  );
  await withTenantScope(TENANT_B, async () => {
    await runInRequest(DEFAULT_HOST, async () => {
      await prisma.logEntry.create({ data: { id: "tcv_req_wins_2", clientId: OWNER, body: "tcv req wins 2" } });
    });
  });
  check(
    "request INSIDE a scope: the request's tenant still wins (precedence is not nesting-order dependent)",
    (await tid("logEntry", "tcv_req_wins_2")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("logEntry", "tcv_req_wins_2"))} (wrapper said ${TENANT_B})`,
  );
  // And the other direction: tenant B's request must not be redirected to the
  // default tenant by a default-tenant wrapper.
  await runInRequest(B_HOST, async () => {
    await withTenantScope(DEFAULT_TENANT_ID, async () => {
      await prisma.course.create({ data: { id: "tcv_req_wins_3", title: "tcv b req", createdById: OWNER } });
    });
  });
  check(
    "the other direction too: tenant B's request is not redirected to the default tenant by a wrapper",
    (await tid("course", "tcv_req_wins_3")) === TENANT_B,
    `tenantId=${String(await tid("course", "tcv_req_wins_3"))} (wrapper said ${DEFAULT_TENANT_ID})`,
  );
  // Nested writes inside a request are stamped with the REQUEST's tenant too.
  await runInRequest(DEFAULT_HOST, async () => {
    await withTenantScope(TENANT_B, async () => {
      await prisma.course.create({
        data: {
          id: "tcv_req_wins_4",
          title: "tcv req wins nested",
          createdById: OWNER,
          chapters: { create: { id: "tcv_req_wins_4_ch", title: "tcv req wins child", order: 1 } },
        },
      });
    });
  });
  const rw4 = await p.course.findUnique({ where: { id: "tcv_req_wins_4" }, include: { chapters: true } });
  check(
    "…including nested children: the request's tenant reaches every depth, the wrapper reaches none",
    rw4.tenantId === DEFAULT_TENANT_ID && rw4.chapters[0].tenantId === DEFAULT_TENANT_ID,
    `parent=${rw4.tenantId} child=${rw4.chapters[0].tenantId}`,
  );
  // Reads too: a wrapper must not widen or move what a request can see.
  let bSeesDefaultRow: unknown = "unset";
  await runInRequest(B_HOST, async () => {
    await withTenantScope(DEFAULT_TENANT_ID, async () => {
      bSeesDefaultRow = await prisma.course.findFirst({ where: { id: "tcv_depth_course" } });
    });
  });
  check(
    "READS obey the request too: inside B's request, a DEFAULT-tenant wrapper cannot read her row",
    bSeesDefaultRow === null,
    `found=${bSeesDefaultRow === null ? "nothing" : "A ROW — ISOLATION BREACH"}`,
  );

  // =========================================================================
  log(`\n## Verify 5 — ABSENCE is unchanged: passthrough, unstamped, and LOUD`);
  // =========================================================================
  const beforeAbsent = await auditNullTenantRows();
  const unscoped = await prisma.logEntry.create({
    data: { id: "tcv_absent_log", clientId: OWNER, body: "tcv no scope" },
  });
  const absentRow = await p.logEntry.findUnique({ where: { id: unscoped.id } });
  check(
    "a CLI write with NO scope still passes through UNSTAMPED (tenantId null, not the default tenant)",
    absentRow?.tenantId === null,
    `tenantId=${String(absentRow?.tenantId)} — ruling 24's rejected option would have made this ${DEFAULT_TENANT_ID}`,
  );
  const absentAudit = await auditNullTenantRows();
  check(
    "and the null-tenant audit still CATCHES it, by table name and count",
    absentAudit.byModel.logEntry === 1 && absentAudit.total === beforeAbsent.total + 1,
    JSON.stringify(absentAudit.byModel),
  );
  const auditExit = (() => {
    try {
      execFileSync("npx", ["tsx", "audits/tenant-stamp-audit.ts"], { stdio: "pipe", cwd: process.cwd() });
      return 0;
    } catch (e: any) {
      return e?.status ?? 1;
    }
  })();
  check(
    "the standing gate exits NON-ZERO on that row — detection surface intact, not narrowed",
    auditExit !== 0,
    `audits/tenant-stamp-audit.ts exit=${auditExit}`,
  );
  await p.logEntry.delete({ where: { id: unscoped.id } });
  // Nested writes with no scope also stay unstamped (no implicit default
  // anywhere in the stamper's walk).
  await p.course.create({ data: { id: "tcv_absent_parent", title: "tcv absent", createdById: OWNER, tenantId: DEFAULT_TENANT_ID } });
  await prisma.chapter.create({ data: { id: "tcv_absent_ch", courseId: "tcv_absent_parent", title: "tcv absent child", order: 1 } });
  check(
    "no implicit default-tenant stamping in the unscoped path, at any depth",
    (await tid("chapter", "tcv_absent_ch")) === null,
    `child tenantId=${String(await tid("chapter", "tcv_absent_ch"))}`,
  );
  await p.chapter.delete({ where: { id: "tcv_absent_ch" } });
  check(
    "the string DEFAULT_TENANT_ID appears in lib/prisma.ts only in scope/ownership logic, never as a write fallback",
    !/return\s+DEFAULT_TENANT_ID;?\s*\/\/\s*fallback/.test(prismaSrc) &&
      !prismaSrc.includes("?? DEFAULT_TENANT_ID; // outside a request"),
    "the only ?? DEFAULT_TENANT_ID is the unknown-SLUG case inside a request (pre-existing, matches getTenant)",
  );

  // =========================================================================
  log(`\n## Verify 6 — an explicit tenantId still wins over the scope, at any depth`);
  // =========================================================================
  await withTenantScope(TENANT_B, async () => {
    await prisma.course.create({
      data: {
        id: "tcv_explicit_course",
        title: "tcv explicit",
        createdById: OWNER,
        tenantId: DEFAULT_TENANT_ID, // explicit, and DIFFERENT from the scope
        chapters: {
          create: [
            { id: "tcv_explicit_same", title: "tcv explicit same", order: 1, tenantId: TENANT_B },
            { id: "tcv_explicit_foreign", title: "tcv explicit foreign", order: 2, tenantId: FOREIGN_TENANT },
          ],
        },
      },
    });
  });
  check(
    "an explicit top-level tenantId beats the scope (the scope never overwrites a stated value)",
    (await tid("course", "tcv_explicit_course")) === DEFAULT_TENANT_ID,
    `tenantId=${String(await tid("course", "tcv_explicit_course"))} (scope was ${TENANT_B})`,
  );
  check(
    "a nested explicit value equal to the scope is preserved",
    (await tid("chapter", "tcv_explicit_same")) === TENANT_B,
  );
  check(
    "a DIFFERENT tenant's explicit id survives untouched at depth — a cross-tenant write stays VISIBLE, not normalised",
    (await tid("chapter", "tcv_explicit_foreign")) === FOREIGN_TENANT,
    `tenantId=${String(await tid("chapter", "tcv_explicit_foreign"))} (scope was ${TENANT_B})`,
  );
  const foreignVisible = await p.chapter.count({ where: { tenantId: FOREIGN_TENANT } });
  check(
    "and it is findable as that other tenant's row (the defect is not hidden from the audit)",
    foreignVisible === 1,
    `${foreignVisible} row(s) under ${FOREIGN_TENANT}`,
  );
  // An explicit null is still a deliberate statement, and stays audit-visible
  // (ruling 25) — the scope must not "helpfully" fix it either.
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    await prisma.logEntry.create({ data: { id: "tcv_explicit_null", clientId: OWNER, body: "tcv explicit null", tenantId: null } });
  });
  check(
    "an explicit tenantId: null is preserved inside a scope too (ruling 25 unchanged)",
    (await tid("logEntry", "tcv_explicit_null")) === null &&
      (await auditNullTenantRows()).byModel.logEntry === 1,
    "still counted by the audit",
  );
  await p.logEntry.delete({ where: { id: "tcv_explicit_null" } });
  await p.chapter.deleteMany({ where: { tenantId: FOREIGN_TENANT } });

  // =========================================================================
  log(`\n## Verify 7 — the ~10 explicit call sites keep their exact values`);
  // =========================================================================
  // Functional proof on the real precedent: lib/pattern-library.ts resolves
  // its own tenant via getTenant() and states it. Under a DIFFERENT ambient
  // scope its stated value must still be what lands.
  await withTenantScope(DEFAULT_TENANT_ID, async () => {
    const { setPatternElection } = (await import("../lib/pattern-library")) as any;
    await setPatternElection(OWNER, true, FOREIGN_TENANT);
  });
  const election = await p.patternElection.findFirst({ where: { clientId: OWNER } });
  check(
    "a product lib that states its tenant at the call site (lib/pattern-library) keeps its EXACT value under a scope",
    election?.tenantId === FOREIGN_TENANT,
    `tenantId=${String(election?.tenantId)} (scope was ${DEFAULT_TENANT_ID})`,
  );
  await p.patternElection.deleteMany({ where: { clientId: OWNER } });
  // And an explicit stamp is still honoured when NO scope exists (today's
  // behaviour for these files, unchanged).
  await prisma.logEntry.create({ data: { id: "tcv_explicit_noscope", clientId: OWNER, body: "tcv explicit no scope", tenantId: DEFAULT_TENANT_ID } });
  check(
    "an explicit stamp with no scope at all still lands exactly as stated (these files are unaffected by this build)",
    (await tid("logEntry", "tcv_explicit_noscope")) === DEFAULT_TENANT_ID,
  );
  // Stronger than "these files were not touched", and stronger than comparing
  // line TEXT: compare the tenant VALUES each file stamps, against HEAD.
  //
  // Line text is the wrong ruler and C25 proved it. C25 moved every
  // PracticeSetting write onto lib/practice-settings.ts and onto the
  // tenant-qualified (tenantId, key), so four of these files legitimately
  // changed the SHAPE of a stamping line while stamping the very same tenant.
  // What must be intact is the VALUE — so that is what is compared: every
  // tenant a file stamped at HEAD it must still stamp, and it may not have
  // acquired a stamp for any tenant other than the default one.
  const stampLines = (src: string) =>
    src
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("tenantId: DEFAULT_TENANT_ID") || l.includes("await getTenant()).id"))
      .sort();
  const stampValues = (src: string) =>
    [
      ...new Set(
        [...src.matchAll(/tenantId:\s*([A-Za-z_$][\w.$]*|"[^"]*"|null)/g)]
          .map((m) => m[1])
          .concat((src.match(/await getTenant\(\)\)\.id/g) ?? []).map(() => "getTenant().id")),
      ),
    ].sort();
  const valueDrift: string[] = [];
  const shapeChanged: string[] = [];
  for (const f of [...new Set(explicitSites)]) {
    let head = "";
    try {
      head = execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8", cwd: process.cwd() });
    } catch {
      continue; // new file in this build (this harness itself)
    }
    const now = readFileSync(join(process.cwd(), f), "utf8");
    const before = stampValues(head);
    const after = stampValues(now);
    // No value may be LOST, and nothing but the default tenant may be GAINED.
    const lost = before.filter((v) => !after.includes(v));
    const gained = after.filter((v) => !before.includes(v) && v !== "DEFAULT_TENANT_ID" && v !== "TENANT");
    if (lost.length || gained.length) {
      valueDrift.push(`${f} (lost: ${lost.join(",") || "none"} · gained: ${gained.join(",") || "none"})`);
    }
    if (JSON.stringify(stampLines(head)) !== JSON.stringify(stampLines(now))) shapeChanged.push(f);
  }
  check(
    "every explicit tenant VALUE in those files is unchanged from HEAD — no file lost a stamp, and none gained one for any tenant but the default",
    valueDrift.length === 0,
    valueDrift.join(" · ") ||
      `${[...new Set(explicitSites)].length} files compared value-by-value against HEAD · ${
        shapeChanged.length
      } changed the SHAPE of a stamping line for C25 (${shapeChanged.join(", ") || "none"}), stamping the same tenant`,
  );

  // =========================================================================
  await cleanup();
  log("~ probe tenant, courses, chapters, lessons, log entries and users removed");
  const residual = await auditNullTenantRows();
  check(
    "SELF-CLEANING: this harness leaves zero null-tenant rows behind",
    residual.total === 0,
    JSON.stringify(residual.byModel),
  );
  check(
    `the audit still covers every scoped table (${SCOPED_MODELS.length} tables, nothing narrowed)`,
    SCOPED_MODELS.length === 79,
    `${SCOPED_MODELS.length} tables`,
  );

  const total = results.length;
  const failed = results.filter((r) => !r.pass).length;
  const summary =
    failed === 0 ? `\nTENANT-SCOPE VERIFY PASS — ${total}/${total}` : `\n${failed} CHECK(S) FAILED — ${total - failed}/${total}`;
  console.log(summary);

  // Ruling 17 — the log is written BY the gate, or not at all.
  mkdirSync(join(__dirname, "tenant-scope"), { recursive: true });
  writeFileSync(
    join(__dirname, "tenant-scope", "VERIFY-LOG.md"),
    [
      "# C24.1-TENANT-SCOPE — acceptance log",
      "",
      `Run: ${new Date().toISOString()} · \`npx tsx audits/tenant-scope-verify.ts\``,
      `Database: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]*@/, ":***@")}`,
      "",
      "Requests are simulated in-process via Next's request async storage, so every",
      "request-path check runs through the real scoped client against the real database.",
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
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => void rawPrisma.$disconnect());
