// GATE HYGIENE — no gate may reference a MOVING POINTER for a before/after claim.
//
// Ruling 34 (stated stronger by the Architect in the C27 review): `HEAD` means
// something different tomorrow, so a gate comparing against it silently starts
// testing a different assertion than the one it was written to test — and on a
// clean tree a HEAD comparison is a TAUTOLOGY that can never fail, which is
// worse. This rule was recorded three times (rulings 12→18 shape) and violated
// three times after being recorded: settings-i18n (caught in the C25 sweep),
// practice-setting's A4 (caught in the C27 sweep), tenant-scope's value-drift
// check (caught while building this scanner — a tautology since C24.1 merged).
// Ruling 28's lesson applies: a scanner that fails on new unknowns beats a
// list someone must remember. This is that scanner.
//
// THE RULE ENFORCED (mechanical half): no string-literal moving git ref —
// HEAD, HEAD^, HEAD~n, @{...}, origin/... — anywhere in audits/**/*.ts,
// except files named below WITH justification. Pin a commit instead.
// THE RULE'S OTHER HALF (semantic, not mechanically checkable): a comparison
// of a pinned commit against the WORKING TREE is legitimate only for a LIVE
// claim ("this property holds now"), never for a historical one ("build X
// changed nothing") — that half stays with review, and with the pattern the
// pinned gates now model.
//
// Self-cleaning: touches nothing. Runs in the standing regression set.
//   npx tsx audits/gate-hygiene-verify.ts
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// file → justification. Extending this list is a reviewed decision.
const ALLOWED: Record<string, string> = {
  "audits/email-identity-verify.ts":
    "`git rev-parse --short HEAD` in --capture-fixture mode STAMPS the capture's provenance into the fixture (a label, not a comparison); the gate compares only against the pinned commit and the capture mode warns when run off-pin",
  "audits/event-chrome-verify.ts":
    "line 154: `git rev-parse --short HEAD` runs ONLY inside --capture-fixture mode and writes the capture's provenance label (fixture.capturedAt); no comparison path reads a moving ref — every compare check requires fixture.capturedAt === PINNED_PRE_CHANGE ('f07a035') and diffs against that fixture's stored bytes; line 169 is the WARNING printed when a capture runs off-pin (C29 completion dispatch, A1 verified before excepting)",
};

const ROOT = process.cwd();
const SELF = "audits/gate-hygiene-verify.ts";
// A moving ref as it appears in source strings: HEAD (optionally ^/~n or
// :path), @{...}, or an origin/ ref. Word-bounded so HEADING/ahead don't match.
const MOVING_REF = /\bHEAD\b(?:[\^~:]|\b)|@\{[^}]*\}|\borigin\/[A-Za-z0-9._/-]+/;

const violations: string[] = [];
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(name)) files.push(p);
  }
})(join(ROOT, "audits"));

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  if (rel === SELF) continue;
  const src = readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/^\s*(\/\/|\*).*$/, ""); // comments carry no refs
    if (MOVING_REF.test(code)) {
      if (rel in ALLOWED) return;
      violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

console.log(`# gate-hygiene — ${files.length} gate files scanned, ${Object.keys(ALLOWED).length} named exception(s)`);
for (const [f, why] of Object.entries(ALLOWED)) console.log(`~ allowed: ${f} — ${why}`);
if (violations.length) {
  console.error(`\nGATE HYGIENE FAILED — moving git refs in before/after territory (pin a commit instead, ruling 34):\n`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log(`\nGATE-HYGIENE VERIFY PASS — no gate references a moving git ref`);
process.exit(0);
