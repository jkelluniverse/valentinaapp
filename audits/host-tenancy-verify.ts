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
// C38 — RULING 201. The first version of this gate detected only DIRECT
// importers of @/lib/(prisma|tenancy). Nine routes reached scoped data through
// a service module and were invisible to it — app/api/webhooks/stripe among
// them, a live money surface. It now follows the import graph. The scanner
// searched for a NAME; the dependency was on an EFFECT (ruling 168, again).
//
// RULING 204. The inventory held app/api/square/webhook/route.ts while
// app/api/webhooks/square/route.ts — a DIFFERENT route — was absent, and this
// header referred to "the second Square endpoint". Two were known; one was
// ever classified. They now both appear, and they are DIFFERENT KINDS.
//
// RULING 205's amendment to ruling 109: a documented limitation must carry
// what would CLOSE it and a tracking item, or it is a note rather than a plan.
// The previous header already confessed the helper blind spot, accurately,
// and the blind spot survived anyway — a confessed limitation is not a closed
// one.
//
// HONEST LIMITATIONS, WRITTEN INTO THE FILE (ruling 109), each with its closer:
//   · The walk follows STATIC @/ imports (.ts/.tsx/index.ts). A dynamic
//     import() with a computed specifier, or a re-export chain that launders
//     the identifier, is not followed. CLOSER: a runtime probe that hits every
//     route without a session and records which tables were read. TRACKING:
//     C38 follow-up; not built, because a static walk found all nine and a
//     runtime probe is a harness of its own.
//   · Database access not routed through @/lib/prisma, @/lib/tenancy or
//     @/lib/prisma-internal is invisible. CLOSER: guard-prisma already forbids
//     instantiating a PrismaClient directly outside its allowlist (a text
//     scan, which is why this comment does not spell the call out), so this
//     is closed by that
//     gate, not this one.
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
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const API = join(ROOT, "app", "api");

// m2m-payload    — a machine caller whose tenant comes from the AUTHENTICATED
//                  PAYLOAD (a merchant id, a customer id, an owner uri, a path
//                  token that selects a stored connection). Ruling 113's CORRECT
//                  answer; the gate had no word for it until C38.
// m2m-host-UNRATIFIED — a machine caller whose tenant is decided by the Host
//                  header and which is NOT one of ruling 122's two. This kind
//                  exists so the inventory can be complete while the gate stays
//                  RED: its check requires the set to be empty. Classifying a
//                  route here is a report, not an exemption.
type Kind = "visitor-host" | "m2m-host-exempt" | "m2m-payload" | "m2m-host-UNRATIFIED" | "platform";
type Entry = { route: string; kind: Kind; why: string; tracking?: string; attributedBy?: string };

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
  // ---- C38 — the nine the direct scan could not see, classified from the PATH each takes ----
  {
    route: "app/api/webhooks/stripe/route.ts",
    kind: "m2m-payload",
    attributedBy: "the event's `customer` id → TenantBilling.stripeCustomerId (lib/billing/lifecycle.ts:63-66); unmatched → 200 and dropped",
    why: "Stripe's callback. Never inventoried before C38 — a live money surface reached through lib/billing/lifecycle.ts. Its tenant comes from the payload, which is ruling 113 done right; the header's own text has cited this file as the precedent since ruling 195.",
  },
  {
    route: "app/api/webhooks/square/route.ts",
    kind: "m2m-payload",
    attributedBy: "the envelope's `merchant_id` → ConnectedPaymentAccount.merchantId (lib/payments/webhook.ts:67-72); unmatched → dropped",
    why: "THE SECOND SQUARE ENDPOINT (ruling 204). Not the host-exempt app/api/square/webhook/route.ts above — a different route with a different attribution model: this one resolves from the payload. Two Square endpoints, two kinds, both now in the table.",
  },
  {
    route: "app/api/webhooks/calendly/route.ts",
    kind: "m2m-payload",
    attributedBy: "the payload's scheduled_event.event_memberships[0].user → ExternalSchedulingConnection.externalOwner (lib/scheduling/external/ingress.ts); unmatched → 200 and dropped",
    why: "C37. One shared URL; the body names its owner (ruling 195).",
  },
  {
    route: "app/api/webhooks/acuity/[token]/route.ts",
    kind: "m2m-payload",
    attributedBy: "the path token, hashed → ExternalSchedulingConnection.ingressTokenHash, which SELECTS the connection and its key; the signature is then verified (ruling 196). Unknown path → 404",
    why: "C37. The path selects, it does not grant; the host is consulted nowhere.",
  },
  {
    route: "app/api/auth/[...nextauth]/route.ts",
    kind: "visitor-host",
    why: "The sign-in surface. It has no session BECAUSE it is the thing that creates one. A browser on the practice's own host; identity follows host by design (P4). Not machine-to-machine.",
  },
  {
    route: "app/api/signup/slug/route.ts",
    kind: "visitor-host",
    why: "Advisory slug check from the signup page's own browser. Returns one word, no ids, no tenant data; the server action re-decides at submit. The raw read it makes (lib/signup.ts checkSlug) is a global uniqueness question by design.",
  },
  {
    route: "app/api/webhooks/transcription/route.ts",
    kind: "m2m-payload",
    attributedBy: "the payload's captureId → SessionCapture.tenantId via captureTenantId() (lib/capture.ts), on the RAW client; unknown id → 200, dropped and logged. Fixed under ruling 238 — it was m2m-host-UNRATIFIED when C38 first ran.",
    why: "The transcription provider's completion callback. Its URL token and header secret prove the CALLER; the capture row the payload names decides the TENANT, and completeCapture carries that tenant explicitly on every read and write. The request Host is consulted nowhere on this path.",
  },
  {
    route: "app/api/recording/webhook/route.ts",
    kind: "m2m-host-UNRATIFIED",
    attributedBy: "NOTHING IN THE PAYLOAD. lib/recording.ts reads recordingDraft/recordingConsent through the SCOPED client — tenant = request Host",
    why: "The recorder's processed-recording callback (C19 REC.2). Secret-in-URL authenticates the caller only. Same shape as transcription.",
    tracking: "C38 STOP-AND-REPORT — same ruling as transcription.",
  },
  {
    route: "app/api/inbound/remarkable/route.ts",
    kind: "m2m-host-UNRATIFIED",
    attributedBy: "NOTHING IN THE PAYLOAD. lib/remarkable.ts reads handwrittenNote through the SCOPED client — tenant = request Host. The sender allowlist inside the ingest is authentication, not attribution",
    why: "The inbound-email webhook for handwritten notes (C14 R.1). Secret-in-URL plus sender allowlist authenticate; the Host decides the tenant.",
    tracking: "C38 STOP-AND-REPORT — same ruling as transcription.",
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

const SCOPED_IMPORT = /from\s+["']@\/lib\/(prisma|tenancy)["']/;
const RAW_IMPORT = /from\s+["']@\/lib\/prisma-internal["']/;
const SESSION_CALL = /\bauth\(\)|getServerSession|require(Practitioner|User|Role|Client)/;

// C38 — FOLLOW THE GRAPH. Resolve every @/ import a file makes and walk it,
// so a route that reaches the database through lib/x.ts → lib/y.ts is seen.
// Returns the first path found, so the classifier can read HOW a route gets
// there, not merely THAT it does.
function resolveImport(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join(ROOT, spec.slice(2));
  for (const c of [base + ".ts", base + ".tsx", join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}
function reachesDb(file: string, seen = new Set<string>(), chain: string[] = []): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length + 1);
  if (SCOPED_IMPORT.test(src)) return [...chain, `${rel} [scoped]`];
  if (RAW_IMPORT.test(src)) return [...chain, `${rel} [RAW]`];
  for (const m of src.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
    const r = resolveImport(m[1]);
    if (r) { const hit = reachesDb(r, seen, [...chain, rel]); if (hit) return hit; }
  }
  return null;
}

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
  const paths = new Map<string, string[]>();
  for (const abs of walk(API).sort()) {
    const src = readFileSync(abs, "utf8");
    if (SESSION_CALL.test(src)) continue;
    const hit = reachesDb(abs);
    if (!hit) continue;
    const rel = abs.slice(ROOT.length + 1);
    found.push(rel);
    paths.set(rel, hit);
  }

  const known = new Set(INVENTORY.map((e) => e.route));
  const unknown = found.filter((r) => !known.has(r));
  const vanished = INVENTORY.map((e) => e.route).filter((r) => !found.includes(r));

  log(`\n## Discovery — ${found.length} route(s) reach the database without a user session (transitive walk, C38)`);
  for (const r of found) log(`  · ${paths.get(r)!.join(" -> ")}`);
  // RULING 38 — the moving count, pinned. The direct scan saw 9; the walk sees 18.
  check("the walk finds the 18 routes it found when C38 landed (a change here is a new route or a lost one — name it)", found.length === 18, `${found.length}`);
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
  // C38 — payload attribution must NAME its field. A promise is not a field.
  log(`\n## m2m-payload — attribution named per entry (ruling 113's correct answer)`);
  for (const e of INVENTORY.filter((x) => x.kind === "m2m-payload")) {
    check(`${e.route} names the payload field its tenant comes from`, Boolean(e.attributedBy && e.attributedBy.length > 30), e.attributedBy?.slice(0, 70));
  }

  // C38 — THE STOP-AND-REPORT SET. This check is RED BY DESIGN until a ruling
  // either widens ruling 122's exemption or attributes these from their payload.
  const unratified = INVENTORY.filter((x) => x.kind === "m2m-host-UNRATIFIED").map((x) => x.route);
  log(`\n## Host-resolving machine callers OUTSIDE the ratified exemption`);
  check("the unratified host-resolving set is EMPTY", unratified.length === 0,
    unratified.length ? `${unratified.length} route(s) decide tenant by Host without a ruling: ${unratified.join(", ")}` : "none");
  for (const e of INVENTORY.filter((x) => x.kind === "m2m-host-UNRATIFIED")) {
    check(`${e.route} carries a tracking item (ruling 114)`, Boolean(e.tracking && e.tracking.length > 20), e.tracking?.slice(0, 60));
  }

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
