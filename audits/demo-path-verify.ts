// C30-DEMO-PATH acceptance — the path Jacob walks on Sept 23, as one gate.
//
// Every other gate tests a component; this one walks the SEAMS, HTTP-level
// (no browser — the chromium path is machine-pinned, A4): a prospect joins at
// /join with JS disabled, the thanks screen hands them THEIR code, a second
// person signs up at /signup?ref=<that code>, a practice is provisioned, and
// that practice's own host serves that practice's identity (C29 observed end
// to end). Run twice in EN and ES (law 7). Negative space asserted: no price
// and no "free"/"gratis" on the funnel screens (law 2), ZERO mail leaves the
// process (law 10 — a local sink stands in for Resend and must count 0 hits),
// no Stripe object, no null-tenant row.
//
// Server actions are exercised the no-JS way on purpose: the SSR form carries
// a hidden $ACTION_ID_<id> input, and posting the form urlencoded with that
// field is exactly what a browser without JavaScript does. The time-trap field
// `t` renders 0 without JS (useEffect never runs), and the actions treat 0 as
// "no reading" — so the gate is a legitimate no-JS visitor, not a bypass.
//
// KNOWN, NAMED EXCEPTIONS — pinned by exact count so a NEW leak still fails
// while the known ones stay visible instead of normalized away (ruling 44's
// spirit). A5 of the C30 spec is PARTIALLY DISPROVED by these and REPORTED,
// not worked around; fixing any of them moves its pin to 0 in a reviewed
// commit. Enumerated on a provisioned practice's own host:
//   /book HEAD  — 8× "valentina": her tab title ("… · Valentina Vélez"), meta
//     description, canonical valentinavelez.com, og:title/og:url/og:site_name,
//     twitter:title, and the preloaded /valentina-logo.png (root layout + the
//     page's own static metadata — the F2 remainder, brand-web scope).
//   /book BODY  — 6× "valentina": the PUBLIC LAYOUT's header (her logo + name,
//     3) and footer (logo + name + copyright, 3) render on every public page
//     of every host. The C29 empty-state fix holds (the practice is named).
//   /book HEAD  — 2× "veritas": the root layout's application-name and
//     apple-mobile-web-app-title.
//   portal HEAD — 3× "veritas": <title>, application-name, apple title — the
//     ROOT LAYOUT's metadata on the signed-in practitioner's own portal (C29
//     scoped its metadata fix to the four auth screens; NEW FINDING, reported
//     for dispatch).
//
// Self-cleaning and idempotent: reserved fixture slugs (c30-demo-en/-es, one
// per language leg — a single reused slug would collide with C26's ratified
// stale-counts-as-resolved host cache, which keeps serving leg 1's identity
// after a teardown-and-recreate under the same host), torn down before and
// after; run the gate twice back to back, both green. Scratch-guarded —
// refuses a Railway DATABASE_URL.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/demo-path-verify.ts
import { execFileSync, spawn, type ChildProcess } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createServer, type Server } from "http";

const PORT = 3160;
const SINK_PORT = 3161;
const PLATFORM_DOMAIN = "psx.test";
const SLUGS = { en: "c30-demo-en", es: "c30-demo-es" } as const; // the gate's reserved slugs — never the default tenant
const HOST_DEFAULT = "localhost"; // the marketing/default host, where /join and /signup live
const DBURL = process.env.DATABASE_URL!;

// Per-leg fixtures. Distinct emails keep the per-email rate cap (3/h) out of
// range; the slug is shared and torn down between legs.
const LEGS = {
  en: {
    referrer: { name: "Rowan Ash", email: "c30-ref-en@fixture.test" },
    founder: { name: "Mara Linden", email: "c30-founder-en@fixture.test", practice: "Cedar Grove Counseling" },
  },
  es: {
    referrer: { name: "Ines Vega", email: "c30-ref-es@fixture.test" },
    founder: { name: "Tomas Aguirre", email: "c30-founder-es@fixture.test", practice: "Consultorio Cedro" },
  },
} as const;
const PASSWORD = "c30-demo-pass-1";
const ALL_EMAILS = [LEGS.en.referrer.email, LEGS.en.founder.email, LEGS.es.referrer.email, LEGS.es.founder.email];

// Law 2 — no dollar figure, no "free"/"gratis"/"price"/"precio" on the funnel
// screens. Word-bounded so "freedom" would not trip it. SCOPE, disclosed: the
// word scan runs on the RENDERED BODY (what the person in the room sees) —
// the root layout's <head> meta description carries Valentina's marketing
// sentence "…break free from self-sabotage…" on every page, which is not
// pricing language and is not on the screen. A DOLLAR FIGURE is asserted on
// every VISIBLE byte including <head> (a price in a meta tag is still a
// price) but not inside scripts — the RSC flight payload serializes reference
// tokens like "$10" that are routing ids, not money.
// THE TWO SCANS HAVE DIFFERENT SCOPES ON PURPOSE (ratified with ruling 54's
// batch): "free" is an ordinary English word that appears innocently in prose
// metadata, so it is scanned only where law 2 means it — the screen; "$<digit>"
// is unambiguous pricing anywhere a person or crawler can read it, so it is
// scanned on all visible bytes. Do NOT tidy them into one scope.
const LAW2_WORDS = /\bfree\b|\bgratis\b|\bprice\b|\bprecio\b/i;
const LAW2_MONEY = /\$\s*\d/;
const law2Clean = (html: string) => !LAW2_WORDS.test(bodyOnly(html)) && !LAW2_MONEY.test(visible(html));

// The identity strings this platform must never leak onto a new practice's
// surfaces (C29). Counted on VISIBLE bytes — scripts carry the storage key
// "veritas-theme" on every page, which is data, not chrome (same treatment as
// event-chrome-verify).
const visible = (s: string) => s.replace(/<script\b[\s\S]*?<\/script>/g, "");
const bodyOnly = (s: string) => visible(s.replace(/^[\s\S]*?<\/head>/, ""));
const countCI = (hay: string, needle: string) => hay.toLowerCase().split(needle).length - 1;

// RULING 50 — these pins are QUARANTINE, not acceptance: each names its defect,
// cites its tracking item, and the checks compare with exact equality so ANY
// change in EITHER direction fails — growth is regression, shrinkage means the
// defect was fixed and the pin must be RETIRED (not lowered) in the same
// reviewed commit. (Distinct from event-chrome's EXPECTED_DELTAS under ruling
// 46, which covers serialization artifacts with no defect behind them.)
// Every occurrence is enumerated in this gate's header comment.
const BOOK_KNOWN_VALENTINA_HEAD = 8; // defect: Valentina's metadata on a foreign tenant's /book — F2 remainder, chrome half → C31 (ruling 54)
const BOOK_KNOWN_VALENTINA_BODY = 6; // defect: her public-layout header+footer on a foreign tenant's /book — F2 remainder, chrome half → C31 (ruling 54)
const BOOK_KNOWN_VERITAS_HEAD = 2; // defect: root-layout app names on a foreign tenant's /book — same C31 item
const PORTAL_KNOWN_VERITAS_HEAD = 3; // defect: root-layout tab metadata inside a foreign tenant's PORTAL — C30 finding 1, BUILD-STATE Blocked list + ruling 53 → C31

const psql = (sql: string) =>
  execFileSync("psql", [DBURL, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();

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

function cleanup() {
  for (const slug of Object.values(SLUGS)) {
    const t = psql(`select id from "Tenant" where slug='${slug}'`);
    if (!t) continue;
    for (const table of ["PracticeSetting", "AuditEvent", "TenantBilling", "TenantModule", "User"])
      psql(`delete from "${table}" where "tenantId"='${t}'`);
    psql(`delete from "Tenant" where id='${t}'`);
  }
  psql(`delete from "PractitionerProspect" where email in (${ALL_EMAILS.map((e) => `'${e}'`).join(",")})`);
}

let sinkHits = 0;
function startSink(): Server {
  const s = createServer((req, res) => {
    sinkHits++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(`{"id":"sink"}`);
  });
  s.listen(SINK_PORT);
  return s;
}

// Next 14 renames its worker to "next-server (v…)", so a pkill on "next start"
// never matches and an orphan from a crashed run keeps the port — and its
// IN-MEMORY rate-limit counters — alive while a fresh spawn dies on the bound
// port and waitHealthy happily talks to the ghost. Kill by PORT, both before
// starting and when stopping.
const killPort = () => {
  try {
    execFileSync("fuser", ["-k", `${PORT}/tcp`], { stdio: "ignore" });
  } catch {
    /* nothing was listening */
  }
};

function startServer(): ChildProcess {
  killPort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: DBURL,
    AUTH_SECRET: process.env.AUTH_SECRET || "c30-secret",
    PORT: String(PORT),
    PLATFORM_DOMAIN,
    AUTH_TRUST_HOST: "true",
    // Law 10 — ZERO mail leaves this gate. Every sending credential is
    // stripped (emailConfigured() and platformIdentity() both go false, so
    // every path honestly skips), and RESEND_API_URL points at the local sink
    // so that if ANY path still tried, the sink would count it.
    RESEND_API_URL: `http://localhost:${SINK_PORT}`,
  };
  delete env.RESEND_API_KEY;
  delete env.NOTIFY_FROM_EMAIL;
  delete env.PLATFORM_RESEND_API_KEY;
  delete env.PLATFORM_FROM_EMAIL;
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
  killPort();
};

type Resp = { status: number; body: string; location?: string; setCookies: string[] };
async function req(path: string, host: string, init?: { method?: string; body?: FormData; cookie?: string }): Promise<Resp> {
  const headers: Record<string, string> = {
    Host: `${host}:${PORT}`,
    "x-forwarded-host": `${host}:${PORT}`,
  };
  if (init?.cookie) headers.cookie = init.cookie;
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body,
    redirect: "manual",
  });
  return {
    status: res.status,
    body: await res.text(),
    location: res.headers.get("location") ?? undefined,
    setCookies: res.headers.getSetCookie?.() ?? [],
  };
}

/** The no-JS server-action post: read the SSR form's $ACTION_ID field and post
 *  the fields multipart, exactly as the SSR form tag declares
 *  (encType="multipart/form-data" method="POST"). */
async function postAction(path: string, host: string, pageHtml: string, fields: Record<string, string>): Promise<Resp> {
  const m = pageHtml.match(/name="(\$ACTION_ID_[0-9a-f]+)"/);
  if (!m) throw new Error(`no $ACTION_ID form field found on ${path}`);
  const body = new FormData();
  body.set(m[1], "");
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return req(path, host, { method: "POST", body });
}

/** HTTP-level credentials sign-in (the phase5-verify pattern). */
async function signIn(email: string, password: string, host: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (setCookies: string[]) => {
    for (const c of setCookies) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`http://localhost:${PORT}/api/auth/csrf`, {
    headers: { "x-forwarded-host": `${host}:${PORT}` },
  });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`http://localhost:${PORT}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
      "x-forwarded-host": `${host}:${PORT}`,
    },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookieHeader();
}

// The in-language catalogs the screens render from — asserted from the SOURCE
// so the gate follows copy edits instead of hardcoding sentences.
const cap = (locale: "en" | "es") =>
  JSON.parse(readFileSync(`messages/${locale}/capture.json`, "utf8")).capture as Record<string, any>;
const sig = (locale: "en" | "es") =>
  JSON.parse(readFileSync(`messages/${locale}/signup.json`, "utf8")).signup as Record<string, any>;
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
// SSR HTML escapes apostrophes etc.; compare against the escaped form, with
// em-dash/quote characters intact.
const has = (html: string, text: string) => html.includes(escapeHtml(text));

const REF_CODE_RE = /font-mono[^>]*>([23456789ABCDEFGHJKMNPQRSTVWXYZ]{8})</;

async function walkLeg(locale: "en" | "es") {
  const L = LEGS[locale];
  const SLUG = SLUGS[locale];
  const HOST_NEW = `${SLUG}.${PLATFORM_DOMAIN}`;
  const q = locale === "es" ? "?lang=es" : "";
  const amp = locale === "es" ? "&lang=es" : "";
  const label = locale.toUpperCase();
  const capCopy = cap(locale);
  const sigCopy = sig(locale);

  cleanup();

  // ---- 1. /join, JS disabled ----
  const joinPage = await req(`/join${q}`, HOST_DEFAULT);
  check(
    `${label} — /join renders in ${label} with no price and no "free" (law 2)`,
    joinPage.status === 200 && has(joinPage.body, capCopy.heading) && law2Clean(joinPage.body),
    `status ${joinPage.status}; heading present: ${has(joinPage.body, capCopy.heading)}; law2: ${law2Clean(joinPage.body)}`,
  );

  const joinPost = await postAction(`/join${q}`, HOST_DEFAULT, joinPage.body, {
    lang: locale,
    name: L.referrer.name,
    email: L.referrer.email,
    phone: "",
    practiceName: "",
    note: "",
    ref: "",
    src: "",
    company: "", // honeypot stays empty — we are a human
    t: "0", // what a JS-less browser sends: useEffect never ran
  });
  const thanksLoc = joinPost.location ?? "";
  const codeFromLocation = new URL(thanksLoc, `http://${HOST_DEFAULT}`).searchParams.get("code") ?? "";
  check(
    `${label} — /join POST (no-JS server action) lands on the thanks screen with a code`,
    joinPost.status === 303 && /\/join\/thanks\?/.test(thanksLoc) && codeFromLocation.length === 8,
    `${joinPost.status} → ${thanksLoc}`,
  );

  // ---- 2. the thanks screen carries THE code (A2: the displayed string) ----
  const thanks = await req(`${new URL(thanksLoc, `http://${HOST_DEFAULT}`).pathname}?${new URL(thanksLoc, `http://${HOST_DEFAULT}`).searchParams.toString()}`, HOST_DEFAULT);
  const displayed = thanks.body.match(REF_CODE_RE)?.[1] ?? "";
  check(
    `${label} — thanks screen displays the referral code, in ${label}, law-2 clean`,
    thanks.status === 200 &&
      displayed === codeFromLocation &&
      has(thanks.body, capCopy.thanks.heading) &&
      law2Clean(thanks.body),
    `displayed "${displayed}"`,
  );

  // ---- 3. /signup?ref=<displayed code> — the SAME string, no transformation ----
  const signupPage = await req(`/signup?ref=${displayed}${amp}`, HOST_DEFAULT);
  const refField = signupPage.body.match(/name="ref"[^>]*value="([^"]*)"/) ?? signupPage.body.match(/value="([^"]*)"[^>]*name="ref"/);
  check(
    `${label} — /signup renders in ${label}, carries ref="${displayed}" untransformed, law-2 clean`,
    signupPage.status === 200 &&
      refField?.[1] === displayed &&
      has(signupPage.body, sigCopy.heading) &&
      law2Clean(signupPage.body),
  );

  const signupPost = await postAction(`/signup?ref=${displayed}${amp}`, HOST_DEFAULT, signupPage.body, {
    lang: locale,
    name: L.founder.name,
    practiceName: L.founder.practice,
    email: L.founder.email,
    password: PASSWORD,
    slug: SLUG,
    ref: displayed,
    source: "referral",
    company: "",
    t: "0",
  });
  const welcomeLoc = signupPost.location ?? "";
  check(
    `${label} — /signup POST provisions and lands on the welcome screen`,
    signupPost.status === 303 && /\/signup\/welcome\?/.test(welcomeLoc) && welcomeLoc.includes(`slug=${SLUG}`),
    `${signupPost.status} → ${welcomeLoc}`,
  );

  const wUrl = new URL(welcomeLoc, `http://${HOST_DEFAULT}`);
  const welcome = await req(`${wUrl.pathname}?${wUrl.searchParams.toString()}`, HOST_DEFAULT);
  check(
    `${label} — welcome screen renders in ${label} and names the portal host`,
    welcome.status === 200 && welcome.body.includes(`${SLUG}.${PLATFORM_DOMAIN}`) && has(welcome.body, sigCopy.welcome.heading),
  );

  // ---- 4. what a signup IS (A3), read from the database ----
  const t = psql(`select id from "Tenant" where slug='${SLUG}'`);
  const shape = psql(
    `select status || '|' || "layoutKey" || '|' || "skinKey" from "Tenant" where id='${t}'`,
  );
  check(`${label} — tenant is ACTIVE + journey-v1 + warm-clay`, shape === "ACTIVE|journey-v1|warm-clay", shape);

  const modules = psql(`select string_agg("moduleKey", ',' order by "moduleKey") from "TenantModule" where "tenantId"='${t}'`);
  check(
    `${label} — exactly the three standard modules`,
    modules === "archetypal-keys,body-graph,values-spiral",
    modules,
  );

  const billing = psql(
    `select plan || '|' || coalesce("stripeCustomerId",'NULL') || '|' || coalesce("stripeSubscriptionId",'NULL') from "TenantBilling" where "tenantId"='${t}'`,
  );
  check(`${label} — FOUNDING_COMP and ZERO Stripe objects`, billing === "FOUNDING_COMP|NULL|NULL", billing);

  const founderRef = psql(
    `select status || '|' || coalesce("referredByCode",'NULL') from "PractitionerProspect" where email='${L.founder.email}'`,
  );
  check(
    `${label} — A2: the founder's stored referredByCode IS the displayed string, byte-equal`,
    founderRef === `SIGNED_UP|${displayed}`,
    founderRef,
  );
  const referrerRow = psql(
    `select status || '|' || "referralCode" from "PractitionerProspect" where email='${L.referrer.email}'`,
  );
  check(`${label} — the referrer stays LEAD and owns that code`, referrerRow === `LEAD|${displayed}`, referrerRow);

  // ---- 5. the new practice's OWN host serves ITS identity (A5, C29 end to end) ----
  const login = await req("/login", HOST_NEW);
  const loginVis = visible(login.body);
  check(
    `${label} — ${HOST_NEW}/login wordmark and tab title are the practice's; zero veritas/valentina visible (C29, observed end to end)`,
    login.status === 200 &&
      has(loginVis, L.founder.practice) &&
      login.body.includes(`<title>${escapeHtml(L.founder.practice)}`) &&
      countCI(loginVis, "veritas") === 0 &&
      countCI(loginVis, "valentina") === 0,
    `status ${login.status}; practice in visible: ${has(loginVis, L.founder.practice)}; veritas=${countCI(loginVis, "veritas")}, valentina=${countCI(loginVis, "valentina")}`,
  );

  const root = await req("/", HOST_NEW);
  check(
    `${label} — ${HOST_NEW}/ 307s to /book (C29 redirect, never Valentina's marketing page)`,
    root.status === 307 && /\/book$/.test(root.location ?? ""),
    `${root.status} → ${root.location}`,
  );

  const book = await req("/book", HOST_NEW);
  const bookBody = bodyOnly(book.body);
  const bookVis = visible(book.body);
  const bookHeadValentina = countCI(bookVis, "valentina") - countCI(bookBody, "valentina");
  const bookHeadVeritas = countCI(bookVis, "veritas") - countCI(bookBody, "veritas");
  check(
    `${label} — ${HOST_NEW}/book empty state names the practice; the KNOWN leaks pinned exactly (valentina head ${BOOK_KNOWN_VALENTINA_HEAD}/body ${BOOK_KNOWN_VALENTINA_BODY} = her public-layout header+footer and page metadata, the F2 remainder; veritas head ${BOOK_KNOWN_VERITAS_HEAD} = root-layout app names) — enumerated in this gate's header, REPORTED not accepted`,
    book.status === 200 &&
      has(bookBody, L.founder.practice) &&
      countCI(bookBody, "veritas") === 0 &&
      countCI(bookBody, "valentina") === BOOK_KNOWN_VALENTINA_BODY &&
      bookHeadValentina === BOOK_KNOWN_VALENTINA_HEAD &&
      bookHeadVeritas === BOOK_KNOWN_VERITAS_HEAD,
    `valentina head=${bookHeadValentina} body=${countCI(bookBody, "valentina")}; veritas head=${bookHeadVeritas} body=${countCI(bookBody, "veritas")}`,
  );

  // ---- 6. the founder can enter their portal on their host ----
  const cookie = await signIn(L.founder.email, PASSWORD, HOST_NEW);
  const portal = await req("/practitioner", HOST_NEW, { cookie });
  const portalVis = visible(portal.body);
  const portalBody = bodyOnly(portal.body);
  const portalHeadVeritas = countCI(portalVis, "veritas") - countCI(portalBody, "veritas");
  check(
    `${label} — the founder signs in; the portal SCREEN carries THEIR practice and zero veritas/valentina; the tab metadata still says Veritas (root layout, pinned at ${PORTAL_KNOWN_VERITAS_HEAD} — NEW FINDING, reported for dispatch)`,
    portal.status === 200 &&
      has(portalBody, L.founder.practice) &&
      countCI(portalBody, "veritas") === 0 &&
      countCI(portalBody, "valentina") === 0 &&
      countCI(portalVis, "valentina") === 0 &&
      portalHeadVeritas === PORTAL_KNOWN_VERITAS_HEAD,
    `status ${portal.status}; veritas head=${portalHeadVeritas} body=${countCI(portalBody, "veritas")}; valentina=${countCI(portalVis, "valentina")}`,
  );
}

async function main() {
  if (!DBURL) throw new Error("DATABASE_URL required");
  if (/railway|rlwy\.net/.test(DBURL)) throw new Error("Refusing to run against a Railway database");

  log(`# C30-DEMO-PATH verify — ${new Date().toISOString()}`);
  log(`# the full event path over HTTP, EN and ES, against throwaway practices ("${SLUGS.en}", "${SLUGS.es}")`);

  const sink = startSink();
  const server = startServer();
  try {
    await waitHealthy();

    await walkLeg("en");
    await walkLeg("es");

    // ---- global negative space, after both legs ----
    check(
      "law 10 — ZERO mail left the process: the Resend sink counted 0 hits with every sending credential stripped",
      sinkHits === 0,
      `sink hits: ${sinkHits}`,
    );
    const messages = psql(
      `select count(*) from "ProspectMessage" where "prospectId" in (select id from "PractitionerProspect" where email in (${ALL_EMAILS.map((e) => `'${e}'`).join(",")}))`,
    );
    check("law 10 — zero engage rows for the fixture prospects (the gate stays CLOSED)", messages === "0", messages);

    const nullRows = psql(
      `select coalesce(sum(c),0) from (
         select count(*) c from "User" where "tenantId" is null
         union all select count(*) from "AuditEvent" where "tenantId" is null
         union all select count(*) from "TenantModule" where "tenantId" is null
         union all select count(*) from "TenantBilling" where "tenantId" is null
         union all select count(*) from "PracticeSetting" where "tenantId" is null
         union all select count(*) from "Lead" where "tenantId" is null
         union all select count(*) from "Appointment" where "tenantId" is null
       ) s`,
    );
    check("no null-tenant row anywhere the path touches", nullRows === "0", `${nullRows} null-tenant rows`);
  } finally {
    stopServer(server);
    sink.close();
    cleanup();
  }

  const residue =
    psql(`select count(*) from "Tenant" where slug in ('${SLUGS.en}','${SLUGS.es}')`) +
    psql(`select count(*) from "PractitionerProspect" where email in (${ALL_EMAILS.map((e) => `'${e}'`).join(",")})`);
  check("self-cleaning — no fixture residue after the run", residue === "00", residue);

  const passed = results.filter((r) => r.pass).length;
  log(`\n${passed}/${results.length} checks passed`);
  mkdirSync("audits/demo-path", { recursive: true });
  writeFileSync(
    "audits/demo-path/VERIFY-LOG.md",
    `# demo-path VERIFY-LOG (gate-written, ruling 17)\n\nLast run: ${new Date().toISOString()}\n\n${report.join("\n")}\n`,
  );
  if (passed !== results.length) {
    console.error("\nDEMO-PATH VERIFY FAILED");
    process.exit(1);
  }
  console.log("\nDEMO-PATH VERIFY PASS");
}

main().catch((e) => {
  console.error(e);
  try {
    cleanup();
  } catch {
    /* best effort */
  }
  process.exit(1);
});
