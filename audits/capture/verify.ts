import { spawn, execSync, type ChildProcess } from "child_process";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { CSV_HEADERS } from "../../lib/prospects";
import { EVENT_SOURCE } from "../../lib/capture-config";

// C23-CAPTURE acceptance — the event floor, in a real browser against the
// BUILT app. Proves, per the spec's Verify list:
//   1  /join renders 200 in BOTH locales; no price / "free" / dollar figure
//   2  minimum submission (name + email) creates a LEAD with a unique
//      non-empty referralCode, and the success screen shows that code —
//      submitted with JAVASCRIPT DISABLED, because §1 says it must work on a
//      conference network before any bundle arrives
//   3  ?src=event-sept23&ref=ABC123 lands in source + referredByCode
//   4  re-submitting the same email upserts: one row, fields updated,
//      referralCode unchanged
//   5  a SIGNED_UP prospect who submits /join is NOT downgraded
//   6  missing name / malformed email refused server-side with the client
//      validation stripped
//   7  the rate limit trips; a honeypot submission is refused
//   8  an AuditEvent is written carrying no more than capture metadata
//   9  /admin/prospects renders for an allowlisted admin and 404s for a
//      non-allowlisted signed-in practitioner; counts match the seeded rows;
//      CSV export headers + one row per prospect, with commas, quotes and
//      non-ASCII names surviving the round trip
//  10  the QR page renders inline SVG with NO external request, encoding the
//      expected URL, with that URL also present as text
// Throwaway prospects + two throwaway practitioners; self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/capture/verify.ts

const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const PLATFORM_DOMAIN = "platform.test";
const EXEC = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const DEFAULT_TENANT_ID = "tnt_valentina_000000001";

const ADMIN_EMAIL = "capture-admin@fixture.test";
const STRANGER_EMAIL = "capture-stranger@fixture.test";
const PROBE_PASSWORD = "capture-probe-2026";

// Every prospect this harness creates carries one of these emails.
const E = {
  min: "capture-probe-min@fixture.test",
  src: "capture-probe-src@fixture.test",
  upsert: "capture-probe-upsert@fixture.test",
  signed: "capture-probe-signed@fixture.test",
  noname: "capture-probe-noname@fixture.test",
  bad: "capture-probe-bad-at-fixture.test", // deliberately malformed
  rate: "capture-probe-rate@fixture.test",
  honey: "capture-probe-honey@fixture.test",
};
const CSV_SOURCE = "capture-probe-csv";
// Names chosen to break a naive CSV writer: a comma, real quotes, accents.
const CSV_ROWS = [
  { email: "capture-probe-csv1@fixture.test", name: `O'Brien, "Ana" Núñez`, status: "LEAD" as const },
  { email: "capture-probe-csv2@fixture.test", name: "Zoë Müller", status: "LEAD" as const },
  { email: "capture-probe-csv3@fixture.test", name: "Carl Ø Ærø", status: "SIGNED_UP" as const },
];
const ALL_EMAILS = [...Object.values(E), ...CSV_ROWS.map((r) => r.email)];

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function cleanup() {
  const rows = await prisma.practitionerProspect
    .findMany({ where: { email: { in: ALL_EMAILS } }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await prisma.auditEvent
      .deleteMany({ where: { action: "prospect-capture", actorId: { in: ids } } })
      .catch(() => {});
  }
  await prisma.practitionerProspect.deleteMany({ where: { email: { in: ALL_EMAILS } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, STRANGER_EMAIL] } } }).catch(() => {});
}

type Fields = { name?: string; email?: string; phone?: string; practiceName?: string; note?: string };

/** One /join submission from a fresh context, so each scenario owns its IP. */
async function submit(
  browser: Browser,
  ip: string,
  path: string,
  f: Fields,
  opts: { js?: boolean; bypassClient?: boolean; honeypot?: boolean } = {},
): Promise<{ url: string; body: string; ctx: BrowserContext }> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    javaScriptEnabled: opts.js !== false,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  // The action's time-trap wants ~1.5s between render and submit.
  await page.waitForTimeout(1800);
  if (opts.bypassClient) {
    // Strip the client-side gates the way an attacker would. The server must
    // still refuse.
    await page.evaluate(() => {
      document.querySelectorAll("input, textarea").forEach((el) => {
        el.removeAttribute("required");
        el.removeAttribute("maxlength");
        if (el.getAttribute("type") === "email") el.setAttribute("type", "text");
      });
      document.querySelectorAll("form").forEach((el) => el.setAttribute("novalidate", "novalidate"));
    });
  }
  if (opts.honeypot) {
    await page.evaluate(() => {
      const el = document.querySelector('input[name="company"]') as HTMLInputElement | null;
      if (el) el.value = "Acme Bot Co";
    });
  }
  const set = async (sel: string, value: string) => {
    await page.fill(sel, "");
    if (value) await page.fill(sel, value);
  };
  if (f.name !== undefined) await set('input[name="name"]', f.name);
  if (f.email !== undefined) await set('input[name="email"]', f.email);
  if (f.phone !== undefined) await set('input[name="phone"]', f.phone);
  if (f.practiceName !== undefined) await set('input[name="practiceName"]', f.practiceName);
  if (f.note !== undefined) await set('textarea[name="note"]', f.note);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
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

// RFC 4180 parser — deliberately independent of lib/prospects.ts's writer, so
// the round trip is proven rather than assumed.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Any money-shaped or discount-shaped claim on the event floor is a spec breach.
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
    // The gate under test: only this address is a platform admin.
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

    // Two throwaway practitioners on the default tenant: one allowlisted, one not.
    const hash = await bcrypt.hash(PROBE_PASSWORD, 10);
    for (const [email, name] of [[ADMIN_EMAIL, "Capture Admin"], [STRANGER_EMAIL, "Capture Stranger"]] as const) {
      await prisma.user.create({
        data: {
          email, name, role: "PRACTITIONER", active: true,
          passwordHash: hash, mustChangePassword: false, tenantId: DEFAULT_TENANT_ID,
        },
      });
    }

    // ---- 1. both locales render, and neither carries a price ----
    for (const [locale, path, marker] of [
      ["en", "/join", "Leave us your name"],
      ["es", "/join?lang=es", "Déjanos tu nombre"],
    ] as const) {
      const res = await fetch(`${BASE}${path}`);
      const html = await res.text();
      check(`/join renders 200 in ${locale}`, res.status === 200 && html.includes(marker), `status ${res.status}`);
      // Rendered COPY only: React's flight payload legitimately contains
      // "$10"-style chunk references.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " ");
      const hit = MONEY.find((re) => re.test(text));
      check(`${locale} /join carries no price, no "free", no dollar figure`, !hit, hit ? `matched ${hit}` : "");
    }
    for (const locale of ["en", "es"] as const) {
      const raw = JSON.stringify((await import(`../../messages/${locale}/capture.json`)).default);
      const hit = MONEY.find((re) => re.test(raw));
      check(`messages/${locale}/capture.json carries no price language`, !hit, hit ? `matched ${hit}` : "");
    }
    // §1 — the handoff to /signup carries ?ref= and ?src= through.
    const handoff = await fetch(`${BASE}/join?src=${EVENT_SOURCE}&ref=ABC123`);
    const handoffHtml = await handoff.text();
    check(
      "the /signup handoff link carries ?ref= and ?src= through",
      /href="\/signup\?[^"]*ref=ABC123[^"]*"/.test(handoffHtml) && /href="\/signup\?[^"]*src=event-sept23/.test(handoffHtml),
      (handoffHtml.match(/href="\/signup\?[^"]*"/) ?? ["none"])[0],
    );

    // ---- 2. minimum submission, JAVASCRIPT DISABLED ----
    const min = await submit(browser, "203.0.113.10", "/join", { name: "Probe Minimum", email: E.min }, { js: false });
    check("minimum submission reaches the success screen with JS disabled", /\/join\/thanks/.test(min.url), min.url.replace(BASE, ""));
    const minRow = await prisma.practitionerProspect.findUnique({ where: { email: E.min } });
    check("minimum submission created a LEAD prospect", minRow?.status === "LEAD", `status ${minRow?.status}`);
    check(
      "referralCode issued, non-empty",
      Boolean(minRow?.referralCode && minRow.referralCode.length >= 6),
      minRow?.referralCode ?? "",
    );
    check("the success screen shows that referralCode", min.body.includes(minRow?.referralCode ?? " "));
    check("nothing optional was invented", minRow?.phone === null && minRow?.practiceName === null && minRow?.note === null);
    check("source defaults to web", minRow?.source === "web", String(minRow?.source));

    // ---- 3. ?src= + ?ref= land on the row ----
    const tagged = await submit(browser, "203.0.113.20", `/join?src=${EVENT_SOURCE}&ref=ABC123`, {
      name: "Probe Tagged",
      email: E.src,
      phone: "555-0101",
      practiceName: "Tagged Practice",
      note: "Met at the event",
    });
    const taggedRow = await prisma.practitionerProspect.findUnique({ where: { email: E.src } });
    check(
      `?src=${EVENT_SOURCE}&ref=ABC123 landed in source + referredByCode`,
      taggedRow?.source === EVENT_SOURCE && taggedRow?.referredByCode === "ABC123",
      `${taggedRow?.source} / ${taggedRow?.referredByCode}`,
    );
    check(
      "optional fields stored",
      taggedRow?.phone === "555-0101" && taggedRow?.practiceName === "Tagged Practice" && taggedRow?.note === "Met at the event",
    );
    await tagged.ctx.close();

    // ---- 4. upsert idempotence ----
    const first = await submit(browser, "203.0.113.30", "/join?ref=FIRSTREF", { name: "Probe Upsert", email: E.upsert });
    const firstRow = await prisma.practitionerProspect.findUnique({ where: { email: E.upsert } });
    await first.ctx.close();
    const second = await submit(browser, "203.0.113.31", "/join?ref=SECONDREF", {
      name: "Probe Upsert Renamed",
      email: E.upsert.toUpperCase(), // and the email case must not matter
      phone: "555-0202",
    });
    const secondRow = await prisma.practitionerProspect.findUnique({ where: { email: E.upsert } });
    check("re-submitting the same email is not an error the visitor must read", /\/join\/thanks/.test(second.url), second.url.replace(BASE, ""));
    check(
      "still exactly one row for that email",
      (await prisma.practitionerProspect.count({ where: { email: { contains: "capture-probe-upsert" } } })) === 1,
    );
    check("fields updated by the second pass", secondRow?.name === "Probe Upsert Renamed" && secondRow?.phone === "555-0202",
      `${secondRow?.name} / ${secondRow?.phone}`);
    check("referralCode unchanged by the upsert", Boolean(firstRow?.referralCode) && secondRow?.referralCode === firstRow?.referralCode,
      `${firstRow?.referralCode} → ${secondRow?.referralCode}`);
    check("the FIRST referredByCode survives", secondRow?.referredByCode === "FIRSTREF", String(secondRow?.referredByCode));
    check("the success screen shows the SAME code the row carries", second.body.includes(secondRow?.referralCode ?? " "));
    await second.ctx.close();

    // ---- 5. a SIGNED_UP prospect is NOT downgraded ----
    const converted = await prisma.practitionerProspect.create({
      data: {
        name: "Probe Converted",
        email: E.signed,
        status: "SIGNED_UP",
        source: "web",
        referralCode: "PROBECNV",
        tenantId: DEFAULT_TENANT_ID,
        convertedAt: new Date(),
      },
    });
    const again = await submit(browser, "203.0.113.40", "/join?src=event-sept23", {
      name: "Probe Converted Again",
      email: E.signed,
      phone: "555-0303",
    });
    const afterRow = await prisma.practitionerProspect.findUnique({ where: { email: E.signed } });
    check("a SIGNED_UP prospect who submits /join keeps SIGNED_UP", afterRow?.status === "SIGNED_UP", `status ${afterRow?.status}`);
    check("their tenant link survives", afterRow?.tenantId === DEFAULT_TENANT_ID, String(afterRow?.tenantId));
    check("their convertedAt survives", afterRow?.convertedAt?.getTime() === converted.convertedAt?.getTime());
    check("their referralCode is not reissued", afterRow?.referralCode === "PROBECNV", String(afterRow?.referralCode));
    check("the new details still landed", afterRow?.name === "Probe Converted Again" && afterRow?.phone === "555-0303");
    await again.ctx.close();

    // ---- 6. server-side refusals with the client validation stripped ----
    const noName = await submit(browser, "203.0.113.50", "/join", { name: "", email: E.noname }, { bypassClient: true });
    check("missing name refused server-side (client validation stripped)", /error=missing/.test(noName.url), noName.url.replace(BASE, ""));
    check("no row from the nameless attempt", (await prisma.practitionerProspect.count({ where: { email: E.noname } })) === 0);
    await noName.ctx.close();
    const badEmail = await submit(browser, "203.0.113.51", "/join", { name: "Probe Bad Email", email: E.bad }, { bypassClient: true });
    check("malformed email refused server-side (client validation stripped)", /error=email/.test(badEmail.url), badEmail.url.replace(BASE, ""));
    check("no row from the malformed-email attempt", (await prisma.practitionerProspect.count({ where: { email: E.bad } })) === 0);
    await badEmail.ctx.close();

    // ---- 7. honeypot + rate limit ----
    const honey = await submit(browser, "203.0.113.60", "/join", { name: "Probe Bot", email: E.honey }, { honeypot: true });
    check("honeypot submission refused", /error=rate/.test(honey.url), honey.url.replace(BASE, ""));
    check("honeypot submission wrote nothing", (await prisma.practitionerProspect.count({ where: { email: E.honey } })) === 0);
    await honey.ctx.close();

    let rateHit = 0;
    for (let i = 0; i < 8; i++) {
      const r = await submit(browser, "203.0.113.70", "/join", { name: `Probe Rate ${i}`, email: E.rate });
      const rated = /error=rate/.test(r.url);
      await r.ctx.close();
      if (rated) { rateHit = i + 1; break; }
    }
    check("rate limit trips on repeated submissions", rateHit > 0, rateHit ? `refused at attempt ${rateHit}` : "survived 8");

    // ---- 8. the audit row ----
    const audits = await prisma.auditEvent.findMany({
      where: { action: "prospect-capture", actorId: { in: [minRow!.id, taggedRow!.id] } },
    });
    check("AuditEvent written for each capture", audits.length === 2, `${audits.length} rows`);
    check("AuditEvent attributed to the prospect row it created", audits.every((a) => a.actorId.length > 0));
    const blob = JSON.stringify(audits);
    check(
      "AuditEvent carries no more than capture metadata",
      !blob.includes(E.min) && !blob.includes(E.src) && !blob.includes("555-0101") &&
        !blob.includes("Met at the event") && !blob.includes("Probe Tagged"),
      "no email, phone, note body or name in meta",
    );
    check(
      "AuditEvent meta carries the expected keys only",
      audits.every((a) => {
        const keys = Object.keys((a.meta ?? {}) as Record<string, unknown>).sort().join(",");
        return keys === "created,hasNote,hasPhone,prospectId,referralCode,referredByCode,source,status";
      }),
      Object.keys((audits[0]?.meta ?? {}) as Record<string, unknown>).sort().join(","),
    );
    check(
      "capture AuditEvents are tenant-stamped (no new null-tenant rows)",
      audits.every((a) => a.tenantId === DEFAULT_TENANT_ID),
      String(audits[0]?.tenantId),
    );

    // ---- 9. /admin/prospects gating, counts, CSV ----
    // A deterministic filter set: 2 LEAD + 1 SIGNED_UP under one source tag,
    // with names built to break a naive CSV writer.
    for (const r of CSV_ROWS) {
      await prisma.practitionerProspect.create({
        data: {
          name: r.name,
          email: r.email,
          status: r.status,
          source: CSV_SOURCE,
          note: r.status === "LEAD" ? 'Said "yes, maybe", then left' : null,
          referralCode: `PRB${r.email.slice(-6, -5).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          tenantId: r.status === "SIGNED_UP" ? DEFAULT_TENANT_ID : null,
        },
      });
    }

    const adminCookie = await signIn(ADMIN_EMAIL, PROBE_PASSWORD, "localhost");
    const strangerCookie = await signIn(STRANGER_EMAIL, PROBE_PASSWORD, "localhost");
    const adminRes = await fetch(`${BASE}/admin/prospects`, { headers: { Cookie: adminCookie } });
    const adminHtml = await adminRes.text();
    check("/admin/prospects renders for the allowlisted admin", adminRes.status === 200 && adminHtml.includes("Practitioner prospects"),
      `status ${adminRes.status}`);
    const strangerRes = await fetch(`${BASE}/admin/prospects`, { headers: { Cookie: strangerCookie } });
    check("/admin/prospects 404s for a non-allowlisted SIGNED-IN practitioner", strangerRes.status === 404, `status ${strangerRes.status}`);
    const anonRes = await fetch(`${BASE}/admin/prospects`, { redirect: "manual" });
    check("/admin/prospects does not render for a signed-out visitor",
      anonRes.status !== 200, `status ${anonRes.status}`);
    const exportStranger = await fetch(`${BASE}/admin/prospects/export`, { headers: { Cookie: strangerCookie } });
    check("CSV export 404s for a non-allowlisted signed-in practitioner", exportStranger.status === 404, `status ${exportStranger.status}`);

    const filtered = await fetch(`${BASE}/admin/prospects?source=${CSV_SOURCE}`, { headers: { Cookie: adminCookie } });
    const filteredText = (await filtered.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    check("filtered page shows the total for that source", /Total 3/.test(filteredText), filteredText.match(/Total \d+/)?.[0] ?? "none");
    check("counts by status match the seeded rows", /2 LEAD/.test(filteredText) && /1 SIGNED_UP/.test(filteredText),
      filteredText.match(/By status ([^B]*)/)?.[1]?.trim().slice(0, 40) ?? "none");
    check("counts by source match the seeded rows", new RegExp(`3 ${CSV_SOURCE}`).test(filteredText),
      filteredText.match(/By source ([^S]*)/)?.[1]?.trim().slice(0, 40) ?? "none");
    // Search by email
    const searched = await fetch(`${BASE}/admin/prospects?q=capture-probe-csv2`, { headers: { Cookie: adminCookie } });
    const searchedText = (await searched.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    check("searchable by email", /Total 1/.test(searchedText) && searchedText.includes("Zoë Müller"),
      searchedText.match(/Total \d+/)?.[0] ?? "none");

    const csvRes = await fetch(`${BASE}/admin/prospects/export?source=${CSV_SOURCE}`, { headers: { Cookie: adminCookie } });
    const csv = await csvRes.text();
    check("CSV export is served as a CSV attachment",
      csvRes.status === 200 && (csvRes.headers.get("content-type") ?? "").includes("text/csv") &&
        (csvRes.headers.get("content-disposition") ?? "").includes("attachment"),
      `${csvRes.status} ${csvRes.headers.get("content-type")}`);
    const table = parseCsv(csv);
    check("CSV headers are exactly the documented columns", table[0]?.join(",") === CSV_HEADERS.join(","), table[0]?.join(",") ?? "none");
    check("CSV has one row per prospect in the filter", table.length === 4, `${table.length - 1} data rows`);
    const byEmail = new Map(table.slice(1).map((r) => [r[1], r]));
    check(
      "commas, quotes and non-ASCII names survive the CSV round trip",
      CSV_ROWS.every((r) => byEmail.get(r.email)?.[0] === r.name),
      CSV_ROWS.map((r) => `${r.name}→${byEmail.get(r.email)?.[0] ?? "MISSING"}`).join(" | "),
    );
    check(
      "a note containing a comma and quotes survives too",
      byEmail.get(CSV_ROWS[0].email)?.[4] === 'Said "yes, maybe", then left',
      byEmail.get(CSV_ROWS[0].email)?.[4] ?? "none",
    );
    check(
      "the converted prospect's tenant link is in the export",
      byEmail.get(CSV_ROWS[2].email)?.[9] === "valentina",
      byEmail.get(CSV_ROWS[2].email)?.[9] ?? "none",
    );
    check("every exported row carries the prospect's own referralCode",
      table.slice(1).every((r) => r[8]?.length >= 6), table.slice(1).map((r) => r[8]).join(","));

    // ---- 10. the QR page ----
    const qrCtx = await browser.newContext();
    const external: string[] = [];
    qrCtx.on("request", (r) => { if (!r.url().startsWith(BASE)) external.push(r.url()); });
    await qrCtx.addCookies(
      adminCookie.split("; ").map((c) => {
        const eq = c.indexOf("=");
        return { name: c.slice(0, eq), value: c.slice(eq + 1), domain: "localhost", path: "/" };
      }),
    );
    const qrPage = await qrCtx.newPage();
    const qrResp = await qrPage.goto(`${BASE}/admin/prospects/qr`, { waitUntil: "load" });
    const qrHtml = await qrPage.content();
    const expectedUrl = `https://${PLATFORM_DOMAIN}/join?src=${EVENT_SOURCE}`;
    check("QR page renders for the admin", qrResp?.status() === 200, `status ${qrResp?.status()}`);
    check("QR is inline SVG in the page's own HTML", /<svg[^>]*>/.test(qrHtml) && !/<img/.test(qrHtml));
    check("the target URL is present as plain text", (await qrPage.textContent("body"))?.includes(expectedUrl) ?? false, expectedUrl);
    // Prove the SVG really encodes that URL: regenerate it independently and
    // compare the path data.
    const expectedSvg = await QRCode.toString(expectedUrl, {
      type: "svg", errorCorrectionLevel: "H", margin: 2, color: { dark: "#000000", light: "#ffffff" },
    });
    const pathOf = (s: string) => (s.match(/ d="([^"]+)"/g) ?? []).join("|");
    check("the inline SVG encodes the expected /join URL", pathOf(qrHtml).includes(pathOf(expectedSvg).split("|").pop() ?? "x"),
      `${pathOf(expectedSvg).length} chars of path data compared`);
    await qrPage.waitForTimeout(500);
    check("the QR page makes NO third-party request", external.length === 0, external.slice(0, 3).join(", ") || "none");
    const qrStranger = await fetch(`${BASE}/admin/prospects/qr`, { headers: { Cookie: strangerCookie } });
    check("the QR page 404s for a non-allowlisted signed-in practitioner", qrStranger.status === 404, `status ${qrStranger.status}`);
    await qrCtx.close();

    await min.ctx.close();
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    await cleanup();
    console.log("~ probe prospects + practitioners removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nCAPTURE VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${PORT}"`); } catch { /* none */ }
  });
