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
import { SCOPED_MODEL_SET } from "../lib/tenancy/scope";

const ROOT = join(__dirname, "..");
// The platform-level modules, and the reason each one is in this list.
const MODULES = [
  { file: "lib/provisioning.ts", why: "tenant-creating: rows belong to the tenant it mints" },
  { file: "lib/billing/provision.ts", why: "the new practice's TenantBilling; tenant stated by the caller" },
  { file: "lib/prospect-capture.ts", why: "mixed: platform prospect rows plus ONE stated-tenant audit row" },
];
const TRACKED_CONSTANT = "PLATFORM_CAPTURE_AUDIT_TENANT";
const TRACKED_CONSTANT_HOME = "lib/prospect-capture.ts";
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

function main(): void {
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

  log(`\n## 2 — the ruling-133 tracked constant has exactly ONE use site`);
  const home = readFileSync(join(ROOT, TRACKED_CONSTANT_HOME), "utf8");
  const occurrences = (home.match(new RegExp(`\\b${TRACKED_CONSTANT}\\b`, "g")) ?? []).length;
  check(
    `${TRACKED_CONSTANT}: 1 definition + 1 use, and nothing more (ruling 133 condition 2)`,
    occurrences === 2,
    `${occurrences} occurrence(s) in ${TRACKED_CONSTANT_HOME} (expected exactly 2)`,
  );
  check(
    "it is module-local — not exported, so it cannot spread by import",
    !new RegExp(`export\\s+(const|function)\\s+${TRACKED_CONSTANT}`).test(home),
    "",
  );
  const elsewhere = MODULES.map((m) => m.file)
    .filter((f) => f !== TRACKED_CONSTANT_HOME)
    .filter((f) => new RegExp(`\\b${TRACKED_CONSTANT}\\b`).test(readFileSync(join(ROOT, f), "utf8")));
  check("and appears in no other platform-level module", elsewhere.length === 0, elsewhere.join(", ") || "none");

  log(`\n## 3 — they still use the RAW client (a silent return to the scoped one breaks the front door)`);
  for (const m of MODULES) {
    const src = readFileSync(join(ROOT, m.file), "utf8");
    check(`\`${m.file}\` imports the raw client`, /from\s+"@\/lib\/prisma-internal"/.test(src), "");
  }

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main();
