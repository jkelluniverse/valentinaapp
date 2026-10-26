// PORT UNIQUENESS — no two gates may declare the same listening port.
//
// Ruling 56: the teardown mechanism is sound on the normal path; the abnormal
// path is a crash before teardown, and its blast radius is exactly the set of
// gates sharing that port. Ruling 59 closes the radius: every gate owns its
// port, and the uniqueness is MACHINE-ENFORCED — a scanner that fails on new
// unknowns beats a list someone must remember (ruling 28's lesson, now applied
// a fourth time after gate-hygiene, the CLI-writer scanner, and stamp-audit).
// Found because C30's residual survey demonstrated v31 running its complete
// suite against a ghost on signup's port with no detection.
//
// THE RULE ENFORCED: every `const <NAME>PORT = <number>` declaration across
// audits/**/*.ts and the server-spawning scripts names a port no other FILE
// declares. A file may reference its own port constant many times; two FILES
// declaring the same number fail, whether or not both are in the standing set
// today — a demoted gate returning to the sweep must not resurrect a
// collision. New gates: declare a fresh port (ruling 52 also applies — kill by
// PORT, never by process name).
//
// Self-cleaning: touches nothing. Runs in the standing regression set.
//   npx tsx audits/port-uniqueness-verify.ts
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SELF = "audits/port-uniqueness-verify.ts";
// Server-spawning scripts outside audits/ (enumerated in the C30 report).
const EXTRA_FILES = ["scripts/smoke.ts", "scripts/smoke-writes.ts", "scripts/baseline.ts"];
const DECL = /const\s+[A-Z_]*PORT[A-Z_]*\s*=\s*(\d{2,5})/g;

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(name)) files.push(p);
  }
})(join(ROOT, "audits"));
for (const f of EXTRA_FILES) {
  try {
    statSync(join(ROOT, f));
    files.push(join(ROOT, f));
  } catch {
    /* script absent */
  }
}

const byPort = new Map<number, string[]>();
let declarations = 0;
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  if (rel === SELF) continue;
  const src = readFileSync(f, "utf8");
  const seenInFile = new Set<number>();
  for (const m of src.matchAll(DECL)) {
    const port = Number(m[1]);
    if (seenInFile.has(port)) continue; // a file may re-declare its own port
    seenInFile.add(port);
    declarations++;
    byPort.set(port, [...(byPort.get(port) ?? []), rel]);
  }
}

const collisions = [...byPort.entries()].filter(([, owners]) => owners.length > 1);
console.log(`# port-uniqueness — ${files.length - 1} files scanned, ${declarations} port declarations, ${byPort.size} distinct ports`);
if (collisions.length) {
  console.error(`\nPORT UNIQUENESS FAILED — gates sharing a port share a crash blast radius (ruling 56/59):\n`);
  for (const [port, owners] of collisions) console.error(`  ✗ port ${port}: ${owners.join(" AND ")}`);
  process.exit(1);
}
console.log(`\nPORT-UNIQUENESS VERIFY PASS — every gate owns its port`);
process.exit(0);
