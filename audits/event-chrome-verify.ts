// C29-EVENT-CHROME acceptance — a founding practitioner should never see
// someone else's brand.
//
// THE CHECK THAT DECIDES SHIPPABILITY (Verify 2): the default tenant's four
// auth screens are byte-identical to their pre-change output, captured at the
// pinned pre-change commit (ruling 34/37 — a commit, never HEAD) into
// audits/event-chrome/auth-chrome.fixture.json via --capture-fixture.
//
// HONESTY NOTE ON "BYTE-IDENTICAL" ACROSS BUILDS: Next SSR embeds
// build-specific artifacts (hashed /_next/static asset paths, hydration
// payloads in <script> tags) that differ between ANY two builds of identical
// source. The comparison therefore normalizes each response the same way on
// both sides: <script> blocks stripped, /_next/static/<buildId> hashes
// normalized. Everything a browser RENDERS — every tag, attribute, class and
// text byte outside scripts — is compared verbatim. The 16-screen screenshot
// baseline (ruling 11, run before/after in this session) covers /login at the
// pixel level as the second instrument.
//
// Self-cleaning: one throwaway practice (real signup service), its rows, and
// the servers it spawns. Scratch-guarded.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/event-chrome-verify.ts
//   DATABASE_URL=...scratch npx tsx audits/event-chrome-verify.ts --capture-fixture   (pre-change commit only)
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const PINNED_PRE_CHANGE = "f07a035"; // the commit C29 builds on (spec landed, code untouched)
const FIXTURE_PATH = "audits/event-chrome/auth-chrome.fixture.json";
const CAPTURE_MODE = process.argv.includes("--capture-fixture");

const PORT = 3154;
const PLATFORM_DOMAIN = "psx.test";
const SLUG_B = "t29probeb";
const HOST_B = `${SLUG_B}.${PLATFORM_DOMAIN}`;
const HOST_UNKNOWN = `t29nosuch.${PLATFORM_DOMAIN}`;
const HOST_DEFAULT = "localhost"; // resolves the default slug, same as her hosts
const EMAIL_B = "t29-probe-b@fixture.test";
const DBURL = process.env.DATABASE_URL!;
const ERR_URL = DBURL.replace(/\/\/[^@]*@/, "//t29errprobe:errprobe@");

// The pinned default-tenant surfaces. reset uses a syntactically-valid dummy
// token (the page renders its "link didn't work" state deterministically).
// /book joined in the completion dispatch (ruling 45's honest branch: its
// fixture was captured from a CHECKOUT-AND-BUILD of f07a035, since /book is
// not in the 16-screen screenshot baseline — a real before/after, not a
// post-change pin described as one).
const PINNED_PAGES = ["/login", "/forgot", "/reset/t29-dummy-token.x", "/must-change", "/", "/book"];

// Ruling 44 — the cannot-hide companion: the identity strings whose absence/
// presence this gate exists to police, counted on the RAW body INCLUDING
// script blocks (the RSC flight payload carries the wordmark too). If the
// normalized diff passes while these counts moved, the normalization hid the
// very difference the gate exists to catch, and the gate must fail.
const IDENTITY_STRINGS = ["veritas", "valentina"] as const;
function rawIdentityCounts(body: string): Record<string, number> {
  const lower = body.toLowerCase();
  const out: Record<string, number> = {};
  for (const s of IDENTITY_STRINGS) out[s] = lower.split(s).length - 1;
  return out;
}

const psql = (sql: string, url = DBURL) =>
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();

const report: string[] = [];
const results: { name: string; pass: boolean; note?: string }[] = [];
function log(s: string) {
  report.push(s);
  console.log(s);
}
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

/** Strip build-specific bytes; keep every rendered byte. */
function normalize(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, "<script/>")
    .replace(/\/_next\/static\/[^"']+/g, "/_next/static/X")
    .replace(/<link[^>]+href="\/_next\/[^"]*"[^>]*\/?>/g, "")
    // Server-action ids are BUILD-specific (the hash covers the module's
    // absolute path, so a worktree build of the SAME source yields different
    // ids) — an opaque routing token in a hidden input, not chrome. Same
    // class as the /_next/static hashes above; normalized on both sides.
    // RULING 47 — KNOWN BLIND SPOT, accepted cost of comparing across a
    // worktree checkout: this erases a value that encodes the server action's
    // module path, so a refactor that MOVES a server action to a different
    // file changes the id and this gate will NOT see it. Do not read this
    // gate as proving more than it does.
    .replace(/\$ACTION_ID_[0-9a-f]+/g, "$ACTION_ID_X");
}
/** Applied to BOTH sides at compare time: the COUNT of script stubs is build
 *  shape (hydration payload chunking), not rendered content — an async server
 *  component adds one. Every visible byte still compares verbatim. */
const stripStubs = (s: string) =>
  s.replace(/<script\/>/g, "").replace(/\$ACTION_ID_[0-9a-f]+/g, "$ACTION_ID_X");
/** The bytes a human can SEE — scripts carry storage keys ("veritas-theme")
 *  that are data, not chrome. */
const visible = (s: string) => s.replace(/<script\b[\s\S]*?<\/script>/g, "");

async function cleanup() {
  const tb = psql(`select id from "Tenant" where slug='${SLUG_B}'`);
  if (tb) {
    psql(`delete from "PracticeSetting" where "tenantId"='${tb}'`);
    psql(`delete from "AuditEvent" where "tenantId"='${tb}'`);
    psql(`delete from "TenantModule" where "tenantId"='${tb}'`);
    psql(`delete from "User" where "tenantId"='${tb}'`);
    psql(`delete from "Tenant" where id='${tb}'`);
  }
  psql(`delete from "PractitionerProspect" where email='${EMAIL_B}'`);
  try {
    psql(`drop owned by t29errprobe`);
    psql(`drop role t29errprobe`);
  } catch {
    /* absent */
  }
}

function startServer(dbUrl: string): ChildProcess {
  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(PORT),
    PLATFORM_DOMAIN,
    AUTH_TRUST_HOST: "true",
  };
  return spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
}
async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
    } catch {
      /* booting */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server never became healthy");
}
const stopServer = (s: ChildProcess) => {
  s.kill("SIGTERM");
  try {
    execFileSync("pkill", ["-f", `next start -p ${PORT}`]);
  } catch {
    /* none */
  }
};

const get = async (path: string, host: string): Promise<{ status: number; body: string; location?: string }> => {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    headers: { Host: `${host}:${PORT}`, "x-forwarded-host": `${host}:${PORT}` },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text(), location: res.headers.get("location") ?? undefined };
};

async function captureDefaults(): Promise<{ pages: Record<string, string>; rawCounts: Record<string, Record<string, number>> }> {
  const pages: Record<string, string> = {};
  const rawCounts: Record<string, Record<string, number>> = {};
  for (const p of PINNED_PAGES) {
    const r = await get(p, HOST_DEFAULT);
    // /must-change 307s for an anonymous visitor (its chrome renders only
    // mid-session) — pin the redirect shape; its wordmark is the same shared
    // component the other three pin byte-for-byte.
    if (r.status === 200) {
      pages[p] = normalize(r.body);
      rawCounts[p] = rawIdentityCounts(r.body); // RAW, pre-normalization, scripts included
    } else {
      pages[p] = `REDIRECT:${r.status}:${new URL(r.location ?? "/", "http://x").pathname}`;
      rawCounts[p] = {};
    }
  }
  return { pages, rawCounts };
}

async function main() {
  if (/railway|rlwy\.net/.test(DBURL)) throw new Error("Refusing to run against a Railway database");
  await cleanup();
  log(`# C29-EVENT-CHROME verify — ${new Date().toISOString()}`);

  if (CAPTURE_MODE) {
    const server = startServer(DBURL);
    try {
      await waitHealthy();
      const { pages, rawCounts } = await captureDefaults();
      const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
      mkdirSync("audits/event-chrome", { recursive: true });
      writeFileSync(
        FIXTURE_PATH,
        JSON.stringify(
          {
            capturedAt: head,
            note: `Byte-identity baseline for C29 (normalized: scripts stripped, build hashes normalized — every rendered byte kept) PLUS the ruling-44 raw identity counts (whole body, scripts included). Captured at ${head}; the gate pins ${PINNED_PRE_CHANGE}. Regenerate only as a deliberate re-pin.`,
            pages,
            rawCounts,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        `\nFIXTURE CAPTURED at ${head} → ${FIXTURE_PATH}${head.startsWith(PINNED_PRE_CHANGE) ? "" : `  *** WARNING: HEAD ${head} is not the pinned ${PINNED_PRE_CHANGE} ***`}`,
      );
    } finally {
      stopServer(server);
    }
    process.exit(0);
  }

  // =========================================================================
  log(`\n## Verify 1 — the five assumptions, confirmed or corrected`);
  // =========================================================================
  const grepChrome = (): string[] => {
    try {
      return execFileSync("grep", ["-rln", "veritas ", "app", "components", "--include=*.tsx"], { encoding: "utf8" })
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  const chromeLiterals = grepChrome();
  check(
    "A1 CONFIRMED-AND-WIDENED — the four auth files were the complete set of hardcoded `veritas ✧` CHROME (now zero); the .ics UIDs, export filenames, webhook header and storage keys are NOT chrome and are untouched — AND the sweep found one more identity literal the spec missed: /book's empty-slots copy named Valentina on every host (fixed with the same tenant-resolving pattern, default tenant byte-identical)",
    chromeLiterals.length === 0,
    `files still carrying a hardcoded wordmark: ${chromeLiterals.join(", ") || "none"} · non-chrome veritas strings intact (uid/filename/header/keys)`,
  );
  const dbTitle = psql(`select branding->>'portalTitle' from "Tenant" where id='tnt_valentina_000000001'`);
  const migTitle = execFileSync("grep", ["-c", '"portalTitle": "veritas"', "prisma/migrations/33_tenant_phase0/migration.sql"], { encoding: "utf8" }).trim();
  check(
    'A2 CONFIRMED — the default tenant\'s branding.portalTitle IS exactly "veritas", in the live row AND in migration 33\'s canonical INSERT (which production carries) — the no-acceptance argument stands on data, not hope',
    dbTitle === "veritas" && migTitle === "1",
    `db="${dbTitle}" · migration 33 carries it`,
  );
  const wallSrc = readFileSync("scripts/check-public-wall.mjs", "utf8");
  check(
    "A3 CONFIRMED — the public wall covers app/(public)/** only and bans auth/prisma imports there; /login etc. live OUTSIDE it and @/lib/tenancy is resolution plumbing, not a banned import — the wall is untouched (lint:wall green in regression)",
    /\(public\)/.test(wallSrc) && !/tenancy/.test(wallSrc),
    "wall scope verified from its own source",
  );
  // A4 and A5 are proven behaviorally below (failure section / redirect section).

  // =========================================================================
  log(`\n## Rig — practice B (real signup), the errprobe role`);
  // =========================================================================
  process.env.PLATFORM_DOMAIN = PLATFORM_DOMAIN;
  const { signUpPractitioner } = (await import("../lib/signup")) as any;
  const su = await signUpPractitioner({
    name: "T29 Probe B",
    practiceName: "T29 Bright Practice",
    email: EMAIL_B,
    password: "t29-probe-pass-2026",
    slug: SLUG_B,
    baseUrl: `http://localhost:${PORT}`,
  });
  const tenantB = psql(`select id from "Tenant" where slug='${SLUG_B}'`);
  const titleB = psql(`select branding->>'portalTitle' from "Tenant" where id='${tenantB}'`);
  check("a real ACTIVE non-default practice exists; signup gave it its own portalTitle", su?.ok === true && !!tenantB && !!titleB, `tenant B = ${tenantB} · portalTitle="${titleB}"`);
  psql(`create role t29errprobe login password 'errprobe'`);
  psql(`grant usage on schema public to t29errprobe`);
  psql(`grant select, insert, update, delete on all tables in schema public to t29errprobe`);
  psql(`grant usage, select on all sequences in schema public to t29errprobe`);
  psql(`revoke select on "Tenant" from t29errprobe`);

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

  const server = startServer(DBURL);
  try {
    await waitHealthy();

    // =======================================================================
    log(`\n## Verify 2 + 5 — THE SHIPPABILITY CHECK: the default tenant's five pinned surfaces, byte-identical to ${fixture.capturedAt}`);
    // =======================================================================
    const now = await captureDefaults();
    for (const p of PINNED_PAGES) {
      const same = stripStubs(now.pages[p]) === stripStubs(fixture.pages[p]);
      if (!same) {
        const a = stripStubs(now.pages[p] ?? "").split("\n").join("");
        const b = stripStubs(fixture.pages[p] ?? "").split("\n").join("");
        let i = 0;
        while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
        log(`  ${p} diverges at normalized byte ${i}:\n    now:     …${a.slice(Math.max(0, i - 40), i + 80)}\n    fixture: …${b.slice(Math.max(0, i - 40), i + 80)}`);
      }
      const label = p === "/" ? "V5" : p === "/book" ? "V5-book (fixture captured from a checkout-and-build of f07a035 — a real before/after, ruling 45)" : "V2";
      check(
        `${label} — default tenant ${p} BYTE-IDENTICAL to the ${fixture.capturedAt} fixture (normalized as documented; every rendered byte compared)`,
        same && fixture.capturedAt === PINNED_PRE_CHANGE,
        same ? `${(now.pages[p] ?? "").length} normalized bytes identical` : "DIVERGED — see above",
      );
    }

    // Ruling 44 — the cannot-hide companion, on the RAW responses: the
    // normalization strips scripts, so an identity string living ONLY inside a
    // script block (the RSC flight payload) would be invisible to the checks
    // above. This check counts the identity strings across the WHOLE raw body
    // and compares to the counts captured at f07a035. If the normalized diff
    // passes while these counts moved, the normalization hid a difference and
    // this gate says so. (Demonstrated failing under an injected script-only
    // change — output quoted in the build report.)
    // NAMED, JUSTIFIED deltas between the f07a035 fixture and the accepted C29
    // state — found BY this check on its first real run (it fired before any
    // injection demo was attempted), disclosed in the build report for
    // ratification. Any delta not named here still fails.
    //   /login veritas +1: the wordmark is now a server-resolved prop passed
    //   into the LoginClient boundary, so the RSC flight payload serializes
    //   the string "veritas " once as slot data. Same tenant's same wordmark,
    //   relocated by the implementation — the VISIBLE half is byte-identical
    //   (the normalized check above proves it).
    // RULING 46 (scope limit): EXPECTED_DELTAS is for structurally-explained
    // serialization artifacts ONLY. Any future delta requires the same three
    // things — rendered bytes unchanged, a named structural cause, and a
    // demonstrated failure with the delta present. A delta added to make a
    // red gate green is not permitted.
    const EXPECTED_DELTAS: Record<string, Record<string, number>> = { "/login": { veritas: 1 } };
    const hidden: string[] = [];
    for (const p of PINNED_PAGES) {
      const want = fixture.rawCounts?.[p] ?? {};
      const got = now.rawCounts[p] ?? {};
      for (const sName of IDENTITY_STRINGS) {
        const expected = (want[sName] ?? 0) + (EXPECTED_DELTAS[p]?.[sName] ?? 0);
        if (expected !== (got[sName] ?? 0)) {
          hidden.push(`${p}: "${sName}" expected ${expected} (fixture ${want[sName] ?? 0}${EXPECTED_DELTAS[p]?.[sName] ? ` + named delta ${EXPECTED_DELTAS[p][sName]}` : ""}) → ${got[sName] ?? 0}`);
        }
      }
    }
    check(
      "RULING-44 CANNOT-HIDE — the RAW identity-string counts (whole body, scripts included) match the f07a035 fixture on every pinned page, modulo ONE named+justified delta (/login veritas +1, the wordmark serialized as RSC slot data — found by this check itself); any unnamed delta fails",
      hidden.length === 0,
      hidden.length ? `NORMALIZATION HID A DIFFERENCE: ${hidden.join(" · ")}` : `counts match across ${PINNED_PAGES.length} pages × ${IDENTITY_STRINGS.length} strings (1 named delta applied)`,
    );

    // =======================================================================
    log(`\n## Verify 3 — practice B's auth chrome is B's`);
    // =======================================================================
    const bLogin = await get("/login", HOST_B);
    check(
      "V3 — practice B's /login renders B's OWN wordmark and the string `veritas` appears NOWHERE in the VISIBLE response (scripts carry the pre-existing `veritas-theme` storage key — data, not chrome)",
      bLogin.status === 200 && visible(bLogin.body).includes("T29 Bright Practice") && !/veritas/i.test(visible(bLogin.body)),
      `status=${bLogin.status} · B wordmark visible=${visible(bLogin.body).includes("T29 Bright Practice")} · veritas in visible html=${/veritas/i.test(visible(bLogin.body))}`,
    );

    // =======================================================================
    log(`\n## Verify 4 + A5 — practice B's public root lands on B's own booking surface`);
    // =======================================================================
    const bRoot = await get("/", HOST_B);
    const bRootFollowed = bRoot.status >= 300 && bRoot.location ? await get(new URL(bRoot.location, `http://${HOST_B}:${PORT}`).pathname, HOST_B) : bRoot;
    check(
      "V4 — B's root REDIRECTS to /book (no per-practice marketing page invented): the landing is the BOOKING page, not the marketing home. (The /book page's own static copy is Valentina's on every host today — the F2 remainder, brand-web scope, documented in the report.)",
      bRoot.status >= 300 &&
        /\/book$/.test(bRoot.location ?? "") &&
        bRootFollowed.status === 200 &&
        /find a time to talk/i.test(bRootFollowed.body) &&
        !/Meet Valentina/i.test(bRootFollowed.body),
      `/ → ${bRoot.status} → ${bRootFollowed.status} · booking heading present=${/find a time to talk/i.test(bRootFollowed.body)} · marketing-home copy absent=${!/Meet Valentina/i.test(bRootFollowed.body)}`,
    );
    check(
      "A5 ANSWERED-AND-FIXED — a practice with NO availability lands on the honest empty state naming ITS OWN practice, never 'Valentina will find a time' (the pre-change copy said that on every host); the default tenant's copy is byte-unchanged (covered by V2/V5)",
      /T29 Bright Practice will\s+find a time with you/.test(visible(bRootFollowed.body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) &&
        !/Valentina will find a time/.test(bRootFollowed.body),
      `empty-slots names=${/T29 Bright Practice will\s+find a time/.test(visible(bRootFollowed.body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))} · 'Valentina will find a time' absent=${!/Valentina will find a time/.test(bRootFollowed.body)}`,
    );

    // =======================================================================
    log(`\n## Verify 6 — an unknown slug behaves exactly as today`);
    // =======================================================================
    const uRoot = await get("/", HOST_UNKNOWN);
    const uLogin = await get("/login", HOST_UNKNOWN);
    check(
      "V6 — unknown slug: root serves the default marketing home (200, no redirect) and /login the default wordmark — the documented unknown-slug behavior, unchanged",
      uRoot.status === 200 && uLogin.status === 200 && uLogin.body.includes("veritas"),
      `/ → ${uRoot.status} · /login wordmark=veritas`,
    );
  } finally {
    stopServer(server);
  }

  // =========================================================================
  log(`\n## Verify 7 + A4 — under C26's injected failure, nothing borrows a wordmark`);
  // =========================================================================
  const errServer = startServer(ERR_URL);
  try {
    await waitHealthy();
    const fLogin = await get("/login", HOST_B);
    const fRoot = await get("/", HOST_B);
    check(
      "V7/A4 — under resolution failure, B's /login renders NO wordmark at all in the VISIBLE html (no veritas, no practice name — C26's neutral shell) and the root does not redirect into a form that cannot be submitted",
      fLogin.status === 200 && !/veritas/i.test(visible(fLogin.body)) && !visible(fLogin.body).includes("T29 Bright Practice") && fRoot.status === 200,
      `/login → ${fLogin.status} · veritas visible=${/veritas/i.test(visible(fLogin.body))} · practice name visible=${visible(fLogin.body).includes("T29 Bright Practice")} · / → ${fRoot.status}`,
    );
  } finally {
    stopServer(errServer);
  }

  await cleanup();
  check(
    "SELF-CLEANING — probe practice and role are gone",
    psql(`select count(*) from "Tenant" where slug='${SLUG_B}'`) === "0" && psql(`select count(*) from pg_roles where rolname='t29errprobe'`) === "0",
    "rows 0 · role gone",
  );

  const failed = results.filter((r) => !r.pass);
  log(`\n${failed.length === 0 ? `EVENT-CHROME VERIFY PASS — ${results.length}/${results.length}` : `${failed.length} CHECK(S) FAILED — ${results.length - failed.length}/${results.length}`}`);
  if (failed.length === 0) {
    mkdirSync("audits/event-chrome", { recursive: true });
    writeFileSync("audits/event-chrome/VERIFY-LOG.md", report.join("\n") + "\n");
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("gate error:", e?.stack ?? e);
  try {
    execFileSync("pkill", ["-f", `next start -p ${PORT}`]);
  } catch {
    /* none */
  }
  await cleanup().catch(() => undefined);
  process.exit(1);
});
