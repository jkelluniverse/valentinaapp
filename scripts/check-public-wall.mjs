#!/usr/bin/env node
// C18 §2 — the structural wall. The public surface (app/(public)/**,
// components/public/**, content/**) must be unable to read client data. All DB
// access flows through @/lib/prisma and all identity through @/auth /
// next-auth, so forbidding those imports there makes a data leak a build-time
// failure, not a runtime hope.
//
// The single sanctioned exception is the narrow booking server action (C18.4),
// which writes ONLY Lead + Appointment. A file may import prisma iff its first
// line is the pragma `// wall-allow: <reason>`.
//
// Run: node scripts/check-public-wall.mjs  (npm run lint:wall)

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOTS = ["app/(public)", "components/public", "content"];
const FORBIDDEN = [
  { re: /["'`]@\/lib\/prisma["'`]/, name: "@/lib/prisma", allowPragma: true },
  { re: /["'`]@\/lib\/auth-guards["'`]/, name: "@/lib/auth-guards", allowPragma: false },
  { re: /["'`]@\/auth(\.config)?["'`]/, name: "@/auth", allowPragma: false },
  { re: /from ["'`]next-auth/, name: "next-auth", allowPragma: false },
];

function walk(dir) {
  let files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files; // root may not exist yet
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) files.push(p);
  }
  return files;
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    const hasAllowPragma = /^\s*\/\/\s*wall-allow:/.test(src);
    for (const f of FORBIDDEN) {
      if (f.re.test(src)) {
        if (f.allowPragma && hasAllowPragma) continue;
        violations.push({ file, import: f.name, pragma: f.allowPragma });
      }
    }
  }
}

if (violations.length) {
  console.error("✗ PUBLIC WALL BREACH — the public surface must not read client data:\n");
  for (const v of violations) {
    const hint = v.pragma
      ? " (add `// wall-allow: <reason>` as the file's first line only if this is the narrow booking action)"
      : " (never allowed on the public surface)";
    console.error(`  ${v.file}\n    imports ${v.import}${hint}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
console.log("✓ public wall intact — no data-reading imports on the public surface");
