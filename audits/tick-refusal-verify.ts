// THE TICK REFUSES AN UNRESOLVABLE TENANT — the demonstration P3.3 owes.
//
// WHAT THIS EXISTS TO PROVE. /api/jobs/tick wraps each of its thirteen steps in
// its own try/catch so one failure never starves the rest, then returns
// `ok: true` whatever happened. That is right for a step and exactly wrong for
// a TENANCY failure, because tenancy fails for every step at once: the caller
// is handed a 200 and a report full of "error", and the scheduler's dashboard
// stays green while nothing happens. P3.3 removes the host-pattern fallback, so
// "this host resolves to nobody" became a state the tick can actually be in —
// which is precisely when an empty-but-successful run had to stop being
// possible. This gate is the demonstration, not the claim.
//
// It is a live HTTP gate on the BUILT app, because the property is a property
// of the route's response, not of a function. Both directions are asserted in
// one run against one server (ruling 110: an absence is evidence only with a
// positive control — the mapped host answering 200 IS the positive control).
//
// The mapped host here is the loopback fixture (audits/_fixtures/local-domains),
// which is how every gate states its host since P3.3. In production the mapped
// host is valentinavelez.com, asserted separately in audits/platform/verify.ts.
//
// Self-cleaning: seeds only the shared loopback mapping, spawns one server on
// its own port, and kills it by PORT (ruling 52).
//   DATABASE_URL=...scratch npx tsx audits/tick-refusal-verify.ts
import { spawn, execSync, type ChildProcess } from "child_process";
import { seedLocalDomains } from "./_fixtures/local-domains";

const APP_PORT = 3183;
const BASE = `http://localhost:${APP_PORT}`;
const SECRET = "tick-refusal-verify-secret";

const report: string[] = [];
let failed = 0;
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

async function tick(host: string): Promise<{ status: number; body: Record<string, unknown> }> {
  // `only=engage` keeps the positive control cheap: it exercises the SAME
  // up-front tenancy resolution and returns before the payments sweep.
  const res = await fetch(`${BASE}/api/jobs/tick?only=engage&secret=${SECRET}`, {
    headers: { "x-forwarded-host": host },
  });
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* non-JSON */ }
  return { status: res.status, body };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await seedLocalDomains();

  log(`# TICK REFUSAL verify — ${new Date().toISOString()}`);
  console.log(`~ starting built app on :${APP_PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "tick-refusal-secret",
    PORT: String(APP_PORT),
    PLATFORM_DOMAIN: "tickrefusal.test",
    AUTH_TRUST_HOST: "true",
    JOBS_SECRET: SECRET,
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: "ignore" });

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 0 — the instrument itself (ruling 125): a wrong secret must 401, or a 503
    //     below would prove nothing about tenancy.
    const unauth = await fetch(`${BASE}/api/jobs/tick?secret=wrong`, { headers: { "x-forwarded-host": "localhost" } });
    check("the guard works at all: a wrong secret is 401", unauth.status === 401, `status=${unauth.status}`);

    // 1 — POSITIVE CONTROL. A MAPPED host runs and reports the tenant it served.
    const ok = await tick("localhost");
    check("a MAPPED host runs the tick", ok.status === 200 && ok.body.ok === true, `status=${ok.status}`);
    check(
      "and the run NAMES the tenant it served (ruling 127's problem made visible)",
      typeof ok.body.tenant === "string" && (ok.body.tenant as string).length > 0,
      String(ok.body.tenant ?? "ABSENT"),
    );

    // 2 — THE PROPERTY. An UNMAPPED host does not run at all.
    const no = await tick("nobody-owns-this-host.example");
    check("an UNMAPPED host is REFUSED with 503", no.status === 503, `status=${no.status}`);
    check("the refusal names its reason", no.body.error === "tenant-unresolved", String(no.body.error ?? "none"));
    check("the refusal is not a success", no.body.ok === false, JSON.stringify(no.body.ok));

    // 3 — AN EMPTY-BUT-SUCCESSFUL RUN IS IMPOSSIBLE. This is the claim stated as
    //     a claim: on the refusal path NO step field exists at all, so there is
    //     no shape of response in which the steps all failed and ok stayed true.
    const stepFields = Object.keys(no.body).filter((k) => !["ok", "error", "host"].includes(k));
    check(
      "a refused tick reports NO step results — it never reached a step",
      stepFields.length === 0,
      stepFields.join(", ") || "none",
    );
    check(
      "and it echoes the host it refused, so the log says which one",
      no.body.host === "nobody-owns-this-host.example",
      String(no.body.host ?? "absent"),
    );
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  }

  log(`\n${failed === 0 ? `ALL CHECKS PASS (${report.filter((r) => r.startsWith("- ")).length}/${report.filter((r) => r.startsWith("- ")).length})` : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
