// HOST AS A TENANCY SOURCE — the inventory gate (rulings 113 / 114 / 122).
//
// WHAT RULING 113 SAYS, AND WHY IT IS A SECURITY POSITION. The Host header is
// chosen by the caller. For a BROWSER that is fine: the visitor typed the
// practice's address and the host they send is the host they are looking at.
// For a MACHINE-TO-MACHINE callback it is not: a third-party server's Host is
// whatever its dashboard was configured with years ago, so letting it decide
// WHOSE DATA a callback writes makes a configuration field into an
// authorization field. Attribution for those callers must come from the
// payload, authenticated (a signature, a stored account id) — not from Host.
//
// WHAT THIS GATE ENFORCES. Every route under app/api that can reach
// tenant-scoped data WITHOUT a user session is inventoried below with a
// classification. The gate fails when:
//   · a route appears that is not classified  → a NEW Host-resolving route
//   · a classified route no longer exists     → the inventory has gone stale
//   · the m2m-host-exempt set is anything other than the two named routes
//
// THE EXEMPTION IS EXACTLY TWO ROUTES (ruling 122) and each carries a reason
// and a tracking item (ruling 114). It is TRANSITIONAL. Both exempt routes are
// in fact called on valentinavelez.com, which has carried a TenantDomain row
// since P1 — so since P3.3 neither of them rides a fallback; they resolve from
// DATA like every other host. What the exemption still records is the weaker
// but real fact that their tenant is decided by Host AT ALL.
//
// HONEST LIMITATIONS, WRITTEN INTO THE FILE (ruling 109):
//   · It is a STATIC scan of import and call text. A route that reaches scoped
//     data through a helper this scan does not follow is invisible to it.
//   · "Has a user session" is detected by call text (auth(), requireX). A route
//     that authenticates some other way is classified by a human here, not by
//     the scanner.
//   · It proves the INVENTORY is complete and the exemption is two. It does
//     not prove either exempt route is correct — only that neither has quietly
//     become three.
//   · It cannot see a caller. That the scheduler and Square both call the
//     mapped host is evidence from Railway's HTTP logs and their dashboards
//     (docs/EXTERNAL-SERVICES.md), asserted in audits/platform/verify.ts.
//
//   npx tsx audits/host-tenancy-verify.ts
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const API = join(ROOT, "app", "api");

type Kind = "visitor-host" | "m2m-host-exempt" | "platform";
type Entry = { route: string; kind: Kind; why: string; tracking?: string };

// THE INVENTORY. A route that reaches scoped data without a session must be
// here, with a classification a human chose and can defend.
const INVENTORY: Entry[] = [
  {
    route: "app/api/jobs/tick/route.ts",
    kind: "m2m-host-exempt",
    why:
      "The scheduled tick. Called by cron-job.org job 8110930 at " +
      "https://valentinavelez.com/api/jobs/tick — a host, not a payload. Authenticated by " +
      "JOBS_SECRET, which proves the CALLER is trusted and says nothing about WHOSE tenant " +
      "the run serves. Since P3.3 the route resolves that host through TenantDomain and " +
      "REFUSES with 503 if it ever stops resolving, rather than running every step into a " +
      "caught error and reporting a successful empty run.",
    tracking:
      "Ruling 127 — scheduled work needs a tenant-neutral entry point or a per-tenant " +
      "invocation model. One cron hitting one practice's domain cannot serve two practices. " +
      "Belongs with P4's identity work.",
  },
  {
    route: "app/api/square/webhook/route.ts",
    kind: "m2m-host-exempt",
    why:
      "Square's payment callback. Observed calling https://valentinavelez.com with UA " +
      "'Square Connect v2'. Its tenant should come from the authenticated PAYLOAD (the " +
      "merchant/location the event names, matched against a stored account), not from the " +
      "host Square's dashboard happens to hold. Money surface: not to be changed or merged " +
      "with the second Square endpoint unilaterally.",
    tracking:
      "P6-SQUARE-TENANT-OAUTH (docs/specs/inbox) — per-tenant Square connection, after which " +
      "attribution comes from the payload and this exemption is deleted, not renewed.",
  },
  {
    route: "app/api/appointment-invite/[id]/route.ts",
    kind: "visitor-host",
    why: "Opened from a link in a browser, on the practice's own host. Host is the visitor's.",
  },
  {
    route: "app/api/calendar/[secret]/route.ts",
    kind: "visitor-host",
    why: "Calendar subscription URL, fetched by the client's own calendar app from the practice's host, and authorized by the per-feed secret in the path.",
  },
  {
    route: "app/api/captures/audio/[captureId]/route.ts",
    kind: "visitor-host",
    why: "Audio fetched by the practitioner's own browser on the practice's host.",
  },
  {
    route: "app/api/reading/[clientId]/pdf/route.ts",
    kind: "visitor-host",
    why: "PDF rendered for a signed-in viewer's browser on the practice's host.",
  },
  {
    route: "app/api/push/route.ts",
    kind: "visitor-host",
    why: "Push subscription registered by the visitor's own browser on the practice's host.",
  },
  {
    route: "app/api/health/route.ts",
    kind: "platform",
    why: "Liveness. Reports no tenant data.",
  },
  {
    route: "app/api/tenant-kind/route.ts",
    kind: "platform",
    why:
      "Answers what KIND of host this is — that is its entire purpose, so Host deciding is " +
      "not a defect here. Returns no ids and no tenant data. Since P3.3 an unmapped host " +
      "answers kind='unresolved' where it used to answer the default tenant.",
  },
];

const EXEMPT_ROUTES = ["app/api/jobs/tick/route.ts", "app/api/square/webhook/route.ts"];

const SCOPED_IMPORT = /from\s+"@\/lib\/(prisma|tenancy)"/;
const SESSION_CALL = /\bauth\(\)|getServerSession|require(Practitioner|User|Role|Client)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

const report: string[] = [];
let failed = 0;
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

function main(): void {
  log(`# HOST-AS-TENANCY inventory — ${new Date().toISOString()}`);

  const found: string[] = [];
  for (const abs of walk(API).sort()) {
    const src = readFileSync(abs, "utf8");
    if (!SCOPED_IMPORT.test(src)) continue;
    if (SESSION_CALL.test(src)) continue;
    found.push(abs.slice(ROOT.length + 1));
  }

  const known = new Set(INVENTORY.map((e) => e.route));
  const unknown = found.filter((r) => !known.has(r));
  const vanished = INVENTORY.map((e) => e.route).filter((r) => !found.includes(r));

  log(`\n## Discovery — ${found.length} route(s) reach scoped data without a user session`);
  check(
    "every such route is classified in the inventory (a NEW Host-resolving route fails here)",
    unknown.length === 0,
    unknown.length ? `UNCLASSIFIED: ${unknown.join(", ")}` : `${found.length} classified`,
  );
  check(
    "no inventory entry has gone stale (a classified route that no longer exists)",
    vanished.length === 0,
    vanished.length ? `MISSING: ${vanished.join(", ")}` : "none",
  );

  log(`\n## The transitional exemption (rulings 114 / 122)`);
  const exempt = INVENTORY.filter((e) => e.kind === "m2m-host-exempt").map((e) => e.route).sort();
  check(
    "the exemption names EXACTLY the two ratified routes",
    JSON.stringify(exempt) === JSON.stringify([...EXEMPT_ROUTES].sort()),
    exempt.join(", ") || "(empty)",
  );
  for (const e of INVENTORY.filter((x) => x.kind === "m2m-host-exempt")) {
    check(`${e.route} states a reason`, e.why.length > 40);
    check(`${e.route} carries a tracking item (ruling 114)`, Boolean(e.tracking && e.tracking.length > 20), e.tracking?.slice(0, 60));
  }

  log(`\n## Classification table`);
  for (const e of INVENTORY) log(`- \`${e.route}\` — **${e.kind}** — ${e.why}${e.tracking ? ` _(tracking: ${e.tracking})_` : ""}`);

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main();
