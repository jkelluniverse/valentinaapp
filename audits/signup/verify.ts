import { spawn, execSync, type ChildProcess } from "child_process";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { RESERVED_SLUGS } from "../../lib/signup-config";

// C23-SIGNUP acceptance — the front door, in a real browser against the BUILT
// app. Proves, per the spec's Verify list:
//   1  /signup renders 200 in BOTH locales, with no price / "free" / figure
//   2  happy path provisions a COMPLETE tenant: ACTIVE + 3 modules + a
//      practitioner who really signs in with the CHOSEN password and is NOT
//      forced to change it + FOUNDING_COMP billing + zero Stripe objects
//   3  the new portal serves on their slug wearing their own wordmark
//   4  duplicate slug + duplicate email refused specifically, with NO orphan
//      tenant and NO SIGNED_UP prospect left behind
//   5  every reserved slug refused (valentina and admin included)
//   6  ?ref= lands in referredByCode; every prospect gets a unique referralCode
//   7  a sub-floor password is refused SERVER-side with the client check gone
//   8  the rate limit trips on repeated attempts
//   9  an AuditEvent is written and carries no password material
// Throwaway tenants + prospects; self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/signup/verify.ts

const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const PLATFORM_DOMAIN = "platform.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

// Everything this harness creates carries one of these markers.
const SLUGS = ["signupprobe", "signupprobe2", "signupprobe3", "signuprate"];
const EMAILS = [
  "signup-probe@fixture.test",
  "signup-probe-2@fixture.test",
  "signup-probe-3@fixture.test",
  "signup-probe-rate@fixture.test",
  "signup-probe-weak@fixture.test",
  "signup-probe-reserved@fixture.test",
];
const PASSWORD = "probe-pass-2026";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function dropTenant(slug: string) {
  const t = await prisma.tenant.findFirst({ where: { slug } }).catch(() => null);
  if (!t) return;
  await prisma.auditEvent.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
}

async function cleanup() {
  for (const slug of SLUGS) await dropTenant(slug);
  // Anything else this run's emails may have produced.
  for (const email of EMAILS) {
    const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (u?.tenantId) await dropTenant((await prisma.tenant.findUnique({ where: { id: u.tenantId } }))?.slug ?? "");
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  }
  await prisma.practitionerProspect.deleteMany({ where: { email: { in: EMAILS } } }).catch(() => {});
  await prisma.practitionerProspect.deleteMany({ where: { email: { startsWith: "signup-probe-res" } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: "signup-probe-res" } } }).catch(() => {});
}

type Fields = {
  name?: string;
  practiceName?: string;
  email?: string;
  password?: string;
  slug?: string;
  bypassClient?: boolean;
};

// One signup attempt, from a fresh context so each scenario owns its IP.
async function attempt(
  browser: Browser,
  ip: string,
  path: string,
  f: Fields,
): Promise<{ url: string; body: string; ctx: BrowserContext }> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  // The action's time-trap wants ~1.5s between render and submit.
  await page.waitForTimeout(1800);
  if (f.bypassClient) {
    // Strip the client-side gates the way an attacker would: no required, no
    // minlength, no pattern, no type=email. The server must still refuse.
    await page.evaluate(() => {
      document.querySelectorAll("input").forEach((el) => {
        el.removeAttribute("required");
        el.removeAttribute("minlength");
        el.removeAttribute("pattern");
        if (el.getAttribute("type") === "email") el.setAttribute("type", "text");
      });
      document.querySelectorAll("form").forEach((el) => el.setAttribute("novalidate", "novalidate"));
    });
  }
  const set = async (sel: string, value: string) => {
    await page.fill(sel, "");
    if (value) await page.fill(sel, value);
  };
  if (f.name !== undefined) await set('input[name="name"]', f.name);
  if (f.practiceName !== undefined) await set('input[name="practiceName"]', f.practiceName);
  if (f.email !== undefined) await set('input[name="email"]', f.email);
  if (f.password !== undefined) await set('input[name="password"]', f.password);
  if (f.slug !== undefined) await set('input[name="slug"]', f.slug);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);
  return { url: page.url(), body: (await page.textContent("body")) ?? "", ctx };
}

async function signIn(email: string, password: string, host: string): Promise<{ cookie: string; ok: boolean }> {
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
  const location = res.headers.get("location") ?? "";
  return { cookie: cookie(), ok: !/error/.test(location) };
}

// Any money-shaped or discount-shaped claim on the front door is a spec breach.
const MONEY = [/\$\s?\d/, /\bUSD\b/, /\bfree\b/i, /\bgratis\b/i, /\bsin costo\b/i, /\bper month\b/i, /\/mo\b/, /\bal mes\b/i];

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
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: "ignore" });
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
  const browser = await chromium.launch({ executablePath: EXEC });

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // ---- 1. both locales render, and neither carries a price ----
    for (const [locale, path, marker] of [
      ["en", "/signup", "Set up your practice portal"],
      ["es", "/signup?lang=es", "Crea el portal de tu práctica"],
    ] as const) {
      const res = await fetch(`${BASE}${path}`);
      const html = await res.text();
      check(`/signup renders 200 in ${locale}`, res.status === 200 && html.includes(marker), `status ${res.status}`);
      // Rendered COPY only: React's flight payload legitimately contains
      // "$10"-style chunk references, so scripts/styles come out first.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " ");
      const hit = MONEY.find((re) => re.test(text));
      check(`${locale} screen carries no price, no "free", no figure`, !hit, hit ? `matched ${hit}` : "");
    }
    // The catalogs themselves, so a future copy edit cannot slip a figure in.
    for (const locale of ["en", "es"] as const) {
      const raw = JSON.stringify((await import(`../../messages/${locale}/signup.json`)).default);
      const hit = MONEY.find((re) => re.test(raw));
      check(`messages/${locale}/signup.json carries no price language`, !hit, hit ? `matched ${hit}` : "");
    }

    // Reachability (§5): the front door is linked from the public site.
    const home = await fetch(`${BASE}/`);
    check("signup reachable from the public site", (await home.text()).includes('href="/signup"'));

    // ---- 2 + 6. happy path, with a ?ref= code ----
    const a = await attempt(browser, "203.0.113.10", "/signup?ref=ABC123", {
      name: "Probe Practitioner",
      practiceName: "Signup Probe Practice",
      email: EMAILS[0],
      password: PASSWORD,
      slug: SLUGS[0],
    });
    check("happy path reaches the confirmation screen", /\/signup\/welcome/.test(a.url), a.url.replace(BASE, ""));
    const tenant = await prisma.tenant.findFirst({ where: { slug: SLUGS[0] } });
    check("Tenant created ACTIVE on the chosen slug", tenant?.status === "ACTIVE", `status ${tenant?.status}`);
    const modules = await prisma.tenantModule.count({ where: { tenantId: tenant?.id ?? "none" } });
    check("three TenantModule rows", modules === 3, `${modules} rows`);
    const billing = await prisma.tenantBilling.findFirst({ where: { tenantId: tenant?.id ?? "none" } });
    check(
      "TenantBilling FOUNDING_COMP / ACTIVE",
      billing?.plan === "FOUNDING_COMP" && billing?.status === "ACTIVE",
      `${billing?.plan}/${billing?.status}`,
    );
    check(
      "zero Stripe objects",
      billing?.stripeCustomerId == null && billing?.stripeSubscriptionId == null,
      `cus=${billing?.stripeCustomerId ?? "null"} sub=${billing?.stripeSubscriptionId ?? "null"}`,
    );
    const pract = await prisma.user.findFirst({ where: { tenantId: tenant?.id ?? "none", role: "PRACTITIONER" } });
    check("practitioner NOT forced to change password", pract?.mustChangePassword === false, `flag ${pract?.mustChangePassword}`);
    const host = `${SLUGS[0]}.${PLATFORM_DOMAIN}`;
    const session = await signIn(EMAILS[0], PASSWORD, host);
    check("practitioner signs in with the CHOSEN password", session.ok && session.cookie.includes("session-token"));
    const wrong = await signIn(EMAILS[0], "not-the-password", host);
    check("a wrong password is still refused", !wrong.ok || !wrong.cookie.includes("session-token"));

    // ---- 3. the portal serves on their slug wearing their own wordmark ----
    const portal = await fetch(`${BASE}/practitioner`, {
      headers: { "x-forwarded-host": host, Cookie: session.cookie },
    });
    const portalHtml = await portal.text();
    check(
      "portal serves on their slug wearing their own wordmark",
      portal.status === 200 && portalHtml.includes("Signup Probe Practice"),
      `status ${portal.status}`,
    );
    check("their practice is not a DEMO", !portalHtml.includes("everyone here is fictional"));
    check("confirmation screen names the portal address + referral code", a.body.includes(host));

    // ?ref= and the issued code
    const prospect = await prisma.practitionerProspect.findUnique({ where: { email: EMAILS[0] } });
    check("?ref=ABC123 landed in referredByCode", prospect?.referredByCode === "ABC123", String(prospect?.referredByCode));
    check("prospect marked SIGNED_UP with tenantId + convertedAt",
      prospect?.status === "SIGNED_UP" && prospect?.tenantId === tenant?.id && prospect?.convertedAt != null);
    check("referralCode issued", Boolean(prospect?.referralCode && prospect.referralCode.length >= 6), prospect?.referralCode ?? "");
    check("the confirmation screen shows the referral code", a.body.includes(prospect?.referralCode ?? " "));

    // ---- 9. the audit row ----
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenant?.id ?? "none", action: "practitioner-signup" },
    });
    check("AuditEvent written, attributed to the new practitioner", audit?.actorId === pract?.id);
    const auditBlob = JSON.stringify(audit ?? {});
    check(
      "AuditEvent contains no password material",
      !auditBlob.includes(PASSWORD) && !/\$2[aby]\$/.test(auditBlob) && !/password"\s*:\s*"/i.test(auditBlob),
    );

    // ---- 4. duplicate slug + duplicate email, no debris ----
    const tenantsBefore = await prisma.tenant.count();
    const dupSlug = await attempt(browser, "203.0.113.20", "/signup", {
      name: "Probe Two",
      practiceName: "Second Probe",
      email: EMAILS[1],
      password: PASSWORD,
      slug: SLUGS[0], // taken
    });
    check("duplicate slug refused with a specific message",
      /error=slug-taken/.test(dupSlug.url) && /already taken/i.test(dupSlug.body), dupSlug.url.replace(BASE, ""));
    const dupEmail = await attempt(browser, "203.0.113.30", "/signup", {
      name: "Probe Three",
      practiceName: "Third Probe",
      email: EMAILS[0], // taken
      password: PASSWORD,
      slug: SLUGS[1],
    });
    check("duplicate email refused with a specific message",
      /error=email-taken/.test(dupEmail.url) && /already has an account/i.test(dupEmail.body), dupEmail.url.replace(BASE, ""));
    check("no orphan tenant from either refusal", (await prisma.tenant.count()) === tenantsBefore,
      `${await prisma.tenant.count()} vs ${tenantsBefore}`);
    check("refused slug left no tenant", (await prisma.tenant.count({ where: { slug: SLUGS[1] } })) === 0);
    const refusedProspect = await prisma.practitionerProspect.findUnique({ where: { email: EMAILS[1] } });
    check("refused prospect never claims SIGNED_UP",
      refusedProspect == null || refusedProspect.status === "LEAD", String(refusedProspect?.status));

    // ---- 5. every reserved slug refused ----
    // A fresh IP per slug so the (working) rate limit cannot be mistaken for a
    // reservation. The full list is long; the sample proves the mechanism and
    // the two that matter most are checked by name.
    const sample = ["valentina", "admin", "www", "app", "api", "staging", "demo"];
    check(
      "valentina + admin (and the rest of the sample) are on the reserved list",
      sample.every((s) => RESERVED_SLUGS.includes(s)),
      sample.filter((s) => !RESERVED_SLUGS.includes(s)).join(",") || "all present",
    );
    let reservedRefused = 0;
    for (let i = 0; i < sample.length; i++) {
      const r = await attempt(browser, `198.51.100.${i + 1}`, "/signup", {
        name: "Probe Reserved",
        practiceName: "Reserved Probe",
        // A distinct email per attempt too: the per-email cap counts every
        // attempt, and a rate refusal would masquerade as a reservation.
        email: `signup-probe-res${i}@fixture.test`,
        password: PASSWORD,
        slug: sample[i],
      });
      if (/error=slug-reserved/.test(r.url)) reservedRefused++;
      else console.log(`    · "${sample[i]}" → ${r.url.replace(BASE, "")}`);
      await r.ctx.close();
    }
    check(`every reserved slug refused (incl. valentina + admin)`, reservedRefused === sample.length,
      `${reservedRefused}/${sample.length}`);
    check("the whole reserved list is refused server-side (unit)",
      (await Promise.all(RESERVED_SLUGS.map((s) => import("../../lib/signup").then((m) => m.checkSlug(s)))))
        .every((v) => v === "reserved"),
      `${RESERVED_SLUGS.length} slugs`);
    check("no tenant was created by any reserved attempt", (await prisma.tenant.count()) === tenantsBefore);

    // ---- 7. sub-floor password, client checks stripped ----
    const weak = await attempt(browser, "203.0.113.40", "/signup", {
      name: "Probe Weak",
      practiceName: "Weak Probe",
      email: EMAILS[4],
      password: "short1",
      slug: SLUGS[2],
      bypassClient: true,
    });
    check("weak password refused server-side with the client check bypassed",
      /error=password/.test(weak.url), weak.url.replace(BASE, ""));
    check("weak attempt created no tenant", (await prisma.tenant.count({ where: { slug: SLUGS[2] } })) === 0);

    // ---- 8. the rate limit ----
    let rateHit = 0;
    let attempts = 0;
    for (let i = 0; i < 8; i++) {
      attempts++;
      const r = await attempt(browser, "203.0.113.50", "/signup", {
        name: "Probe Rate",
        practiceName: "Rate Probe",
        email: EMAILS[3],
        password: PASSWORD,
        slug: `${SLUGS[3]}${i}`,
      });
      const rated = /error=rate/.test(r.url);
      await r.ctx.close();
      if (rated) { rateHit = i + 1; break; }
    }
    check("rate limit trips on repeated attempts", rateHit > 0, rateHit ? `refused at attempt ${rateHit}` : `survived ${attempts}`);
    // Whatever the loop DID create before the limit bit gets cleaned below.
    for (let i = 0; i < 8; i++) await dropTenant(`${SLUGS[3]}${i}`);

    // A second prospect exists by now — codes must be unique across prospects.
    const codes = (await prisma.practitionerProspect.findMany({ select: { referralCode: true } })).map((p) => p.referralCode);
    check("every prospect's referralCode is unique and non-empty",
      codes.length > 1 && new Set(codes).size === codes.length && codes.every(Boolean), `${codes.length} prospects`);

    await a.ctx.close();
    await dupSlug.ctx.close();
    await dupEmail.ctx.close();
    await weak.ctx.close();
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    await cleanup();
    console.log("~ probe tenants + prospects removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nSIGNUP VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none */ }
  });
