/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { rawPrisma as prisma } from "../lib/prisma-internal";
import { CARD_SOURCE, CARD_TAG, PRICING } from "../lib/founders-config";

// C35-FOUNDERS-EVENT acceptance — /founders is a PRINTED URL (ruling 174), so
// it is a permanent dependency and belongs in the standing set.
//
// WHAT THIS GATE EXISTS TO STOP, in order of how much it would cost:
//   1. A PRICE THAT IS NOT RULING 175'S reaching a paid page. Law 2 prohibits
//      prices on screens; ruling 175 lifts it for a specific list. So this
//      scrapes EVERY dollar figure out of the rendered HTML and reconciles each
//      one against that list — it does not check for the presence of the right
//      numbers, it checks for the ABSENCE of any other number. The brief's own
//      FAQ carried "$15" for additional recorded-hour blocks, which is not in
//      ruling 175; that is exactly the class of thing this catches.
//   2. THE SEAT COUNTER COMING BACK (ruling 176). Cut entirely, not hidden.
//   3. THE THREE CUT CLAIMS COMING BACK (ruling 188) — the Practice Manager
//      agent, the morning brief, the admin/VA seat. They do not exist.
//   4. A /signup LINK ON THE FOUNDING PAGE (ruling 189). /signup provisions a
//      FREE practice, so a founding CTA pointing there would hand away the
//      thing the funnel exists to sell.
//   5. THE CARD ATTRIBUTION SILENTLY REGRESSING TO "web" (rulings 179/181).
//      Stage 1 preserved ?source= and /join ignored it. The apply route
//      replaced that redirect, so the mapping had to survive the replacement —
//      this asserts the STORED ROW, not the query string.

const PORT = 3147; // unique per ruling 56/59 — port-uniqueness enforces it
const BASE = `http://127.0.0.1:${PORT}`;
const HOST_PLATFORM = "psychefolio.test";
const HOST_TENANT = "valentina.psychefolio.test";
const EMAIL = "founders-gate-probe@fixture.test";

const results: { name: string; pass: boolean; note?: string }[] = [];
const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

/** Every distinct dollar figure ruling 175 permits on a screen. */
const ALLOWED: Set<string> = new Set([
  PRICING.standardPractice, PRICING.foundingFirstYear,
  PRICING.foundingAfter, PRICING.onboardingIncluded,
]);

async function get(path: string, host: string): Promise<{ status: number; body: string; location: string | null }> {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-forwarded-host": host }, redirect: "manual" });
  return { status: res.status, body: await res.text(), location: res.headers.get("location") };
}

/** Visible text only — a price hidden in a script payload still counts, but a
 *  class name containing "$" does not. */
const visible = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");

async function cleanup() {
  await prisma.practitionerProspect.deleteMany({ where: { email: EMAIL } }).catch(() => {});
}

async function main() {
  log(`# C35-FOUNDERS-EVENT verify — ${new Date().toISOString()}`);
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch DB)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  await cleanup();

  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT), PLATFORM_DOMAIN: "psychefolio.test", AUTH_SECRET: process.env.AUTH_SECRET || "gate-secret" },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // ---- 1. the page renders on the platform host, 404s on a tenant host ----
    const page = await get("/founders", HOST_PLATFORM);
    check("the founding page renders on the PLATFORM host", page.status === 200 && /Founding Practice/i.test(page.body), `status ${page.status}`);
    const tenantPage = await get("/founders", HOST_TENANT);
    check("a TENANT host still 404s — no founding funnel on a practice's domain", tenantPage.status === 404, `status ${tenantPage.status}`);

    // ---- 2. V3 — EVERY dollar figure reconciles to ruling 175 ----
    const figures = [...new Set((visible(page.body).match(/\$[0-9][0-9,]*/g) ?? []))];
    const strays = figures.filter((f) => !ALLOWED.has(f));
    check(
      `V3 — every dollar figure on the page is one of ruling 175's (${figures.length} distinct found)`,
      strays.length === 0 && figures.length > 0,
      strays.length ? `STRAY: ${strays.join(", ")}` : `all of: ${figures.join(" ")}`,
    );

    // ---- 3. V4 — ruling 176: no counter, anywhere ----
    const vis = visible(page.body);
    const counterHits = [/seats?\s+claimed/i, /seats?\s+remaining/i, /\d+\s+of\s+20/i, /filling\s+up/i, /spots?\s+left/i]
      .filter((re) => re.test(vis)).map(String);
    check("V4 — ruling 176: no seat counter or 'remaining' language anywhere", counterHits.length === 0, counterHits.join(" · ") || "none");
    check("…and the fixed statement of terms IS present", /Limited to 20 founding practices/i.test(vis));

    // ---- 4. ruling 188 — the three cut claims stay cut ----
    const cut = [/practice manager/i, /morning brief/i, /\bVA seat\b/i, /admin seat/i];
    const cutHits = cut.filter((re) => re.test(vis)).map(String);
    check("ruling 188 — Practice Manager agent / morning brief / admin-VA seat are ABSENT", cutHits.length === 0, cutHits.join(" · ") || "none");
    check("…and 'One practitioner seat' IS the stated seat line", /One practitioner seat/i.test(vis));

    // ---- 5. ruling 189 — nothing on this page links to /signup ----
    const signupLinks = (page.body.match(/href="\/signup[^"]*"/g) ?? []);
    check("ruling 189 — the founding page links to /signup NOWHERE", signupLinks.length === 0, signupLinks.join(" ") || "none");
    check("…and the apply CTA is present", /href="\/founders\/apply/.test(page.body));

    // ---- 6. the eyebrow is conditional on the card source ----
    const carded = await get(`/founders?source=${CARD_SOURCE}`, HOST_PLATFORM);
    check("the card's ?source= switches the hero eyebrow to the event wording",
      /Private event invitation/i.test(visible(carded.body)) && !/Private event invitation/i.test(vis));
    check("…and the apply link carries the source onward", carded.body.includes(`/founders/apply?source=${CARD_SOURCE}`));

    // ---- 7. the terms link does NOT render while the Addendum does not exist ----
    check("the Addendum link is ABSENT while the document does not exist (no placeholder, no 404)",
      !/Read the complete Founding Practice terms/i.test(vis));
    check("…while the terms SUMMARY does ship", /Clear terms from the beginning/i.test(vis));

    // ---- 8. the FAQ works without JS — native details/summary ----
    const details = (page.body.match(/<details/g) ?? []).length;
    check("the FAQ is native <details>/<summary>, so it opens with JS disabled", details >= 8, `${details} <details> elements`);

    // ---- 9. RULINGS 179/181 — the STORED ROW carries the card tag ----
    const form = await get(`/founders/apply?source=${CARD_SOURCE}`, HOST_PLATFORM);
    // The SSR server-action form posts MULTIPART, not urlencoded — the same
    // mechanism demo-path has been proving against /join since C30. Setting the
    // Content-Type by hand breaks it; FormData must set its own boundary.
    const actionField = form.body.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1] ?? null;
    check("the application form renders and carries a server-action id", Boolean(actionField) && form.status === 200);

    if (actionField) {
      const body = new FormData();
      body.set(actionField, "");
      body.set("t", "0"); // time-trap: 0 disables the "too fast" branch
      body.set("source", CARD_SOURCE);
      body.set("firstName", "Gate");
      body.set("lastName", "Probe");
      body.set("email", EMAIL);
      body.set("practiceName", "Gate Probe Practice");
      body.set("modalities", "gate-probe-modality");
      body.set("feedbackCalls", "on");
      body.set("consent", "on");
      const res = await fetch(`${BASE}/founders/apply`, {
        method: "POST",
        headers: { "x-forwarded-host": HOST_PLATFORM },
        body,
        redirect: "manual",
      });
      const row = await prisma.practitionerProspect.findUnique({ where: { email: EMAIL } });
      check("a JS-DISABLED application submission writes the prospect", Boolean(row), `http ${res.status} · row ${row ? "created" : "MISSING"}`);
      check(
        `RULINGS 179/181 — the STORED source is the card TAG, not "web" and not the raw ?source=`,
        row?.source === CARD_TAG,
        `stored source = ${JSON.stringify(row?.source)} (expected ${CARD_TAG})`,
      );
      const meta = (row?.applicationMeta ?? null) as Record<string, unknown> | null;
      check("the application-only answers land in applicationMeta (migration 53, additive)",
        Boolean(meta) && meta?.modalities === "gate-probe-modality" && meta?.arrivedFrom === CARD_SOURCE,
        meta ? `keys: ${Object.keys(meta).join(",")}` : "null");
      check("ruling 189 — applying provisions NOTHING: no tenant on the row",
        row?.tenantId === null && row?.convertedAt === null,
        `tenantId=${String(row?.tenantId)} convertedAt=${String(row?.convertedAt)}`);
    }
  } finally {
    try { server.kill("SIGTERM"); } catch { /* already gone */ }
    await cleanup();
  }

  const failed = results.filter((r) => !r.pass);
  log(`\n${failed.length === 0 ? `FOUNDERS VERIFY PASS — ${results.length}/${results.length}` : `${failed.length} CHECK(S) FAILED — ${results.length - failed.length}/${results.length}`}`);
  mkdirSync("audits/founders", { recursive: true });
  writeFileSync("audits/founders/VERIFY-LOG.md", report.join("\n") + "\n");
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
