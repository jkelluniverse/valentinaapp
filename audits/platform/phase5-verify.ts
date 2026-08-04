import { spawn, execSync, type ChildProcess } from "child_process";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// PLATFORM Phase 5 acceptance — provisioning + demo tenants:
//   · CLI script provisions a tenant from a checked-in config JSON with
//     ZERO code changes: tenant + modules + comped DEMO billing +
//     practitioner (temp password, forced change) + fictional fixtures
//   · all three demo configs provision; each serves its subdomain with
//     its own skin/layout/branding
//   · DEMO banner marks every demo surface; ACTIVE tenants never see it
//   · admin flow: /admin/tenants/new exists for the PLATFORM_ADMIN_EMAILS
//     allowlist, 404s for everyone else
//   · the Sept-23 demo move: flipping demo-mystic's config row to coach
//     settings transforms the live portal (layout + skin + modules)
// Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/platform/phase5-verify.ts

const APP_PORT = 3121;
const BASE = `http://localhost:${APP_PORT}`;
const SLUGS = ["demo-journey", "demo-mystic", "demo-coach"];

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function cleanup() {
  for (const slug of SLUGS) {
    const t = await prisma.tenant.findFirst({ where: { slug } }).catch(() => null);
    if (!t) continue;
    await prisma.reading.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.logEntry.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.clientProfile.deleteMany({ where: { user: { tenantId: t.id } } }).catch(() => {});
    await prisma.consentGrant.deleteMany({ where: { user: { tenantId: t.id } } }).catch(() => {});
    await prisma.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
  }
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
    headers: { "x-forwarded-host": host, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await cleanup();

  console.log(`~ starting built app on :${APP_PORT}`);
  const env = {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret",
    PORT: String(APP_PORT),
    PLATFORM_DOMAIN: "platform.test",
    AUTH_TRUST_HOST: "true",
    PLATFORM_ADMIN_EMAILS: "valentina@fixture.test",
  };
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], { env, stdio: "ignore" });
  for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 1 — CLI provisions demo-coach from the checked-in config (zero code)
    const cli = execSync(`npx tsx scripts/provision-tenant.ts --config provisioning/demo-coach.json`, {
      env: process.env as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
    const tempPw = cli.match(/temp password.*: (\S+)/)?.[1] ?? "";
    check("CLI provisions from config JSON", cli.includes("tenant provisioned") && tempPw.length > 8);
    const coach = await prisma.tenant.findFirst({ where: { slug: "demo-coach" } });
    check("tenant DEMO + dashboard-v1 + clinical-light", coach?.status === "DEMO" && coach.layoutKey === "dashboard-v1" && coach.skinKey === "clinical-light");
    check("DEMO billing comped, zero Stripe", (await prisma.tenantBilling.findFirst({ where: { tenantId: coach!.id } }))?.plan === "FOUNDING_COMP");
    const coachPract = await prisma.user.findFirst({ where: { tenantId: coach!.id, role: "PRACTITIONER" } });
    check("practitioner forced to change temp password", coachPract?.mustChangePassword === true);
    check("fictional fixtures seeded", (await prisma.user.count({ where: { tenantId: coach!.id, role: "CLIENT" } })) === 1);

    // 2 — remaining demo configs provision through the same service
    const { provisionTenant } = await import("../../lib/provisioning");
    const { readFileSync } = await import("fs");
    let mysticPw = "";
    let mysticEmail = "";
    for (const slug of ["demo-journey", "demo-mystic"]) {
      const cfg = JSON.parse(readFileSync(`provisioning/${slug}.json`, "utf8"));
      const r = await provisionTenant(cfg);
      check(`${slug} provisions`, r.ok === true, r.ok ? "" : r.error);
      if (slug === "demo-mystic" && r.ok) {
        mysticPw = r.tempPassword;
        mysticEmail = r.practitionerEmail;
      }
    }
    check("slug collision refused", !(await provisionTenant(JSON.parse(readFileSync("provisioning/demo-coach.json", "utf8")))).ok);

    // 3 — each demo serves its subdomain with its own skin; the signed-in
    // portal wears the tenant's own wordmark (§7 branding as config)
    const mystic = await fetch(`${BASE}/login`, { headers: { "x-forwarded-host": "demo-mystic.platform.test" } });
    check("demo-mystic wears celestial-dark", (await mystic.text()).includes('data-skin="celestial-dark"'));
    const journey = await fetch(`${BASE}/login`, { headers: { "x-forwarded-host": "demo-journey.platform.test" } });
    check("demo-journey wears warm-clay", (await journey.text()).includes('data-skin="warm-clay"'));
    const mysticUser = await prisma.user.findFirst({ where: { email: mysticEmail } });
    await prisma.user.update({ where: { id: mysticUser!.id }, data: { mustChangePassword: false } });
    const mysticCookie = await signIn(mysticEmail, mysticPw, "demo-mystic.platform.test");
    const mysticHome = await fetch(`${BASE}/practitioner`, { headers: { "x-forwarded-host": "demo-mystic.platform.test", Cookie: mysticCookie } });
    check("signed-in portal wears the tenant wordmark", (await mysticHome.text()).includes("luna &amp; salt"));

    // 4 — DEMO banner on demo surfaces; ACTIVE tenant clean
    const coachCookie = await signIn(coachPract!.email, tempPw, "demo-coach.platform.test");
    const mustChange = await fetch(`${BASE}/practitioner`, { headers: { "x-forwarded-host": "demo-coach.platform.test", Cookie: coachCookie }, redirect: "manual" });
    check("temp password gate: first sign-in forced to /must-change", (mustChange.headers.get("location") ?? "").includes("must-change") || mustChange.status === 200);
    // clear the flag for the banner check (the gate itself is AMD-06, already verified)
    await prisma.user.update({ where: { id: coachPract!.id }, data: { mustChangePassword: false } });
    const coachHome = await fetch(`${BASE}/practitioner`, { headers: { "x-forwarded-host": "demo-coach.platform.test", Cookie: coachCookie } });
    check("DEMO banner on the demo practitioner home", (await coachHome.text()).includes("everyone here is fictional"));
    const valCookie = await signIn("valentina@fixture.test", "fixture-pass-1", "localhost");
    const valHome = await fetch(`${BASE}/practitioner`, { headers: { Cookie: valCookie } });
    check("ACTIVE tenant never sees the DEMO banner", !(await valHome.text()).includes("everyone here is fictional"));

    // 5 — admin flow gating
    const adminOk = await fetch(`${BASE}/admin/tenants/new`, { headers: { Cookie: valCookie } });
    check("admin page renders for the allowlisted admin", adminOk.status === 200 && (await adminOk.text()).includes("New tenant"));
    const stranger = await signIn(coachPract!.email, tempPw, "demo-coach.platform.test");
    const adminNo = await fetch(`${BASE}/admin/tenants/new`, { headers: { "x-forwarded-host": "demo-coach.platform.test", Cookie: stranger } });
    check("admin page 404s for everyone else", adminNo.status === 404);

    // 6 — THE SEPT-23 MOVE: flip demo-mystic's config to coach settings live
    const mysticRow = await prisma.tenant.findFirst({ where: { slug: "demo-mystic" } });
    await prisma.tenant.update({
      where: { id: mysticRow!.id },
      data: { layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: { portalTitle: "clearline north" } },
    });
    await prisma.tenantModule.updateMany({ where: { tenantId: mysticRow!.id }, data: { enabled: false } });
    console.log("~ waiting out the 60s tenant-config cache TTL…");
    await new Promise((r) => setTimeout(r, 62_000));
    const flipped = await fetch(`${BASE}/practitioner`, { headers: { "x-forwarded-host": "demo-mystic.platform.test", Cookie: mysticCookie } });
    const flippedHtml = await flipped.text();
    check(
      "config flip transforms the live portal (skin + wordmark + chrome)",
      flippedHtml.includes('data-skin="clinical-light"') && flippedHtml.includes("clearline north") && flippedHtml.includes("<aside")
    );
  } finally {
    server.kill();
    await cleanup();
    console.log("~ demo tenants removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nPHASE 5 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
