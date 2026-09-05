import { spawn, execSync, type ChildProcess } from "child_process";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// C23-REFERRAL acceptance — attribution and the reason to share, in a real
// browser against the BUILT app. Proves, per the spec's Verify list:
//   1  a code resolves to its owner; counts split LEAD vs SIGNED_UP across a
//      seeded fan-out of 3 prospects, one converted
//   2  /join?ref= and /signup?ref= show "invited by a founding partner" in BOTH
//      locales and NEVER the referrer's name, email or practice name
//   3  an unknown code and a malformed code render no invited-by line and no
//      error; a /signup carrying an unresolvable code still completes
//   4  self-referral refused at BOTH /join and /signup; no self-referential row
//      survives anywhere in the ledger
//   5  first touch immutable: a second ?ref= (through /signup, the path that
//      used to overwrite it) never replaces the first
//   6  /practitioner/referrals: own code + counts, FIRST NAMES ONLY (surnames
//      and emails absent), honest zero state, redirect for a signed-out
//      visitor, and one practitioner can never see another's referral data
//      (two throwaway tenants, explicitly)
//   7  no reward / price / earning language on any new surface or catalog
//   8  admin top-referrers renders for the allowlist, 404s otherwise, counts
//      match the seeded fan-out
//   9  the attribution AuditEvent is metadata only
// Throwaway tenants + prospects; self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/referral/verify.ts

const PORT = 3127;
const BASE = `http://localhost:${PORT}`;
const PLATFORM_DOMAIN = "platform.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const DEFAULT_TENANT_ID = "tnt_valentina_000000001";

const ADMIN_EMAIL = "referral-admin@fixture.test";
const STRANGER_EMAIL = "referral-stranger@fixture.test";
const PASSWORD = "referral-probe-2026";

// ---- the two throwaway tenants (cross-tenant isolation needs two) ----
const A = {
  slug: "refprobea",
  host: `refprobea.${PLATFORM_DOMAIN}`,
  email: "referral-owner-a@fixture.test",
  name: "Anneliese Kowalczyk-Dubois",
  practice: "Kowalczyk Dubois Wellness",
  code: "REFOWNRA",
};
const B = {
  slug: "refprobeb",
  host: `refprobeb.${PLATFORM_DOMAIN}`,
  email: "referral-owner-b@fixture.test",
  name: "Bartholomew Nakashima-Reyes",
  practice: "Nakashima Reyes Counsel",
  code: "REFOWNRB",
};

// A's fan-out: 3 prospects on A's code, exactly one converted.
const FANOUT = [
  { email: "referral-fan-1@fixture.test", name: "Fiona Featherstone-Marsh", status: "LEAD" as const, code: "FANONEAA" },
  { email: "referral-fan-2@fixture.test", name: "Gustavo Quintanilla", status: "LEAD" as const, code: "FANTWOAA" },
  { email: "referral-fan-3@fixture.test", name: "Helena Vasquez-Ortiz", status: "SIGNED_UP" as const, code: "FANTHRAA" },
];
// B's fan-out: exactly one, so A's page and B's page can never be confused.
const B_FAN = { email: "referral-fanb-1@fixture.test", name: "Ignatius Blackwood-Reyes", status: "LEAD" as const, code: "FANONEBB" };

// Self-referral probes.
const SELF_JOIN = { email: "referral-self-join@fixture.test", code: "SELFJOIN" };
const SELF_SIGNUP = { email: "referral-self-signup@fixture.test", code: "SELFSGNP", slug: "refprobeself" };
// First-touch probe (its codes deliberately resolve to nobody — this item is
// about which STORED value survives).
const FIRST = { email: "referral-first@fixture.test", slug: "refprobefirst", first: "FIRSTTCH", second: "SECONDTC" };
// Unresolvable-code signup probe.
const UNKNOWN = { email: "referral-unknown@fixture.test", slug: "refprobeunk", code: "ZZZZZZZZ" };
const MALFORMED = "!!not a code!!";

const PROBE_EMAILS = [
  ADMIN_EMAIL, STRANGER_EMAIL, A.email, B.email,
  ...FANOUT.map((f) => f.email), B_FAN.email,
  SELF_JOIN.email, SELF_SIGNUP.email, FIRST.email, UNKNOWN.email,
];
const PROBE_SLUGS = [A.slug, B.slug, SELF_SIGNUP.slug, FIRST.slug, UNKNOWN.slug];

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function dropTenant(slug: string) {
  if (!slug) return;
  const t = await prisma.tenant.findFirst({ where: { slug } }).catch(() => null);
  if (!t) return;
  await prisma.auditEvent.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
}

async function cleanup() {
  const rows = await prisma.practitionerProspect
    .findMany({ where: { email: { in: PROBE_EMAILS } }, select: { id: true, tenantId: true } })
    .catch(() => [] as { id: string; tenantId: string | null }[]);
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } }).catch(() => {});
  }
  for (const slug of PROBE_SLUGS) await dropTenant(slug);
  for (const email of PROBE_EMAILS) {
    const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (u?.tenantId && u.tenantId !== DEFAULT_TENANT_ID) {
      const t = await prisma.tenant.findUnique({ where: { id: u.tenantId } }).catch(() => null);
      await dropTenant(t?.slug ?? "");
    }
  }
  await prisma.user.deleteMany({ where: { email: { in: PROBE_EMAILS } } }).catch(() => {});
  await prisma.practitionerProspect.deleteMany({ where: { email: { in: PROBE_EMAILS } } }).catch(() => {});
}

// ---- browser helpers (the shapes audits/{signup,capture}/verify.ts use) ----

async function joinSubmit(
  browser: Browser,
  ip: string,
  path: string,
  f: { name: string; email: string },
): Promise<{ url: string; body: string; ctx: BrowserContext }> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800); // the action's time-trap
  await page.fill('input[name="name"]', f.name);
  await page.fill('input[name="email"]', f.email);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
  return { url: page.url(), body: (await page.textContent("body")) ?? "", ctx };
}

async function signupSubmit(
  browser: Browser,
  ip: string,
  path: string,
  f: { name: string; practiceName: string; email: string; password: string; slug: string },
): Promise<{ url: string; body: string; ctx: BrowserContext }> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.fill('input[name="name"]', f.name);
  await page.fill('input[name="practiceName"]', f.practiceName);
  await page.fill('input[name="email"]', f.email);
  await page.fill('input[name="password"]', f.password);
  await page.fill('input[name="slug"]', "");
  await page.fill('input[name="slug"]', f.slug);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(4000); // provisioning
  return { url: page.url(), body: (await page.textContent("body")) ?? "", ctx };
}

async function signIn(email: string, password: string, host: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => {
    for (const c of sc) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": host } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "x-forwarded-host": host,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

/** Rendered COPY only — React's flight payload legitimately contains
 *  "$10"-style chunk references, so scripts and tags come out first. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// Verify item 7 — the money-language scanner from audits/capture/verify.ts,
// EXTENDED with the reward vocabulary this build is forbidden to use. Jacob
// ratified a finished portal plus founding-partner recognition: no discount,
// no promised reward. If a word here appears, the copy is inventing a
// commercial term he has not signed.
const MONEY = [
  // inherited from C23-CAPTURE / C23-SIGNUP
  /\$\s?\d/, /\bUSD\b/, /\bfree\b/i, /\bgratis\b/i, /\bsin costo\b/i, /\bper month\b/i, /\/mo\b/, /\bal mes\b/i,
  // C23-REFERRAL §Verify 7 — the reward vocabulary, EN
  /\bearn(s|ed|ing)?\b/i, /\breward(s|ed|ing)?\b/i, /\bcommission(s)?\b/i, /\bbonus(es)?\b/i,
  /\bdiscount(s|ed)?\b/i, /\bcredit(s|ed)?\b/i,
  // …and ES, because a Spanish catalog must not say what the English one may not
  /\bgana(r|s|n)?\b/i, /\brecompensa(s)?\b/i, /\bcomisi[oó]n(es)?\b/i, /\bbono(s)?\b/i,
  /\bdescuento(s)?\b/i, /\bcr[eé]dito(s)?\b/i,
];
function moneyHit(text: string): RegExp | undefined {
  return MONEY.find((re) => re.test(text));
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await cleanup();

  console.log(`~ starting built app on :${PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(PORT),
    PLATFORM_DOMAIN,
    AUTH_TRUST_HOST: "true",
    PLATFORM_ADMIN_EMAILS: ADMIN_EMAIL,
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
  const browser = await chromium.launch({ executablePath: EXEC });

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const hash = await bcrypt.hash(PASSWORD, 10);

    // ---- fixtures: two tenants, each with a practitioner who owns a code ----
    for (const t of [A, B]) {
      const tenant = await prisma.tenant.create({
        data: {
          slug: t.slug,
          displayName: t.practice,
          status: "ACTIVE",
          layoutKey: "journey-v1",
          skinKey: "warm-clay",
          branding: { portalTitle: t.practice },
        },
      });
      await prisma.tenantBilling.create({
        data: { tenantId: tenant.id, plan: "FOUNDING_COMP", status: "ACTIVE" },
      });
      await prisma.user.create({
        data: {
          email: t.email, name: t.name, role: "PRACTITIONER", active: true,
          passwordHash: hash, mustChangePassword: false, tenantId: tenant.id,
        },
      });
      await prisma.practitionerProspect.create({
        data: {
          name: t.name, email: t.email, practiceName: t.practice,
          status: "SIGNED_UP", source: "web", referralCode: t.code,
          tenantId: tenant.id, convertedAt: new Date(),
        },
      });
    }
    // Two throwaway practitioners on the DEFAULT tenant for the admin gate.
    for (const [email, name] of [[ADMIN_EMAIL, "Referral Admin"], [STRANGER_EMAIL, "Referral Stranger"]] as const) {
      await prisma.user.create({
        data: {
          email, name, role: "PRACTITIONER", active: true,
          passwordHash: hash, mustChangePassword: false, tenantId: DEFAULT_TENANT_ID,
        },
      });
    }
    // The fan-outs.
    for (const f of FANOUT) {
      await prisma.practitionerProspect.create({
        data: {
          name: f.name, email: f.email, status: f.status, source: "event-sept23",
          referralCode: f.code, referredByCode: A.code,
          ...(f.status === "SIGNED_UP" ? { convertedAt: new Date() } : {}),
        },
      });
    }
    await prisma.practitionerProspect.create({
      data: {
        name: B_FAN.name, email: B_FAN.email, status: B_FAN.status, source: "event-sept23",
        referralCode: B_FAN.code, referredByCode: B.code,
      },
    });

    // ---- 1. a code resolves to its owner; counts split LEAD vs SIGNED_UP ----
    const { resolveReferralCode, referralCounts, listReferred } = await import("../../lib/referrals");
    const owner = await resolveReferralCode(A.code);
    const ownerRow = await prisma.practitionerProspect.findUnique({ where: { email: A.email } });
    check("a code resolves to its owning prospect", owner?.id === ownerRow?.id, `${owner?.referralCode} → ${owner?.id === ownerRow?.id ? "owner" : "MISMATCH"}`);
    check("the resolver returns NO identity (id + code + status only)",
      owner !== null && Object.keys(owner).sort().join(",") === "id,referralCode,status",
      owner ? Object.keys(owner).sort().join(",") : "null");
    check("a lowercase code still resolves", (await resolveReferralCode(A.code.toLowerCase()))?.id === ownerRow?.id);
    const counts = await referralCounts(A.code);
    check("counts split LEAD vs SIGNED_UP across the fan-out",
      counts.total === 3 && counts.leads === 2 && counts.signedUp === 1,
      `total ${counts.total} / leads ${counts.leads} / signedUp ${counts.signedUp}`);
    const listed = await listReferred(A.code);
    check("the owner's list carries FIRST NAMES ONLY",
      listed.length === 3 && listed.every((p) => !p.firstName.includes(" ") && !p.firstName.includes("-")),
      listed.map((p) => p.firstName).join(","));
    check("an unknown code counts to zero, not an error", (await referralCounts("ZZZZZZZZ")).total === 0);
    check("a malformed code counts to zero, not an error", (await referralCounts(MALFORMED)).total === 0);

    // ---- 2. the invited-by line, both locales, both surfaces, no identity ----
    const SECRETS = [A.name, A.email, A.practice, "Kowalczyk", "Dubois"];
    for (const [surface, path, marker] of [
      ["/join en", `/join?ref=${A.code}`, "Invited by a founding partner"],
      ["/join es", `/join?ref=${A.code}&lang=es`, "Te invitó un socio fundador"],
      ["/signup en", `/signup?ref=${A.code}`, "Invited by a founding partner"],
      ["/signup es", `/signup?ref=${A.code}&lang=es`, "Te invitó un socio fundador"],
    ] as const) {
      const res = await fetch(`${BASE}${path}`);
      const html = await res.text();
      check(`${surface} shows the invited-by line`, res.status === 200 && html.includes(marker), `status ${res.status}`);
      const leaked = SECRETS.filter((s) => html.includes(s));
      check(`${surface} never shows the referrer's name, email or practice`, leaked.length === 0, leaked.join(", ") || "nothing leaked");
    }

    // ---- 3. unknown + malformed codes: no line, no error ----
    for (const [label, qs] of [
      ["unknown", `ref=ZZZZZZZZ`],
      ["malformed", `ref=${encodeURIComponent(MALFORMED)}`],
    ] as const) {
      for (const surface of ["/join", "/signup"] as const) {
        const res = await fetch(`${BASE}${surface}?${qs}`);
        const html = await res.text();
        check(`${surface} with an ${label} code renders no invited-by line`,
          res.status === 200 && !html.includes("Invited by a founding partner"), `status ${res.status}`);
        // `role="alert"` is the error banner on both screens — its absence is
        // the assertion that the visitor is never told they arrived wrongly.
        check(`${surface} with an ${label} code shows no error`,
          res.status === 200 && !/role="alert"/.test(html), `status ${res.status}, no alert region`);
      }
    }
    // …and a real signup carrying an unresolvable code still completes.
    const unk = await signupSubmit(browser, "203.0.114.10", `/signup?ref=${UNKNOWN.code}`, {
      name: "Probe Unknown Code", practiceName: "Unknown Code Practice",
      email: UNKNOWN.email, password: PASSWORD, slug: UNKNOWN.slug,
    });
    const unkRow = await prisma.practitionerProspect.findUnique({ where: { email: UNKNOWN.email } });
    check("a signup carrying an unresolvable code still completes",
      unkRow?.status === "SIGNED_UP" && Boolean(unkRow?.tenantId), `status ${unkRow?.status} / tenant ${unkRow?.tenantId ? "created" : "MISSING"}`);
    check("the unresolvable code is stored verbatim and attributes to nobody",
      unkRow?.referredByCode === UNKNOWN.code && (await referralCounts(UNKNOWN.code)).total === 1 &&
        (await resolveReferralCode(UNKNOWN.code)) === null,
      `stored ${unkRow?.referredByCode}, resolves to ${(await resolveReferralCode(UNKNOWN.code)) === null ? "nobody" : "SOMEONE"}`);
    await unk.ctx.close();

    // ---- 4. self-referral refused at BOTH surfaces ----
    await prisma.practitionerProspect.create({
      data: { name: "Probe Self Join", email: SELF_JOIN.email, status: "LEAD", source: "web", referralCode: SELF_JOIN.code },
    });
    const selfJoin = await joinSubmit(browser, "203.0.114.20", `/join?ref=${SELF_JOIN.code}`, {
      name: "Probe Self Join", email: SELF_JOIN.email,
    });
    const selfJoinRow = await prisma.practitionerProspect.findUnique({ where: { email: SELF_JOIN.email } });
    check("/join accepts the submission (a self-referral is never an error the visitor reads)",
      /\/join\/thanks/.test(selfJoin.url), selfJoin.url.replace(BASE, ""));
    check("/join self-referral attributes to nobody", selfJoinRow?.referredByCode === null, String(selfJoinRow?.referredByCode));
    await selfJoin.ctx.close();

    await prisma.practitionerProspect.create({
      data: { name: "Probe Self Signup", email: SELF_SIGNUP.email, status: "LEAD", source: "web", referralCode: SELF_SIGNUP.code },
    });
    const selfSignup = await signupSubmit(browser, "203.0.114.21", `/signup?ref=${SELF_SIGNUP.code}`, {
      name: "Probe Self Signup", practiceName: "Self Signup Practice",
      email: SELF_SIGNUP.email, password: PASSWORD, slug: SELF_SIGNUP.slug,
    });
    const selfSignupRow = await prisma.practitionerProspect.findUnique({ where: { email: SELF_SIGNUP.email } });
    check("/signup completes for a self-referral", selfSignupRow?.status === "SIGNED_UP", `status ${selfSignupRow?.status}`);
    check("/signup self-referral attributes to nobody", selfSignupRow?.referredByCode === null, String(selfSignupRow?.referredByCode));
    await selfSignup.ctx.close();

    const allRows = await prisma.practitionerProspect.findMany({ select: { referralCode: true, referredByCode: true } });
    const selfish = allRows.filter(
      (r) => r.referredByCode && r.referredByCode.trim().toUpperCase() === r.referralCode.trim().toUpperCase(),
    );
    check("no self-referential row survives anywhere in the ledger", selfish.length === 0, `${selfish.length} of ${allRows.length} rows`);

    // ---- 5. first touch is immutable ----
    const firstJoin = await joinSubmit(browser, "203.0.114.30", `/join?ref=${FIRST.first}`, {
      name: "Probe First Touch", email: FIRST.email,
    });
    const afterJoin = await prisma.practitionerProspect.findUnique({ where: { email: FIRST.email } });
    await firstJoin.ctx.close();
    check("the first ?ref= is stored", afterJoin?.referredByCode === FIRST.first, String(afterJoin?.referredByCode));
    const secondSignup = await signupSubmit(browser, "203.0.114.31", `/signup?ref=${FIRST.second}`, {
      name: "Probe First Touch", practiceName: "First Touch Practice",
      email: FIRST.email, password: PASSWORD, slug: FIRST.slug,
    });
    const afterSignup = await prisma.practitionerProspect.findUnique({ where: { email: FIRST.email } });
    check("a second ?ref= through /signup never overwrites the first",
      afterSignup?.referredByCode === FIRST.first, `${FIRST.first} → ${afterSignup?.referredByCode}`);
    check("the signup itself still completed", afterSignup?.status === "SIGNED_UP" && Boolean(afterSignup?.tenantId),
      `status ${afterSignup?.status}`);
    await secondSignup.ctx.close();

    // ---- 6. /practitioner/referrals ----
    const cookieA = await signIn(A.email, PASSWORD, A.host);
    const cookieB = await signIn(B.email, PASSWORD, B.host);
    const pageOf = async (cookie: string, host: string, qs = "") => {
      const res = await fetch(`${BASE}/practitioner/referrals${qs}`, {
        headers: { Cookie: cookie, "x-forwarded-host": host },
        redirect: "manual",
      });
      return { status: res.status, html: res.status === 200 ? await res.text() : "" };
    };
    const pa = await pageOf(cookieA, A.host);
    check("/practitioner/referrals renders for a signed-in practitioner", pa.status === 200, `status ${pa.status}`);
    check("it shows their OWN code", pa.html.includes(A.code), A.code);
    const paText = visibleText(pa.html);
    check("it shows the counts derived from the fan-out", /3\s*Arrived on your code/.test(paText) && /1\s*Became practices/.test(paText),
      (paText.match(/\d+ Arrived on your code/) ?? ["none"])[0] + " / " + (paText.match(/\d+ Became practices/) ?? ["none"])[0]);
    check("it shows the referred people's FIRST names", ["Fiona", "Gustavo", "Helena"].every((n) => pa.html.includes(n)));
    const surnames = ["Featherstone-Marsh", "Quintanilla", "Vasquez-Ortiz", ...FANOUT.map((f) => f.email)];
    const leakedNames = surnames.filter((s) => pa.html.includes(s));
    check("it shows NO surnames and NO emails of referred prospects", leakedNames.length === 0, leakedNames.join(", ") || "nothing leaked");
    check("it shows their founding-partner standing", pa.html.includes("Founding partner"));
    // bilingual
    const paEs = await pageOf(cookieA, A.host, "?lang=es");
    check("/practitioner/referrals renders in Spanish", paEs.status === 200 && paEs.html.includes("Tu código de referencia"),
      `status ${paEs.status}`);
    check("the Spanish page shows the same code and counts",
      paEs.html.includes(A.code) && /3\s*Llegaron con tu código/.test(visibleText(paEs.html)));
    // honest zero state — B's own fan-out is 1, so use a third practitioner
    // with a code nobody used: the one created by the unresolvable-code signup.
    const cookieUnk = await signIn(UNKNOWN.email, PASSWORD, `${UNKNOWN.slug}.${PLATFORM_DOMAIN}`);
    const pz = await pageOf(cookieUnk, `${UNKNOWN.slug}.${PLATFORM_DOMAIN}`);
    check("an honest zero state renders (no fabricated milestone, no progress bar)",
      pz.status === 200 && pz.html.includes("Nobody yet") && !/progress/i.test(visibleText(pz.html)),
      `status ${pz.status}`);
    // signed out
    const anon = await fetch(`${BASE}/practitioner/referrals`, { redirect: "manual", headers: { "x-forwarded-host": A.host } });
    check("/practitioner/referrals does not render for a signed-out visitor",
      anon.status !== 200 && (anon.headers.get("location") ?? "").includes("/login"),
      `status ${anon.status} → ${anon.headers.get("location") ?? "-"}`);
    // CROSS-TENANT ISOLATION
    const pb = await pageOf(cookieB, B.host);
    check("practitioner B sees their OWN code and counts", pb.status === 200 && pb.html.includes(B.code) && /1\s*Arrived on your code/.test(visibleText(pb.html)),
      `status ${pb.status}`);
    check("practitioner A never sees B's code or B's referred people",
      !pa.html.includes(B.code) && !pa.html.includes("Ignatius") && !pa.html.includes(B_FAN.email));
    check("practitioner B never sees A's code or A's referred people",
      !pb.html.includes(A.code) && !["Fiona", "Gustavo", "Helena"].some((n) => pb.html.includes(n)));
    const crossedRes = await fetch(`${BASE}/practitioner/referrals`, {
      headers: { Cookie: cookieA, "x-forwarded-host": B.host },
      redirect: "manual",
    });
    const crossedBody = crossedRes.status === 200 ? await crossedRes.text() : "";
    check("A's session on B's host does not render referral data at all",
      crossedRes.status !== 200 && !crossedBody.includes(A.code) && !crossedBody.includes(B.code),
      `status ${crossedRes.status} → ${crossedRes.headers.get("location") ?? "-"}`);

    // ---- 7. no reward / price / earning language ----
    const surfaces: [string, string, string][] = [
      ["/join en", `/join?ref=${A.code}`, ""],
      ["/join es", `/join?ref=${A.code}&lang=es`, ""],
      ["/signup en", `/signup?ref=${A.code}`, ""],
      ["/signup es", `/signup?ref=${A.code}&lang=es`, ""],
    ];
    for (const [label, path] of surfaces) {
      const html = await (await fetch(`${BASE}${path}`)).text();
      const hit = moneyHit(visibleText(html));
      check(`${label} carries no reward, price or earning language`, !hit, hit ? `matched ${hit}` : "");
    }
    for (const [label, html] of [
      ["/practitioner/referrals en", pa.html],
      ["/practitioner/referrals es", paEs.html],
      ["/practitioner/referrals zero state", pz.html],
    ] as const) {
      const hit = moneyHit(visibleText(html));
      check(`${label} carries no reward, price or earning language`, !hit, hit ? `matched ${hit}` : "");
    }
    for (const ns of ["referral", "capture", "signup"] as const) {
      for (const locale of ["en", "es"] as const) {
        const raw = JSON.stringify((await import(`../../messages/${locale}/${ns}.json`)).default);
        const hit = moneyHit(raw);
        check(`messages/${locale}/${ns}.json carries no reward, price or earning language`, !hit, hit ? `matched ${hit}` : "");
      }
    }

    // ---- 8. admin top-referrers ----
    const adminCookie = await signIn(ADMIN_EMAIL, PASSWORD, "localhost");
    const strangerCookie = await signIn(STRANGER_EMAIL, PASSWORD, "localhost");
    const adminRes = await fetch(`${BASE}/admin/prospects`, { headers: { Cookie: adminCookie } });
    const adminHtml = await adminRes.text();
    check("the admin top-referrers view renders for an allowlisted email",
      adminRes.status === 200 && adminHtml.includes("Top referrers"), `status ${adminRes.status}`);
    const adminText = visibleText(adminHtml);
    // The fan-out row: code · owner · 3 referred · 1 conversion.
    const rowRe = new RegExp(`${A.code}\\s+${A.name}\\s+${A.email.replace(/[.]/g, "\\.")}\\s+3\\s+1`);
    check("its counts match the seeded fan-out (3 referred, 1 conversion)", rowRe.test(adminText),
      (adminText.match(new RegExp(`${A.code}[^A-Z]{0,120}`)) ?? ["not found"])[0].trim());
    check("B's single referral is listed separately", new RegExp(`${B.code}\\s+${B.name}[^0-9]*1\\s+0`).test(adminText),
      (adminText.match(new RegExp(`${B.code}[^A-Z]{0,120}`)) ?? ["not found"])[0].trim());
    const strangerRes = await fetch(`${BASE}/admin/prospects`, { headers: { Cookie: strangerCookie } });
    check("the admin top-referrers view 404s for a non-allowlisted signed-in practitioner",
      strangerRes.status === 404, `status ${strangerRes.status}`);
    const csv = await (await fetch(`${BASE}/admin/prospects/export?source=event-sept23`, { headers: { Cookie: adminCookie } })).text();
    check("referredByCode is in the CSV export", csv.includes("referredByCode") && csv.includes(A.code), "header + value present");

    // ---- 9. the attribution AuditEvent is metadata only ----
    const firstRow = await prisma.practitionerProspect.findUnique({ where: { email: FIRST.email } });
    const captureAudit = await prisma.auditEvent.findFirst({
      where: { action: "prospect-capture", actorId: firstRow!.id },
    });
    check("the capture AuditEvent records the attribution",
      ((captureAudit?.meta ?? {}) as Record<string, unknown>).referredByCode === FIRST.first,
      String(((captureAudit?.meta ?? {}) as Record<string, unknown>).referredByCode));
    const signupAudit = await prisma.auditEvent.findFirst({
      where: { action: "practitioner-signup", tenantId: firstRow!.tenantId ?? undefined },
    });
    check("the signup AuditEvent records the attribution",
      ((signupAudit?.meta ?? {}) as Record<string, unknown>).referredByCode === FIRST.first,
      String(((signupAudit?.meta ?? {}) as Record<string, unknown>).referredByCode));
    const blob = JSON.stringify([captureAudit, signupAudit]);
    check("attribution AuditEvents are metadata only",
      !blob.includes(FIRST.email) && !blob.includes("Probe First Touch") && !blob.includes(PASSWORD),
      "no email, name or password material in meta");
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    await cleanup();
    console.log("~ probe tenants, practitioners and prospects removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nREFERRAL VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none */ }
  });
