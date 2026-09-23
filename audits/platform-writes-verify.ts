// PLATFORM-LEVEL WRITES — the category correction, held by counts.
//
// WHAT WENT WRONG AND WHY THIS EXISTS. P3.3 made an unresolvable host refuse
// every tenant-scoped read and write, which is right for touching a practice's
// data and wrong for an operation that creates a tenant or records a platform
// event. Those operations already STATE their tenant in the payload; they were
// only ever borrowing the request's. The borrow was invisible until the host
// stopped resolving, and then psychefolio.com/signup failed outright while
// /join wrote the lead and showed the visitor an error.
//
// The correction is a CATEGORY one: those modules use the raw client because
// they are not tenant-scoped operations. That is only safe while it stays
// true, so this gate holds the two properties that make it true, as counts
// (ruling 128 — a count catches the change nobody thought worth checking):
//
//   1. EVERY scoped write in the platform-level modules states `tenantId`
//      literally. A write added without one would be a null-tenant row, and
//      the raw client would not stop it.
//   2. The ruling-133 tracked constant has EXACTLY ONE use site. It attributes
//      platform capture audit rows to tenant #1, which is wrong and tracked;
//      condition 2 of ruling 133 is that it must not spread into a general
//      "no tenant? use this" helper — that is the fallback P3.3 removed,
//      returning through a side door with a comment attached.
//   3. Those modules still use the RAW client. If one silently goes back to
//      the scoped client, the front door breaks again the next time a host
//      does not resolve, and this fails first.
//
// HONEST LIMITATIONS (ruling 109): this is a static scan of call text. A write
// performed through a helper it cannot follow is invisible to it, and
// `tenantId` reaching a payload via a spread is counted as present without
// checking what the spread contains. It proves the shape of these files, not
// the behaviour of the database — audits/platform-mail-verify.ts proves the
// behaviour, end to end, on the platform host.
//
//   npx tsx audits/platform-writes-verify.ts
import { readFileSync } from "fs";
import { join } from "path";
import { SCOPED_MODEL_SET, PLATFORM_TENANT_ID, DEFAULT_TENANT_ID, PLATFORM_TENANT_STATUS } from "../lib/tenancy/scope";
import { rawPrisma } from "../lib/prisma-internal";
import { seedLocalDomains } from "./_fixtures/local-domains";

const ROOT = join(__dirname, "..");
// The platform-level modules, and the reason each one is in this list.
const MODULES = [
  { file: "lib/provisioning.ts", why: "tenant-creating: rows belong to the tenant it mints" },
  { file: "lib/billing/provision.ts", why: "the new practice's TenantBilling; tenant stated by the caller" },
  { file: "lib/prospect-capture.ts", why: "mixed: platform prospect rows plus ONE stated-tenant audit row" },
];
const WRITE_METHODS = ["create", "createMany", "createManyAndReturn", "upsert"];

const report: string[] = [];
let failed = 0;
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

/** From the "(" after a call, the substring up to its matching ")". */
function callArgs(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1);
}

async function main(): Promise<void> {
  log(`# PLATFORM-LEVEL WRITES verify — ${new Date().toISOString()}`);

  log(`\n## 1 — every scoped write states its tenant`);
  let totalWrites = 0;
  const missing: string[] = [];
  for (const m of MODULES) {
    const src = readFileSync(join(ROOT, m.file), "utf8");
    // `<anything>prisma.<model>.<method>(`
    const re = new RegExp(`[Pp]risma\\.([a-zA-Z]+)\\.(${WRITE_METHODS.join("|")})\\s*\\(`, "g");
    let hit: RegExpExecArray | null;
    let inFile = 0;
    while ((hit = re.exec(src)) !== null) {
      const model = hit[1];
      if (!SCOPED_MODEL_SET.has(model)) continue; // platform-level table: no tenantId column
      inFile++;
      totalWrites++;
      const args = callArgs(src, hit.index + hit[0].length - 1);
      if (!/\btenantId\b/.test(args)) missing.push(`${m.file}: ${model}.${hit[2]}`);
    }
    log(`  · \`${m.file}\` — ${inFile} scoped write(s) — ${m.why}`);
  }
  check(
    `all ${totalWrites} scoped writes in the platform-level modules state tenantId literally`,
    missing.length === 0 && totalWrites > 0,
    missing.length ? `MISSING: ${missing.join(" · ")}` : `${totalWrites} write(s), 0 missing`,
  );

  // RULING 38 — THE COUNT MOVED AND HERE IS WHY. This used to assert that
  // ruling 133's tracked constant had exactly one use site. P4 item 5 DISCHARGED
  // that tracking item: platform activity is now attributed to the platform's
  // own tenant row (migration 52) instead of to tenant #1, so the constant is
  // gone and the assertion becomes the stronger one it was standing in for —
  // that these modules attribute platform rows to the PLATFORM tenant and to
  // nobody else. 3 checks became 3 checks; what they assert changed.
  log(`\n## 2 — platform activity is attributed to the PLATFORM tenant, never to a practice`);
  const attributing = ["lib/prospect-capture.ts", "lib/engage.ts"];
  let platformRefs = 0;
  const leaked: string[] = [];
  for (const f of attributing) {
    const src = readFileSync(join(ROOT, f), "utf8");
    // USE sites, not mentions: the import line names it too, and counting that
    // would make the number drift with unrelated refactors.
    const body = src.split("\n").filter((l) => !/^import\s/.test(l.trim())).join("\n");
    platformRefs += (body.match(/\bPLATFORM_TENANT_ID\b/g) ?? []).length;
    if (/\bDEFAULT_TENANT_ID\b/.test(src)) leaked.push(f);
  }
  check(
    "the three platform audit sites attribute to PLATFORM_TENANT_ID (capture 1 + engage 2)",
    platformRefs === 3,
    `${platformRefs} use site(s) across ${attributing.join(", ")} (expected 3: capture 1, engage 2)`,
  );
  check(
    "and NONE of them still reaches for the default tenant (ruling 82 closed)",
    leaked.length === 0,
    leaked.length ? `STILL USES DEFAULT_TENANT_ID: ${leaked.join(", ")}` : "none",
  );

  // The severity flag is a deliberate, narrow exception, so it is COUNTED
  // (ruling 128). Two call sites: the platform-host capture path and notify's
  // identity resolution. A third would mean someone is quieting a refusal that
  // is NOT expected, which is how an error stops meaning an error.
  log(`\n## 2b — the expected-refusal severity flag is used at EXACTLY two call sites`);
  const FLAG = "refusalExpected: true";
  const flagHomes = ["lib/prospect-capture.ts", "lib/notify.ts"];
  let flagUses = 0;
  for (const f of flagHomes) flagUses += (readFileSync(join(ROOT, f), "utf8").split(FLAG).length - 1);
  check(
    `${FLAG} appears exactly twice, in ${flagHomes.join(" and ")}`,
    flagUses === 2,
    `${flagUses} use site(s) — a third means a refusal is being quieted that is not expected`,
  );
  const straySrc = ["lib/provisioning.ts", "lib/billing/provision.ts", "lib/engage.ts"]
    .filter((f) => readFileSync(join(ROOT, f), "utf8").includes(FLAG));
  check("and nowhere else in the platform-level modules", straySrc.length === 0, straySrc.join(", ") || "none");
  // The refusal ITSELF is untouched — only its level. If the throw ever went
  // with the severity this whole design would be gone, so it is asserted here.
  const prismaSrc = readFileSync(join(ROOT, "lib/prisma.ts"), "utf8");
  check(
    "the flag changes SEVERITY only — TenantUnresolvedError is still thrown on every refusal path",
    (prismaSrc.match(/throw new TenantUnresolvedError\(\)/g) ?? []).length >= 4 && /refusal\(/.test(prismaSrc),
    `${(prismaSrc.match(/throw new TenantUnresolvedError\(\)/g) ?? []).length} throw site(s)`,
  );

  log(`\n## 3 — they still use the RAW client (a silent return to the scoped one breaks the front door)`);
  for (const m of MODULES) {
    const src = readFileSync(join(ROOT, m.file), "utf8");
    check(`\`${m.file}\` imports the raw client`, /from\s+"@\/lib\/prisma-internal"/.test(src), "");
  }

  // ---------------------------------------------------------------------
  // 4 — LIVE: no host may resolve to the platform tenant, by EITHER path.
  // This is the claim the whole design rests on, and it is a claim about a
  // refusal, so it ships with its positive control (ruling 110): a normal
  // tenant must resolve through the same two paths in the same run, or
  // "unresolved" would prove only that resolution is broken.
  // ---------------------------------------------------------------------
  log(`\n## 4 — no host resolves to the platform tenant (live, both paths)`);
  const { resolveTenant } = await import("../lib/tenancy");
  const savedPd = process.env.PLATFORM_DOMAIN;
  const PROBE_DOMAIN = "pwv.test";
  const PROBE_HOST = "platform-probe.pwv-mapped.test";
  try {
    await seedLocalDomains();
    process.env.PLATFORM_DOMAIN = PROBE_DOMAIN;

    // positive control A — the subdomain PATTERN resolves a real practice
    const ctrlSlug = (await rawPrisma.tenant.findFirst({ where: { status: { not: PLATFORM_TENANT_STATUS } }, select: { slug: true } }))?.slug ?? "";
    const ctrlPattern = await resolveTenant(`${ctrlSlug}.${PROBE_DOMAIN}`);
    check("positive control: the subdomain pattern DOES resolve a real practice", ctrlPattern.kind === "tenant", `${ctrlSlug} → ${ctrlPattern.kind}`);

    // the pattern must NOT reach the platform tenant
    const viaPattern = await resolveTenant(`__platform__.${PROBE_DOMAIN}`);
    check(
      "a crafted Host on the wildcard cannot reach it via the SUBDOMAIN PATTERN",
      viaPattern.kind === "unresolved",
      `__platform__.${PROBE_DOMAIN} → ${viaPattern.kind}`,
    );

    // positive control B — a TenantDomain mapping DOES resolve a real practice
    const ctrlMapped = await resolveTenant("localhost");
    check("positive control: a TenantDomain mapping DOES resolve a real practice", ctrlMapped.kind === "tenant", `localhost → ${ctrlMapped.kind}`);

    // and a mapping pointed AT the platform tenant must still refuse
    await rawPrisma.tenantDomain.upsert({
      where: { host: PROBE_HOST },
      update: { tenantId: PLATFORM_TENANT_ID },
      create: { id: "td_pwv_probe_0001", host: PROBE_HOST, tenantId: PLATFORM_TENANT_ID },
    });
    const viaMapping = await resolveTenant(PROBE_HOST);
    check(
      "even an explicit TenantDomain row pointing AT it cannot reach it",
      viaMapping.kind === "unresolved",
      `${PROBE_HOST} → ${viaMapping.kind}`,
    );
  } finally {
    await rawPrisma.tenantDomain.deleteMany({ where: { host: PROBE_HOST } }).catch(() => {});
    if (savedPd === undefined) delete process.env.PLATFORM_DOMAIN;
    else process.env.PLATFORM_DOMAIN = savedPd;
  }

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
