import { spawn, execSync, type ChildProcess } from "child_process";
import { prisma } from "../lib/prisma";

// RELEASE SMOKE — boots the BUILT app against the fixture roster and walks
// every key dynamic page as both roles. This exists because a dynamic page
// can crash at request time while `next build` stays green (that is exactly
// how the React-19-hook outage reached production): the only honest gate is
// requesting the pages the way a browser does.
//
//   npm run build
//   DATABASE_URL=postgresql://postgres@localhost:5433/<seeded-scratch> npm run smoke
//
// Empty DB? The script seeds the fixture roster itself (staging-guarded).
// Exit 0 = every page rendered; exit 1 = at least one page broke.

const PORT = 3105;
const BASE = `http://localhost:${PORT}`;
const ERROR_MARKERS = ["Something went wrong on our side", "Application error:"];

// Practitioner surfaces — the daily-driver pages, including every Portrait tab.
const PRACTITIONER_PAGES = [
  "/practitioner",
  "/practitioner/clients",
  "PORTRAIT", // replaced with /practitioner/clients/<maria>
  "PORTRAIT?tab=map",
  "PORTRAIT?tab=guide",
  "PORTRAIT?tab=margins",
  "PORTRAIT?tab=messages",
  "PORTRAIT?tab=prep",
  "PORTRAIT?tab=between",
  "PORTRAIT?tab=goals",
  "PORTRAIT?tab=beliefs",
  "PORTRAIT?tab=outcomes",
  "PORTRAIT?tab=ask",
  "PORTRAIT?tab=courses",
  "PORTRAIT?tab=profile",
  "PORTRAIT?tab=billing",
  "PORTRAIT/design",
  "PORTRAIT/design/reading",
  "PORTRAIT/prep",
  "PORTRAIT/book",
  "/practitioner/billing",
  "/practitioner/billing/rates",
  "/practitioner/schedule",
  "/practitioner/availability",
  "/practitioner/notes",
  "/practitioner/notes/inbox",
  "/practitioner/library",
  "/practitioner/worksheets/new",
  "/practitioner/courses",
  "/practitioner/leads",
  "/practitioner/patterns",
  "/practitioner/search",
  "/practitioner/messages",
  "/practitioner/settings",
  "/practitioner/settings/payments",
  "/practitioner/payments",
  "/practitioner/settings/billing",
  "/practitioner/settings/intake-preview",
  "/practitioner/settings/intake-preview?step=module:values-spiral",
  "/practitioner/settings/intake-preview?step=review",
  "/practitioner/captures",
];

// Client surfaces.
const CLIENT_PAGES = [
  "/space",
  "/space/new",
  "/space/journey",
  "/space/first-map",
  "/space/design",
  "/space/design/reading",
  "/space/courses",
  "/space/schedule",
  "/space/messages",
  "/space/settings",
  "/space/profile",
  "/space/intake",
];

// Signed-out surfaces.
const PUBLIC_PAGES = ["/login", "/forgot", "/book"];

// ---- A tiny cookie jar over fetch (next-auth needs its cookies round-tripped). ----
class Jar {
  private cookies = new Map<string, string>();
  absorb(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function get(jar: Jar, path: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: jar.header() },
    redirect: "follow",
  });
  jar.absorb(res);
  return res;
}

async function signIn(email: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await get(jar, "/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({
    csrfToken,
    email,
    password: "fixture-pass-1",
    redirect: "false",
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body,
    redirect: "manual",
  });
  jar.absorb(res);
  if (res.status !== 302 && res.status !== 200) {
    throw new Error(`sign-in failed for ${email}: ${res.status}`);
  }
  return jar;
}

async function main() {
  // ---- Preflight: a seeded fixture roster on a non-production DB ----
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL required (a seeded scratch/staging copy — never production).");
  if (/prod/i.test(new URL(dbUrl).host)) throw new Error("REFUSING: smoke never runs against production.");
  const users = await prisma.user.count().catch(() => -1);
  if (users < 0) throw new Error("Database unreachable — is scratch Postgres running?");
  if (users === 0) {
    console.log("~ empty DB — seeding the fixture roster first");
    execSync("npx tsx prisma/fixtures/seed-staging.ts", {
      stdio: "inherit",
      env: { ...process.env, SEED_ENV: "staging" },
    });
  }
  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } });
  if (!maria) throw new Error("Fixture roster missing (no María) — seed failed?");

  // ---- Boot the BUILT app (fails fast if .next is missing) ----
  console.log(`~ starting built app on :${PORT}`);
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: {
      ...process.env,
      AUTH_SECRET: process.env.AUTH_SECRET || "smoke-test-secret-not-for-real-use",
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));
  const ready = await (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) return true;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  })();
  if (!ready) {
    server.kill();
    console.error(serverLog.slice(-2000));
    throw new Error("built app never became healthy — did you run `npm run build`?");
  }

  // ---- Walk the pages ----
  let failed = 0;
  const run = async (jar: Jar | null, path: string) => {
    const j = jar ?? new Jar();
    try {
      const res = await get(j, path);
      const html = await res.text();
      const marker = ERROR_MARKERS.find((m) => html.includes(m));
      const ok = res.status === 200 && !marker;
      if (!ok) failed++;
      console.log(`- ${ok ? "✓" : "✗"} ${path}${ok ? "" : ` — status=${res.status}${marker ? ` marker="${marker}"` : ""}`}`);
    } catch (e) {
      failed++;
      console.log(`- ✗ ${path} — ${e instanceof Error ? e.message : "request failed"}`);
    }
  };

  console.log(`\n## Public`);
  for (const p of PUBLIC_PAGES) await run(null, p);

  console.log(`\n## Practitioner (valentina@fixture.test)`);
  const her = await signIn("valentina@fixture.test");
  for (const p of PRACTITIONER_PAGES) {
    await run(her, p.replace("PORTRAIT", `/practitioner/clients/${maria.id}`));
  }

  console.log(`\n## Client (maria@fixture.test)`);
  const client = await signIn("maria@fixture.test");
  for (const p of CLIENT_PAGES) await run(client, p);

  server.kill();
  console.log(`\n${failed === 0 ? "SMOKE PASS — every page rendered" : `${failed} PAGE(S) BROKE`}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
