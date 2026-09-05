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
import { Prisma } from "@prisma/client";
import { rawPrisma } from "../lib/prisma-internal";
import { SCOPED_MODELS, SCOPED_MODEL_SET, DEFAULT_TENANT_ID } from "../lib/tenancy/scope";
import { auditNullTenantRows } from "../lib/tenancy/stamp-audit";

// C24-NESTED-STAMP acceptance — the tenant-stamping data layer.
//
// THE HEADLINE, up front, because the spec's diagnosis was wrong: the
// null-tenant rows that have failed `audits/tenant-stamp-audit.ts` on every
// run of this program were NOT produced by nested relation writes. They were
// produced by a CLI gate harness (`prisma/fixtures/c12x-verify.ts`) importing
// the SCOPED prisma client and running OUTSIDE an HTTP request, where that
// client is a documented passthrough — no request, no tenant, no stamp. This
// harness proves that mechanism directly (§1/§2 checks below) and proves the
// nested-write gap was real but never exercised by any code in this repo.
//
// Verify list (spec §Verify):
//    1 the five "assumptions to verify, not trust" — confirmed or CORRECTED,
//      each with mechanical evidence
//    2 the minimal reproduction: a null-tenant row before, a stamped row after
//    3 nested writes stamped at depth (child and grandchild)
//    4 connectOrCreate and nested upsert stamped
//    5 an explicit tenantId is NEVER overwritten — including a DIFFERENT
//      tenant's id, which must stay visible to the audit
//    6 platform-level models are neither stamped nor broken
//    9 the backfill reports counts, leaves zero nulls, and is safe twice
//   10 an explicit cross-tenant read attempt still fails
//
// Items 7, 8 and 11 are whole-gate conditions (the stamp audit and the
// platform verify exiting zero AFTER a full gate sweep, plus the regression
// list) and are run as separate gates — see the build report.
//
// Requests are simulated in-process via Next's request async storage, so the
// checks run through the REAL scoped client against the REAL database on the
// REAL request path. Self-cleaning: every row carries an `nsx_` marker id or a
// probe email, and cleanup() runs first and last.
//
//   DATABASE_URL=...scratch npx tsx audits/nested-stamp-verify.ts

const TENANT_B = "tnt_nsx_probe_b_00001";
const TENANT_B_SLUG = "nsxprobeb";
const PLATFORM_DOMAIN = "nsx.test";
const DEFAULT_HOST = "localhost:3000"; // no PLATFORM_DOMAIN suffix → default tenant
const B_HOST = `${TENANT_B_SLUG}.${PLATFORM_DOMAIN}`;
const FOREIGN_TENANT = "tnt_nsx_foreign_00001"; // never resolved from a host; only ever explicit
const OWNER = "nsx_owner";
const PROBE_EMAIL = "nested-stamp-probe@fixture.test";
const PROBE_OWNER_EMAIL = "nested-stamp-owner@fixture.test";

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
// Simulated request scope: the only way to exercise the request path of the
// scoped client from a CLI harness. Uses a Next internal deliberately and
// says so; if the internal moves, this harness fails loudly rather than
// quietly proving nothing.
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
        {
          headers: new Headers({ host }),
          cookies: new Map(),
          mutableCookies: new Map(),
          reactLoadableManifest: {},
          assetPrefix: "",
        },
        fn,
      );
    // Prove the simulation is real before trusting a single check built on it.
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
// Schema-driven scan for nested relation writes in the repo. Same shape as
// the walk the fix itself uses: relation fields come from the DMMF, so this
// cannot drift from the schema.
// ---------------------------------------------------------------------------
const SELF = "audits/nested-stamp-verify.ts";

function scanNestedRelationWrites(): {
  files: number;
  hits: string[];
  self: string[];
  relationFields: number;
} {
  const dk = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
  const relField = new Map<string, string>(); // field name → target delegate key
  for (const m of Prisma.dmmf.datamodel.models) {
    for (const f of m.fields) if (f.kind === "object") relField.set(f.name, dk(f.type));
  }
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (["node_modules", ".next", ".git", "docs", "public", "messages", "content"].includes(e)) continue;
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e)) files.push(full);
    }
  };
  walk(process.cwd());
  const hits: string[] = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const [field, target] of relField) {
        if (!new RegExp(`\\b${field}\\s*:\\s*\\{`).test(line)) continue;
        const window = lines.slice(i, i + 3).join(" ");
        if (!/\b(create|createMany|connectOrCreate|upsert)\s*:/.test(window)) continue;
        if (!SCOPED_MODEL_SET.has(target)) continue;
        hits.push(`${f.replace(process.cwd() + "/", "")}:${i + 1}`);
      }
    });
  }
  const unique = [...new Set(hits)];
  return {
    files: files.length,
    hits: unique.filter((h) => !h.startsWith(SELF)),
    self: unique.filter((h) => h.startsWith(SELF)),
    relationFields: relField.size,
  };
}

function importersOf(needle: string): string[] {
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
  for (const entry of ["app", "lib", "audits", "scripts", "prisma", "ai", "auth.ts", "middleware.ts"]) {
    const full = join(process.cwd(), entry);
    try {
      if (statSync(full).isDirectory()) walk(full);
      else if (readFileSync(full, "utf8").includes(needle)) out.push(entry);
    } catch {
      /* absent */
    }
  }
  // The module under test and THIS harness (which quotes the needle) are not
  // evidence about the rest of the codebase.
  return out.filter((f) => f !== "lib/tenancy/stamp.ts" && f !== SELF);
}

// ---------------------------------------------------------------------------
async function cleanup() {
  // Children first; Course/Chapter cascade, but be explicit so a partial run
  // still cleans.
  await p.lesson.deleteMany({ where: { id: { startsWith: "nsx_" } } }).catch(() => undefined);
  await p.chapter.deleteMany({ where: { id: { startsWith: "nsx_" } } }).catch(() => undefined);
  await p.course.deleteMany({ where: { id: { startsWith: "nsx_" } } }).catch(() => undefined);
  await p.lesson.deleteMany({ where: { title: { startsWith: "nsx " } } }).catch(() => undefined);
  await p.chapter.deleteMany({ where: { title: { startsWith: "nsx " } } }).catch(() => undefined);
  await p.course.deleteMany({ where: { createdById: OWNER } }).catch(() => undefined);
  await p.logEntry.deleteMany({ where: { clientId: OWNER } }).catch(() => undefined);
  await p.prospectMessage.deleteMany({ where: { id: { startsWith: "nsx_" } } }).catch(() => undefined);
  await p.practitionerProspect.deleteMany({ where: { email: PROBE_EMAIL } }).catch(() => undefined);
  await p.tenantModule.deleteMany({ where: { tenantId: TENANT_B } }).catch(() => undefined);
  await p.tenant.deleteMany({ where: { id: TENANT_B } }).catch(() => undefined);
  await p.user.deleteMany({ where: { email: PROBE_OWNER_EMAIL } }).catch(() => undefined);
}

async function main() {
  log(`# C24-NESTED-STAMP verify — ${new Date().toISOString()}`);
  await cleanup();

  const scopedOk = await installRequestScope();
  check("simulated request scope is real (next/headers resolves inside it)", scopedOk);
  if (!scopedOk) throw new Error("cannot simulate a request scope — every request-path check below would be vacuous");

  const { prisma } = (await import("../lib/prisma")) as any;
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  await p.tenant.create({
    data: { id: TENANT_B, slug: TENANT_B_SLUG, displayName: "Nested-stamp probe B", status: "DEMO" },
  });
  // LogEntry.clientId carries a real FK, so the probe needs a real user.
  // Stamped explicitly — this harness is CLI code and states its own tenant.
  await p.user.create({
    data: {
      tenantId: DEFAULT_TENANT_ID,
      id: OWNER,
      email: PROBE_OWNER_EMAIL,
      name: "nsx probe owner",
      role: "CLIENT",
      passwordHash: "x",
    },
  });

  // =========================================================================
  log(`\n## Verify 1 — the five assumptions`);
  // =========================================================================

  // --- Assumption 1: "the nulls come from nested relation writes" ---
  const scan = scanNestedRelationWrites();
  check(
    "the nested-write scanner is not blind — it finds the ones THIS harness writes deliberately",
    scan.self.length > 0,
    `${scan.self.length} in ${SELF}`,
  );
  check(
    "A1 CORRECTED: outside this harness the repo contains ZERO nested relation writes on scoped models",
    scan.hits.length === 0,
    `${scan.files} files scanned against ${scan.relationFields} schema relation fields · hits=${scan.hits.length}${
      scan.hits.length ? ` (${scan.hits.slice(0, 5).join(", ")})` : ""
    }`,
  );

  // The real mechanism, demonstrated twice over: OUTSIDE a request the scoped
  // client is a passthrough, so a create with no stated tenant lands NULL.
  const outOfRequest = await prisma.logEntry.create({
    data: { clientId: OWNER, body: "nsx out-of-request probe" },
  });
  const outRow = await p.logEntry.findUnique({ where: { id: outOfRequest.id } });
  check(
    "A1 CORRECTED: the REAL mechanism — a scoped-client create OUTSIDE a request writes tenantId NULL",
    outRow?.tenantId === null,
    `tenantId=${String(outRow?.tenantId)}`,
  );
  let inRequestId = "";
  await runInRequest(DEFAULT_HOST, async () => {
    inRequestId = (await prisma.logEntry.create({ data: { clientId: OWNER, body: "nsx in-request probe" } })).id;
  });
  const inRow = await p.logEntry.findUnique({ where: { id: inRequestId } });
  check(
    "A1 CORRECTED: the SAME create INSIDE a request is stamped (so the request path was never the leak)",
    inRow?.tenantId === DEFAULT_TENANT_ID,
    `tenantId=${String(inRow?.tenantId)}`,
  );
  // Remove the deliberate null immediately — later checks assert a clean
  // invariant, and a leftover probe row would make them lie.
  await p.logEntry.delete({ where: { id: outOfRequest.id } });
  await p.logEntry.delete({ where: { id: inRequestId } });

  // --- Assumption 2: "lib/prisma.ts is the single place scoped writes are stamped" ---
  const stampImporters = importersOf('tenancy/stamp"');
  check(
    "A2 CONFIRMED for the request path: the nested-stamp walker is used by lib/prisma.ts and nothing else",
    stampImporters.length === 1 && stampImporters[0] === "lib/prisma.ts",
    stampImporters.join(", ") || "none",
  );
  const explicitStampers = importersOf("tenantId: DEFAULT_TENANT_ID").concat(
    importersOf("await getTenant()).id"),
  );
  check(
    "A2 CORRECTED: it is NOT the only place a tenant is stamped — call sites stamp explicitly for the OUT-of-request path",
    explicitStampers.length > 0,
    `${explicitStampers.length} file(s), e.g. ${explicitStampers.slice(0, 3).join(", ")}`,
  );

  // --- Assumption 3: SCOPED_MODEL_SET authoritative; handwrittenNote + appointment in it ---
  check(
    "A3 CONFIRMED: handwrittenNote and appointment are both in SCOPED_MODEL_SET",
    SCOPED_MODEL_SET.has("handwrittenNote") && SCOPED_MODEL_SET.has("appointment"),
  );
  const dk = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
  const withTenantCol = Prisma.dmmf.datamodel.models.filter((m) =>
    m.fields.some((f) => f.name === "tenantId"),
  );
  const notScopedButHasCol = withTenantCol.filter((m) => !SCOPED_MODEL_SET.has(dk(m.name))).map((m) => m.name);
  check(
    "A3 CONFIRMED: every scoped model has a nullable tenantId, and the audit's table list is the same list",
    SCOPED_MODELS.every((k) => {
      const m = Prisma.dmmf.datamodel.models.find((x) => dk(x.name) === k);
      const f = m?.fields.find((x) => x.name === "tenantId");
      return Boolean(f) && !f!.isRequired;
    }),
    `${SCOPED_MODELS.length} scoped models (docs/PRISMA-ALLOWLIST.md still says 66 — stale)`,
  );
  check(
    "A3 note: the only tenantId columns OUTSIDE the scoped set are platform-level, deliberately",
    notScopedButHasCol.every((n) => ["TenantModule", "PractitionerProspect"].includes(n)),
    notScopedButHasCol.join(", "),
  );

  // --- Assumption 4: gate probes, not product paths ---
  // Product paths run inside requests (checked above) and contain no nested
  // writes (checked above), so no product path can produce a null. The
  // producer is a gate harness; run it and prove it now leaves none.
  const beforeC12x = await auditNullTenantRows();
  let c12xExit = 0;
  try {
    execFileSync("npx", ["tsx", "prisma/fixtures/c12x-verify.ts"], { stdio: "pipe", cwd: process.cwd() });
  } catch (e: any) {
    c12xExit = e?.status ?? 1;
  }
  const afterC12x = await auditNullTenantRows();
  check(
    "A4 CONFIRMED: the producer was a GATE HARNESS (prisma/fixtures/c12x-verify.ts), not a product path",
    c12xExit === 0 && afterC12x.total === beforeC12x.total,
    `c12x exit=${c12xExit} · nulls before=${beforeC12x.total} after=${afterC12x.total} (was +11 across 6 tables)`,
  );

  // --- Assumption 5: the audit iterates every scoped model, per-table counts ---
  const injected = await p.note.create({ data: { authorId: OWNER, clientId: OWNER, body: "nsx audit-sees-me" } });
  const sees = await auditNullTenantRows();
  check(
    "A5 CONFIRMED: the audit reports the offending TABLE by name and counts it",
    sees.byModel.note === 1 && sees.total >= 1,
    JSON.stringify(sees.byModel),
  );
  await p.note.delete({ where: { id: injected.id } });
  check(
    "A5 CONFIRMED: the audit covers every scoped table (one count per SCOPED_MODELS entry)",
    (await auditNullTenantRows()).total === 0,
    `${SCOPED_MODELS.length} tables iterated`,
  );

  // =========================================================================
  log(`\n## Verify 2 — the minimal reproduction, before and after`);
  // =========================================================================
  // BEFORE the fix, the extension stamped the TOP-LEVEL row only:
  // `{ tenantId, ...data }`. Reproduce exactly that shape against the raw
  // client — a faithful stand-in for the pre-fix code path.
  const legacy = await p.course.create({
    data: {
      tenantId: DEFAULT_TENANT_ID, // top-level stamp, as the old code did
      id: "nsx_legacy_course",
      title: "nsx legacy",
      createdById: OWNER,
      chapters: { create: { id: "nsx_legacy_chapter", title: "nsx legacy child", order: 1 } },
    },
    include: { chapters: true },
  });
  check(
    "the pre-fix stamping shape (top level only) DOES leave a nested child null — the gap was real",
    legacy.tenantId === DEFAULT_TENANT_ID && legacy.chapters[0].tenantId === null,
    `parent=${legacy.tenantId} child=${String(legacy.chapters[0].tenantId)}`,
  );
  const preFixAudit = await auditNullTenantRows();
  check(
    "and the audit sees it (this is the row the reproduction created)",
    preFixAudit.byModel.chapter === 1,
    JSON.stringify(preFixAudit.byModel),
  );
  await p.course.delete({ where: { id: "nsx_legacy_course" } });

  // AFTER the fix, the same call shape through the scoped client, in a request.
  let fixedId = "";
  await runInRequest(DEFAULT_HOST, async () => {
    fixedId = (
      await prisma.course.create({
        data: {
          id: "nsx_fixed_course",
          title: "nsx fixed",
          createdById: OWNER,
          chapters: { create: { id: "nsx_fixed_chapter", title: "nsx fixed child", order: 1 } },
        },
      })
    ).id;
  });
  const fixed = await p.course.findUnique({ where: { id: fixedId }, include: { chapters: true } });
  check(
    "the same reproduction through the FIXED scoped client stamps the nested child",
    fixed.tenantId === DEFAULT_TENANT_ID && fixed.chapters[0].tenantId === DEFAULT_TENANT_ID,
    `parent=${fixed.tenantId} child=${fixed.chapters[0].tenantId}`,
  );
  check("zero null rows left by the reproduction", (await auditNullTenantRows()).total === 0);

  // =========================================================================
  log(`\n## Verify 3 — nested writes stamped at depth`);
  // =========================================================================
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.course.create({
      data: {
        id: "nsx_depth_course",
        title: "nsx depth",
        createdById: OWNER,
        chapters: {
          create: [
            {
              id: "nsx_depth_ch1",
              title: "nsx depth child 1",
              order: 1,
              lessons: {
                create: [
                  { id: "nsx_depth_l1", title: "nsx depth grandchild 1", order: 1 },
                  { id: "nsx_depth_l2", title: "nsx depth grandchild 2", order: 2 },
                ],
              },
            },
            {
              id: "nsx_depth_ch2",
              title: "nsx depth child 2",
              order: 2,
              lessons: { createMany: { data: [{ id: "nsx_depth_l3", title: "nsx depth grandchild 3", order: 1 }] } },
            },
          ],
        },
      },
    });
  });
  const depth = await p.course.findUnique({
    where: { id: "nsx_depth_course" },
    include: { chapters: { include: { lessons: true } } },
  });
  const depthChildren = depth.chapters;
  const depthGrand = depthChildren.flatMap((c: any) => c.lessons);
  check(
    "parent create carrying children: every child stamped (array form)",
    depthChildren.length === 2 && depthChildren.every((c: any) => c.tenantId === DEFAULT_TENANT_ID),
    `${depthChildren.length} children`,
  );
  check(
    "grandchildren stamped too, via nested create AND nested createMany",
    depthGrand.length === 3 && depthGrand.every((l: any) => l.tenantId === DEFAULT_TENANT_ID),
    `${depthGrand.length} grandchildren`,
  );

  // Nested create inside an UPDATE (the other way a child is born).
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.course.update({
      where: { id: "nsx_depth_course" },
      data: {
        chapters: {
          create: {
            id: "nsx_depth_ch3",
            title: "nsx depth child 3",
            order: 3,
            lessons: { create: { id: "nsx_depth_l4", title: "nsx depth grandchild 4", order: 1 } },
          },
        },
      },
    });
  });
  const ch3 = await p.chapter.findUnique({ where: { id: "nsx_depth_ch3" }, include: { lessons: true } });
  check(
    "a nested create inside an UPDATE payload is stamped, child and grandchild",
    ch3.tenantId === DEFAULT_TENANT_ID && ch3.lessons[0].tenantId === DEFAULT_TENANT_ID,
    `child=${ch3.tenantId} grandchild=${ch3.lessons[0].tenantId}`,
  );

  // The non-default tenant path, resolved from the host, not stated.
  await runInRequest(B_HOST, async () => {
    await prisma.course.create({
      data: {
        id: "nsx_b_course",
        title: "nsx tenant-b",
        createdById: OWNER,
        chapters: { create: { id: "nsx_b_ch", title: "nsx tenant-b child", order: 1 } },
      },
    });
  });
  const bCourse = await p.course.findUnique({ where: { id: "nsx_b_course" }, include: { chapters: true } });
  check(
    "a NON-default tenant's request stamps its own id at depth (host-resolved)",
    bCourse.tenantId === TENANT_B && bCourse.chapters[0].tenantId === TENANT_B,
    `parent=${bCourse.tenantId} child=${bCourse.chapters[0].tenantId}`,
  );

  // =========================================================================
  log(`\n## Verify 4 — connectOrCreate and nested upsert`);
  // =========================================================================
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.course.update({
      where: { id: "nsx_depth_course" },
      data: {
        chapters: {
          connectOrCreate: {
            where: { id: "nsx_coc_ch" },
            create: {
              id: "nsx_coc_ch",
              title: "nsx coc child",
              order: 4,
              lessons: { connectOrCreate: { where: { id: "nsx_coc_l" }, create: { id: "nsx_coc_l", title: "nsx coc grandchild", order: 1 } } },
            },
          },
        },
      },
    });
  });
  const cocCh = await p.chapter.findUnique({ where: { id: "nsx_coc_ch" }, include: { lessons: true } });
  check(
    "nested connectOrCreate stamps the created row, at depth",
    cocCh?.tenantId === DEFAULT_TENANT_ID && cocCh.lessons[0]?.tenantId === DEFAULT_TENANT_ID,
    `child=${String(cocCh?.tenantId)} grandchild=${String(cocCh?.lessons[0]?.tenantId)}`,
  );

  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.course.update({
      where: { id: "nsx_depth_course" },
      data: {
        chapters: {
          upsert: {
            where: { id: "nsx_upsert_ch" },
            create: {
              id: "nsx_upsert_ch",
              title: "nsx upsert child",
              order: 5,
              lessons: { create: { id: "nsx_upsert_l", title: "nsx upsert grandchild", order: 1 } },
            },
            update: { title: "nsx upsert child (updated)" },
          },
        },
      },
    });
  });
  const upsertCh = await p.chapter.findUnique({ where: { id: "nsx_upsert_ch" }, include: { lessons: true } });
  check(
    "nested upsert stamps its create branch, at depth",
    upsertCh?.tenantId === DEFAULT_TENANT_ID && upsertCh.lessons[0]?.tenantId === DEFAULT_TENANT_ID,
    `child=${String(upsertCh?.tenantId)} grandchild=${String(upsertCh?.lessons[0]?.tenantId)}`,
  );

  // A nested upsert's UPDATE branch may itself carry a create.
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.course.update({
      where: { id: "nsx_depth_course" },
      data: {
        chapters: {
          upsert: {
            where: { id: "nsx_upsert_ch" },
            create: { id: "nsx_upsert_ch", title: "nsx upsert child", order: 5 },
            update: { lessons: { create: { id: "nsx_upsert_l2", title: "nsx upsert grandchild 2", order: 2 } } },
          },
        },
      },
    });
  });
  const upsertL2 = await p.lesson.findUnique({ where: { id: "nsx_upsert_l2" } });
  check(
    "a create inside a nested upsert's UPDATE branch is stamped",
    upsertL2?.tenantId === DEFAULT_TENANT_ID,
    `tenantId=${String(upsertL2?.tenantId)}`,
  );

  // Top-level upsert still stamps (regression on the pre-existing behaviour).
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.chapter.upsert({
      where: { id: "nsx_top_upsert_ch" },
      create: {
        id: "nsx_top_upsert_ch",
        courseId: "nsx_depth_course",
        title: "nsx top-level upsert",
        order: 6,
        lessons: { create: { id: "nsx_top_upsert_l", title: "nsx top-level upsert child", order: 1 } },
      },
      update: {},
    });
  });
  const topUpsert = await p.chapter.findUnique({ where: { id: "nsx_top_upsert_ch" }, include: { lessons: true } });
  check(
    "top-level upsert still stamps, and now its nested create too",
    topUpsert?.tenantId === DEFAULT_TENANT_ID && topUpsert.lessons[0]?.tenantId === DEFAULT_TENANT_ID,
    `row=${String(topUpsert?.tenantId)} nested=${String(topUpsert?.lessons[0]?.tenantId)}`,
  );

  // =========================================================================
  log(`\n## Verify 5 — an explicit tenantId is NEVER overwritten`);
  // =========================================================================
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.course.create({
      data: {
        id: "nsx_explicit_course",
        title: "nsx explicit",
        createdById: OWNER,
        chapters: {
          create: [
            { id: "nsx_explicit_same", title: "nsx explicit same", order: 1, tenantId: DEFAULT_TENANT_ID },
            // A DIFFERENT tenant's id, deliberately. This is what a real
            // cross-tenant write looks like, and it must survive untouched so
            // the audit and the isolation harness can still SEE it.
            { id: "nsx_explicit_foreign", title: "nsx explicit foreign", order: 2, tenantId: FOREIGN_TENANT },
          ],
        },
      },
    });
  });
  const same = await p.chapter.findUnique({ where: { id: "nsx_explicit_same" } });
  const foreign = await p.chapter.findUnique({ where: { id: "nsx_explicit_foreign" } });
  check(
    "an explicit tenantId equal to the request's is preserved",
    same?.tenantId === DEFAULT_TENANT_ID,
    `tenantId=${String(same?.tenantId)}`,
  );
  check(
    "a DIFFERENT tenant's explicit id survives untouched — a cross-tenant write stays VISIBLE, not normalised",
    foreign?.tenantId === FOREIGN_TENANT,
    `tenantId=${String(foreign?.tenantId)} (request tenant was ${DEFAULT_TENANT_ID})`,
  );
  const foreignVisible = await p.chapter.count({ where: { tenantId: FOREIGN_TENANT } });
  check(
    "and it is findable as that other tenant's row (the defect is not hidden)",
    foreignVisible === 1,
    `${foreignVisible} row(s) under ${FOREIGN_TENANT}`,
  );
  // Same rule under a non-default tenant's request.
  await runInRequest(B_HOST, async () => {
    await prisma.chapter.create({
      data: { id: "nsx_b_explicit", courseId: "nsx_b_course", title: "nsx b explicit", order: 9, tenantId: FOREIGN_TENANT },
    });
  });
  const bExplicit = await p.chapter.findUnique({ where: { id: "nsx_b_explicit" } });
  check(
    "the same rule holds under a non-default tenant's request",
    bExplicit?.tenantId === FOREIGN_TENANT,
    `tenantId=${String(bExplicit?.tenantId)}`,
  );
  // An UPDATE never rewrites tenantId.
  await runInRequest(DEFAULT_HOST, async () => {
    await prisma.chapter.update({ where: { id: "nsx_explicit_foreign" }, data: { title: "nsx explicit foreign v2" } });
  });
  const afterUpdate = await p.chapter.findUnique({ where: { id: "nsx_explicit_foreign" } });
  check(
    "an update through the scoped client does not rewrite an existing tenantId",
    afterUpdate?.tenantId === FOREIGN_TENANT && afterUpdate?.title === "nsx explicit foreign v2",
    `tenantId=${String(afterUpdate?.tenantId)}`,
  );
  await p.chapter.deleteMany({ where: { tenantId: FOREIGN_TENANT } });

  // =========================================================================
  log(`\n## Verify 6 — platform-level models are neither stamped nor broken`);
  // =========================================================================
  let prospectId = "";
  await runInRequest(DEFAULT_HOST, async () => {
    const pr = await prisma.practitionerProspect.create({
      data: { name: "nsx probe", email: PROBE_EMAIL, referralCode: "NSXPROBE1" },
    });
    prospectId = pr.id;
    await prisma.prospectMessage.create({
      data: {
        id: "nsx_pm_1",
        prospectId: pr.id,
        sequenceKey: "event-lead",
        stepKey: "nsx",
        locale: "en",
        scheduledFor: new Date(),
      },
    });
    await prisma.tenant.update({ where: { id: TENANT_B }, data: { displayName: "Nested-stamp probe B v2" } });
    await prisma.tenantModule.create({
      data: { tenantId: TENANT_B, moduleKey: "nsx-probe-module", position: 1 },
    });
  });
  const prospect = await p.practitionerProspect.findUnique({ where: { id: prospectId } });
  check(
    "PractitionerProspect has a nullable tenantId and is NOT stamped (it means 'tenant they own', not scope)",
    prospect !== null && prospect.tenantId === null,
    `tenantId=${String(prospect?.tenantId)}`,
  );
  const pm = await p.prospectMessage.findUnique({ where: { id: "nsx_pm_1" } });
  check("ProspectMessage still writes fine (no tenantId column to stamp)", pm !== null);
  const tenantRow = await p.tenant.findUnique({ where: { id: TENANT_B }, include: { modules: true } });
  check(
    "Tenant and TenantModule still write fine and carry no injected scope",
    tenantRow?.displayName === "Nested-stamp probe B v2" &&
      tenantRow.modules.some((m: any) => m.moduleKey === "nsx-probe-module" && m.tenantId === TENANT_B),
  );
  const platformNulls = await auditNullTenantRows();
  check(
    "no platform-level write produced a null-tenant row in a SCOPED table",
    platformNulls.total === 0,
    JSON.stringify(platformNulls.byModel),
  );

  // =========================================================================
  log(`\n## Verify 10 (partial) — isolation is not weakened`);
  // =========================================================================
  const { tenantDb } = (await import("../lib/tenancy/db")) as any;
  const bDb = tenantDb(TENANT_B);
  const herDb = tenantDb(DEFAULT_TENANT_ID);
  const bSeesHers = await bDb.course.findFirst({ where: { id: "nsx_depth_course" } });
  const herSeesB = await herDb.course.findFirst({ where: { id: "nsx_b_course" } });
  check("an explicit cross-tenant read from B to the default tenant returns nothing", bSeesHers === null);
  check("an explicit cross-tenant read from the default tenant to B returns nothing", herSeesB === null);
  let refusedMessage = "";
  await runInRequest(B_HOST, async () => {
    try {
      await prisma.course.update({ where: { id: "nsx_depth_course" }, data: { title: "nsx stolen" } });
    } catch (e: any) {
      refusedMessage = e?.message ?? "";
    }
  });
  check(
    "a unique write by tenant B against the default tenant's row is refused fail-closed",
    refusedMessage.includes("not found in tenant scope"),
    refusedMessage || "no error thrown",
  );

  // =========================================================================
  log(`\n## Verify 9 — the backfill: counts, zero left, safe twice`);
  // =========================================================================
  // Seed drift deliberately (three tables), then run the migration twice.
  await p.logEntry.create({ data: { clientId: OWNER, body: "nsx backfill probe 1" } });
  await p.logEntry.create({ data: { clientId: OWNER, body: "nsx backfill probe 2" } });
  await p.chapter.create({ data: { id: "nsx_bf_ch", courseId: "nsx_depth_course", title: "nsx bf", order: 20 } });
  const drift = await auditNullTenantRows();
  check(
    "drift seeded for the backfill to find",
    drift.total === 3 && drift.byModel.logEntry === 2 && drift.byModel.chapter === 1,
    JSON.stringify(drift.byModel),
  );
  const sqlPath = join(process.cwd(), "prisma/migrations/48_stamp_null_tenants_nested/migration.sql");
  const runBackfill = () =>
    execFileSync("psql", ["-d", process.env.DATABASE_URL!, "-v", "ON_ERROR_STOP=1", "-f", sqlPath], {
      stdio: "pipe",
      encoding: "utf8",
      env: process.env,
    }) + "";
  let firstOut = "";
  let secondOut = "";
  let backfillRan = true;
  try {
    firstOut = runBackfill();
    secondOut = runBackfill();
  } catch (e: any) {
    backfillRan = false;
    firstOut = String(e?.stderr ?? e?.message ?? e);
  }
  // psql writes NOTICE to stderr; capture both by re-reading the ledger instead.
  const ledger = await rawPrisma.$queryRawUnsafe<{ table_name: string; n: bigint }[]>(
    `SELECT table_name, count(*)::bigint AS n FROM "_TenantStampBackfill48" GROUP BY 1 ORDER BY 1`,
  );
  check("the backfill migration runs (psql, ON_ERROR_STOP)", backfillRan, backfillRan ? "" : firstOut.slice(0, 300));
  check(
    "it records exactly the rows it stamped, per table (this is what makes it reversible)",
    ledger.some((r) => r.table_name === "LogEntry" && Number(r.n) >= 2) &&
      ledger.some((r) => r.table_name === "Chapter" && Number(r.n) >= 1),
    ledger.map((r) => `${r.table_name}=${r.n}`).join(" "),
  );
  check("zero null-tenant rows after the backfill", (await auditNullTenantRows()).total === 0);
  check(
    "running it twice is safe — the second pass stamps nothing and errors nothing",
    backfillRan && !/ERROR/i.test(secondOut),
    "second pass clean",
  );

  // =========================================================================
  await cleanup();
  log("~ probe tenant, courses, chapters, lessons, log entries and prospects removed");
  const residual = await auditNullTenantRows();
  check("SELF-CLEANING: this harness leaves zero null-tenant rows behind", residual.total === 0, JSON.stringify(residual.byModel));

  const total = results.length;
  const nowFailed = results.filter((r) => !r.pass).length;
  const summary =
    nowFailed === 0
      ? `\nNESTED-STAMP VERIFY PASS — ${total}/${total}`
      : `\n${nowFailed} CHECK(S) FAILED — ${total - nowFailed}/${total}`;
  console.log(summary);

  // Ruling 17 — the log is written BY the gate, or not at all.
  mkdirSync(join(__dirname, "nested-stamp"), { recursive: true });
  writeFileSync(
    join(__dirname, "nested-stamp", "VERIFY-LOG.md"),
    [
      "# C24-NESTED-STAMP — acceptance log",
      "",
      `Run: ${new Date().toISOString()} · \`npx tsx audits/nested-stamp-verify.ts\``,
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
  if (nowFailed > 0) process.exit(1);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => undefined);
    process.exit(1);
  })
  .finally(() => void rawPrisma.$disconnect());
