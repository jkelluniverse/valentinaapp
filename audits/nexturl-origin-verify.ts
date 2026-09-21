import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// NEXTURL-ORIGIN SCANNER (ruling 105) — `req.nextUrl.origin` is the DEFAULT
// TENANT'S origin in production regardless of who is visiting. Building a
// cross-host URL from it has now caused TWO production defects in one week, in
// one file:
//   C32  `new URL("/api/tenant-kind", req.nextUrl.origin)` — the self-fetch left
//        the box, the edge overwrote x-forwarded-host, the root redirect could
//        never fire.
//   P2.2 `new URL("/platform", req.nextUrl)` — the rewrite targeted her domain,
//        where the platform route's own guard correctly 404'd.
// A scanner that fails on new unknowns beats a ruling someone must remember
// (rulings 28/59/92, and the nested-stamp census: four times now).
//
// WHAT IT FLAGS
//   A. `nextUrl` used as a URL BASE — `new URL(<path>, <x>.nextUrl[.origin])`.
//   B. `.nextUrl.origin` anywhere at all. The value itself is the hazard.
// WHAT IT ALLOWS, deliberately
//   `.nextUrl.searchParams` / `.pathname` / `.host` / `.protocol` and
//   `nextUrl.clone()` — same-request, same-path reads that carry no cross-host
//   claim. `publicOrigin()` in middleware.ts is built from `.host`/`.protocol`
//   and is the sanctioned builder, so it passes without a pragma.
//   An escape hatch exists for a deliberate exception: put `nexturl-allow:
//   <reason>` on the line.
//
// LIMITATIONS, stated rather than implied (ruling 109). It is TEXTUAL, so:
//   1. a `new URL(...)` split across lines, or an origin laundered through a
//      variable, is not caught;
//   2. OPTIONAL CHAINING EVADES IT. `req?.nextUrl?.origin` does not match
//      `\.nextUrl\.origin`. Found the hard way while proving this scanner
//      covers a new file: the FIRST control used optional chaining, was not
//      flagged, and looked exactly like "the scanner does not scan this file".
//      A MALFORMED CONTROL THAT PASSES IS INDISTINGUISHABLE FROM COVERAGE —
//      re-run a negative control with the EXACT shape the pattern claims;
//   3. RULING 172, THE THIRD INSTANCE IS INVISIBLE TO IT BY CONSTRUCTION. The
//      auth route handler's redirect is built from the internal origin inside
//      `node_modules` — `Auth()` does `new URL(req.url)` on a request this
//      codebase hands over intact. There is NO STRING IN OUR SOURCE to find.
//      That is ruling 168 in another register: this scanner searches for the
//      NAME, and a dependency can be on the EFFECT. A clean run here is not
//      evidence that no cross-host URL is being built.
// It catches the two shapes that actually shipped, and it is not a substitute
// for the ruling-48 live check — ruling 76 still stands: a gate cannot prove a
// deployment seam.

const ROOTS = ["app", "lib", "middleware.ts"];
const BASE_RE = /new\s+URL\s*\([^;]*,\s*[A-Za-z_$][\w$]*\.nextUrl\b/;
const ORIGIN_RE = /\.nextUrl\.origin\b/;

// Strip a line comment without truncating at the `//` inside a URL literal
// ("http://…"), which would hide a violation later on the same line.
function stripComment(line: string): string {
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === "/" && line[i + 1] === "/" && line[i - 1] !== ":") return line.slice(0, i);
  }
  return line;
}

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const files: string[] = [];
for (const root of ROOTS) {
  try {
    files.push(...(statSync(root).isDirectory() ? walk(root) : [root]));
  } catch {
    /* root absent */
  }
}

const violations: { file: string; line: number; text: string; why: string }[] = [];
for (const file of files) {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  src.split("\n").forEach((raw, i) => {
    if (/nexturl-allow:/.test(raw)) return;
    const code = stripComment(raw);
    if (BASE_RE.test(code)) {
      violations.push({ file, line: i + 1, text: code.trim(), why: "nextUrl used as a URL BASE — build cross-host targets from publicOrigin()" });
    } else if (ORIGIN_RE.test(code)) {
      violations.push({ file, line: i + 1, text: code.trim(), why: "nextUrl.origin is the DEFAULT TENANT'S origin in production — use publicOrigin()" });
    }
  });
}

if (violations.length > 0) {
  console.error("NEXTURL-ORIGIN SCANNER FAILED — cross-host URL built from req.nextUrl (ruling 105):\n");
  for (const v of violations) console.error(`  ✗ ${v.file}:${v.line}\n      ${v.text}\n      ${v.why}`);
  console.error(`\n${violations.length} violation(s). publicOrigin() reads x-forwarded-host — the visitor's real host.`);
  process.exit(1);
}
console.log(`nexturl-origin: clean — ${files.length} files scanned, no cross-host URL built from req.nextUrl`);
