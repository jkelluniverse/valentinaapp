// C42-PRACTITIONER-FORMS — the acceptance gate (rulings 225, 234; spec §4).
//
// LEGS, numbered as in the spec's §4, each with its positive control (ruling 110):
//   1  DEFAULTS ARE TODAY: a practice with no booking worksheet renders exactly
//      the pre-C42 form (name, email, Phone · optional, What brings you? ·
//      optional — ids, tags, types, order, optionality, placeholder) and a
//      submission writes the same four Lead columns; the snapshot column is
//      new and carries the two defaults under their ids. In EN and ES.
//   2  REQUIRED IS SERVER-SIDE: the `required` attribute stripped in the DOM,
//      a submission omitting a practitioner-required question is refused with
//      error=missing&field=<id> and writes nothing; the same submission with
//      the answer is accepted (control).
//   3  STRUCTURAL FIELDS CANNOT BE REMOVED: a schema claiming id "email" is
//      refused by rejectStructuralIds and, hand-written raw, still renders ONE
//      email input; a POST without email is refused at the pre-C42 check; an
//      EMPTY schema still books.
//   4  SNAPSHOTS SURVIVE EDITS: book under label L1, rename to L2, the stored
//      q is L1 and the leads page shows L1; a new booking stores L2.
//   5  FALLBACK RENDERS: en-only field requested in es shows the English label;
//      with es set, the Spanish one — and the stored q is the Spanish text.
//   6  EXACTLY ONE BOOKING FORM: "Set as booking form" on B, driven through the
//      real library sheet in the browser, clears A (the isIntake transaction).
//   7  C37 SHAPE: normaliseCalendly yields { "ext:1": { q, a } }; an external
//      booking for a lead her form already created MERGES — both on one Lead.
//   8  EVERY EXISTING WORKSHEET STILL PARSES — parseFields equals the pre-C42
//      filter on every stored schema (labels is additive); a malformed labels
//      object is dropped, the field kept (control).
//
// SCOPE is printed at the top of every run (ruling 208). Local build on :3192,
// one throwaway tenant under c42.test, a REAL browser on the tenant host (a
// Next server action refuses a forwarded-host Origin — the C40 lesson), HTTP +
// in-process. NOT covered: production, real mail delivery, the worksheet
// builder's own autosave inputs (C9's gates), any surface not named above.
import { spawn, execSync, type ChildProcess } from "child_process";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import bcrypt from "bcryptjs";
import { rawPrisma } from "../../lib/prisma-internal";
import { withTenantScope } from "../../lib/tenancy/tenant-scope";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
const EXE = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

if (/railway|rlwy\.net/i.test(process.env.DATABASE_URL ?? "")) { console.error("REFUSING: DATABASE_URL points at Railway — this gate seeds and deletes; scratch only."); process.exit(2); }

const PORT = 3192;
const BASE = `http://127.0.0.1:${PORT}`;
const HOST = "c42a.c42.test";
const HOST_URL = `http://${HOST}:${PORT}`;
const T = "c42-fixture";

let failed = 0; const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => { if (!ok) failed++; log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`); };

async function cleanup(): Promise<void> {
  await rawPrisma.lead.deleteMany({ where: { tenantId: T } });
  await rawPrisma.appointment.deleteMany({ where: { tenantId: T } });
  await rawPrisma.libraryItem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
  await rawPrisma.libraryFolder.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
  await rawPrisma.worksheet.deleteMany({ where: { tenantId: T } });
  await rawPrisma.practiceSetting.deleteMany({ where: { tenantId: T } });
  await rawPrisma.availabilityRule.deleteMany({ where: { tenantId: T } });
  await rawPrisma.schedulingConfig.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
  await rawPrisma.user.deleteMany({ where: { tenantId: T } });
  await rawPrisma.tenantDomain.deleteMany({ where: { host: HOST } }).catch(() => undefined);
  await rawPrisma.tenant.deleteMany({ where: { id: T } });
}
async function signIn(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => { for (const c of sc) { const [pair] = c.split(";"); const eq = pair.indexOf("="); if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()); } };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": HOST } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "x-forwarded-host": HOST, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password: "fixture-pass-1" }) });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

type RenderedField = { id: string; tag: string; type: string | null; required: boolean; label: string; placeholder: string | null };
let ipN = 10;
async function openForm(browser: Browser, lang = "en"): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.4.2.${ipN++}` } });
  const page = await ctx.newPage();
  await page.goto(`${HOST_URL}/book?lang=${lang}`, { waitUntil: "networkidle" });
  await page.locator("button[type=button]").first().click();
  const slotButtons = page.getByRole("button", { name: /\d{1,2}:\d{2}/ });
  await slotButtons.first().waitFor({ state: "visible", timeout: 10_000 });
  const n = await slotButtons.count();
  await slotButtons.nth(Math.min(ipN % 5, n - 1)).click(); // a different slot each time; a booked slot is not offered again
  await page.waitForSelector('input[name="startAt"]', { state: "attached", timeout: 10_000 });
  return { ctx, page };
}
// The form AS RENDERED: structural controls first, then each practitioner field
// in DOM order, with the label text the visitor reads.
async function renderedFields(page: Page): Promise<RenderedField[]> {
  return page.evaluate(() => {
    const out: { id: string; tag: string; type: string | null; required: boolean; label: string; placeholder: string | null }[] = [];
    const form = document.querySelector("form")!;
    for (const id of ["name", "email"]) {
      const el = form.querySelector(`[name="${id}"]`) as HTMLInputElement | null;
      if (!el) continue;
      out.push({ id, tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), required: el.hasAttribute("required"), label: (el.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim(), placeholder: el.getAttribute("placeholder") });
    }
    for (const wrap of Array.from(form.querySelectorAll("[data-c42-field]"))) {
      const id = wrap.getAttribute("data-c42-field")!;
      const el = wrap.querySelector("input, textarea, select") as HTMLInputElement | null;
      const labelEl = wrap.querySelector("span") ?? wrap.querySelector("p");
      out.push({ id, tag: el ? el.tagName.toLowerCase() : "section", type: el?.getAttribute("type") ?? null, required: !!el?.hasAttribute("required"), label: (labelEl?.textContent ?? "").replace(/\s+/g, " ").trim(), placeholder: el?.getAttribute("placeholder") ?? null });
    }
    return out;
  });
}
async function submitForm(page: Page, fill: Record<string, string>, opts: { stripRequired?: boolean } = {}): Promise<string> {
  for (const [name, value] of Object.entries(fill)) {
    const el = page.locator(`form [name="${name}"]`).first();
    if ((await el.count()) === 0) continue;
    await el.fill(value);
  }
  if (opts.stripRequired) await page.evaluate(() => { for (const el of Array.from(document.querySelectorAll("form [required]"))) el.removeAttribute("required"); });
  await page.waitForTimeout(2700); // the honeypot's time-trap: >2.5s on screen
  await page.locator("form button:not([type=button])").last().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  return page.url().replace(HOST_URL, "");
}
const PRE_C42_FORM_EN: RenderedField[] = [
  { id: "name", tag: "input", type: null, required: true, label: "Your name", placeholder: null },
  { id: "email", tag: "input", type: "email", required: true, label: "Email", placeholder: null },
  { id: "phone", tag: "input", type: "tel", required: false, label: "Phone · optional", placeholder: null },
  { id: "note", tag: "textarea", type: null, required: false, label: "What brings you? · optional", placeholder: "A sentence or two, if you'd like — no need to explain everything." },
];
const PRE_C42_FORM_ES: RenderedField[] = [
  { id: "name", tag: "input", type: null, required: true, label: "Tu nombre", placeholder: null },
  { id: "email", tag: "input", type: "email", required: true, label: "Correo electrónico", placeholder: null },
  { id: "phone", tag: "input", type: "tel", required: false, label: "Teléfono · opcional", placeholder: null },
  { id: "note", tag: "textarea", type: null, required: false, label: "¿Qué te trae por aquí? · opcional", placeholder: "Una o dos frases, si quieres — no hace falta explicarlo todo." },
];
// INSTRUMENT NOTE: Postgres JSONB does not preserve key order (it stores keys
// sorted by length then bytes), so `{ q, a }` comes back as `{ a, q }` and a
// JSON.stringify comparison fails on order alone. A first run of this gate
// failed three checks that way with every VALUE correct. Compare canonically.
const canon = (x: unknown): unknown => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

async function main(): Promise<void> {
  log(`# C42-PRACTITIONER-FORMS acceptance — ${new Date().toISOString()}`);
  log(`SCOPE: host ${HOST} · viewport 1280×900 (form logic, not layout) · HTTP on :${PORT} + a real Chromium on the tenant host + in-process · local build ${(() => { try { return execSync("git log -1 --format=%h").toString().trim(); } catch { return "?"; } })()}. NOT covered: production, real mail delivery, the builder's autosave inputs, mobile layout of /book (C18's baseline), any surface not named in a leg (ruling 208).`);
  await cleanup();
  const now = new Date();
  await rawPrisma.tenant.create({ data: { id: T, slug: "c42a", displayName: "C42 Practice", status: "ACTIVE", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} } });
  await rawPrisma.tenantDomain.create({ data: { host: HOST, tenantId: T } }).catch(() => undefined);
  const pract = await rawPrisma.user.create({ data: { email: "pract@c42a.fixture.test", name: "Pia Pract", role: "PRACTITIONER", active: true, tenantId: T, passwordHash: bcrypt.hashSync("fixture-pass-1", 4) } });
  for (const wd of [0, 1, 2, 3, 4, 5, 6]) await rawPrisma.availabilityRule.create({ data: { tenantId: T, practitionerId: pract.id, kind: "DISCOVERY", weekday: wd, startMinute: 9 * 60, endMinute: 17 * 60 } });
  const S = await import("../../lib/schedule");
  const BF = await import("../../lib/booking-form");
  const WM = await import("../../lib/worksheet-meta");
  const inT = <X,>(fn: () => Promise<X>) => withTenantScope(T, fn);
  await inT(() => S.getOrCreateConfig(pract.id));
  const leads = () => rawPrisma.lead.count({ where: { tenantId: T } });
  const lastLead = () => rawPrisma.lead.findFirst({ where: { tenantId: T }, orderBy: { createdAt: "desc" } });
  const setSchema = (id: string, schema: unknown[]) => rawPrisma.worksheet.update({ where: { id }, data: { schema: schema as object[] } });

  // ================= in-process: 3 (unit), 7 (unit), 8 =================
  log(`\n## In-process — the pure pieces`);
  const v = BF.rejectStructuralIds([{ id: "x", type: "SHORT_TEXT", label: "x" }, { id: "email", type: "SHORT_TEXT", label: "Email again" }]);
  check("3: a schema claiming id \"email\" is refused with the id named", !v.ok && v.id === "email");
  check("3: positive control — a schema with no structural id is accepted", BF.rejectStructuralIds([...BF.DEFAULT_BOOKING_FIELDS]).ok);
  const fd = new FormData(); fd.set("name", "x"); fd.set("email", "x@y.z"); fd.set("phone", "   ");
  check("2 (unit): firstMissingRequired names the first blank REQUIRED field, treating whitespace as blank", BF.firstMissingRequired([{ id: "phone", type: "SHORT_TEXT", label: "Phone", required: true }, { id: "note", type: "LONG_TEXT", label: "Note", required: true }], fd) === "phone");
  check("2 (unit): …and null when every required field is answered", BF.firstMissingRequired([{ id: "note", type: "LONG_TEXT", label: "Note", required: false }], fd) === null);
  const { normaliseCalendly } = await import("../../lib/scheduling/external/calendly");
  const nb = normaliseCalendly(JSON.stringify({ event: "invitee.created", payload: { uri: "https://api.calendly.com/scheduled_events/C42/invitees/1", name: "Ext", email: "ext@c42.stranger.test", scheduled_event: { uri: "https://api.calendly.com/scheduled_events/C42-EVT", start_time: new Date(now.getTime() + 3 * 86_400_000).toISOString(), end_time: new Date(now.getTime() + 3 * 86_400_000 + 1_800_000).toISOString() }, questions_and_answers: [{ question: "What brings you here?", answer: "Sleep." }, { question: "", answer: "second" }], created_at: now.toISOString() } }));
  check("7: normaliseCalendly yields { \"ext:1\": { q, a } } — keyed ext:<n>, q verbatim, a blank question gets a numbered q", same(nb?.intakeAnswers, { "ext:1": { q: "What brings you here?", a: "Sleep." }, "ext:2": { q: "Question 2", a: "second" } }), JSON.stringify(nb?.intakeAnswers));
  // 8 — every stored worksheet schema parses as before
  const all = await rawPrisma.worksheet.findMany({ select: { id: true, schema: true } });
  const oldFilter = (schema: unknown) => (Array.isArray(schema) ? schema.filter((f) => !!f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string" && WM.FIELD_TYPES.includes((f as { type: never }).type) && typeof (f as { label?: unknown }).label === "string") : []);
  const unchanged = all.filter((w) => same(WM.parseFields(w.schema), oldFilter(w.schema))).length;
  check(`8: parseFields equals the pre-C42 filter on EVERY stored worksheet (${all.length} rows)`, all.length > 0 && unchanged === all.length, `${unchanged}/${all.length}`);
  const malformed = WM.parseFields([{ id: "a", type: "SHORT_TEXT", label: "A", labels: "nope" }, { id: "b", type: "SHORT_TEXT", label: "B", labels: { en: "B", es: "Be" } }]);
  check("8: positive control — a malformed labels value is dropped and the field KEPT; a well-formed one survives", malformed.length === 2 && !("labels" in malformed[0]) && malformed[1].labels?.es === "Be");
  check("5 (unit): fieldLabel falls back to English when es is absent, and uses es when present", WM.fieldLabel({ id: "n", type: "SHORT_TEXT", label: "Phone" }, "es") === "Phone" && WM.fieldLabel({ id: "n", type: "SHORT_TEXT", label: "Phone", labels: { en: "Phone", es: "Teléfono" } }, "es") === "Teléfono");
  const src = readFileSync("app/practitioner/library/actions.ts", "utf8");
  const bodyIdx = src.indexOf("export async function setBookingWorksheet");
  const body = src.slice(bodyIdx, src.indexOf("\n}", bodyIdx));
  check("6 (static): setBookingWorksheet is the isIntake transaction — clear all, then set one", bodyIdx > 0 && /updateMany\(\{ where: \{ isBooking: true \}, data: \{ isBooking: false \} \}\)/.test(body) && /\$transaction\(/.test(body) && body.indexOf("updateMany") < body.indexOf("prisma.worksheet.update("));

  // ---- the built app ----
  try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  const env = { ...process.env, PORT: String(PORT), PLATFORM_DOMAIN: "c42.test", AUTH_SECRET: process.env.AUTH_SECRET || "gate-secret", AUTH_TRUST_HOST: "true" };
  const serverLog: string[] = [];
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (d) => serverLog.push(String(d))); server.stderr?.on("data", (d) => serverLog.push(String(d)));
  let browser: Browser | null = null;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
    browser = await chromium.launch({ executablePath: EXE, args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] });

    // ================= 1 =================
    log(`\n## 1 — defaults are today (no booking worksheet exists)`);
    check("fixture: the practice has NO isBooking worksheet", (await rawPrisma.worksheet.count({ where: { tenantId: T, isBooking: true } })) === 0);
    let f = await openForm(browser, "en");
    const renderedEn = await renderedFields(f.page);
    check("1: the EN form is field-for-field the pre-C42 form (ids, tags, types, order, optionality, labels, placeholder)", same(renderedEn, PRE_C42_FORM_EN), JSON.stringify(renderedEn).slice(0, 300));
    const l0 = await leads();
    let landed = await submitForm(f.page, { name: "Default Dana", email: "dana@c42.stranger.test", phone: "555-0100", note: "Just curious." });
    await f.ctx.close();
    let lead = await lastLead();
    check("1: the submission books (lands on /book/confirmed) and writes ONE Lead", landed.startsWith("/book/confirmed") && (await leads()) === l0 + 1, landed);
    check("1: the four pre-C42 Lead columns carry the typed values", lead?.name === "Default Dana" && lead?.email === "dana@c42.stranger.test" && lead?.phone === "555-0100" && lead?.note === "Just curious.");
    check("1: the snapshot carries the two defaults under their ids with q = the label as rendered", same(lead?.intakeAnswers, { phone: { q: "Phone", a: "555-0100" }, note: { q: "What brings you?", a: "Just curious." } }), JSON.stringify(lead?.intakeAnswers));
    f = await openForm(browser, "es");
    const renderedEs = await renderedFields(f.page);
    check("1: the ES form carries the catalogue's Spanish labels for all four (ruling 233's defect closed for these fields)", same(renderedEs, PRE_C42_FORM_ES), JSON.stringify(renderedEs).slice(0, 300));
    landed = await submitForm(f.page, { name: "Dana Es", email: "dana-es@c42.stranger.test", note: "Curiosidad." });
    await f.ctx.close();
    lead = await lastLead();
    check("1: an ES submission stores q in Spanish (Rule 0.8 — what THIS person was asked)", landed.startsWith("/book/confirmed") && same(lead?.intakeAnswers, { note: { q: "¿Qué te trae por aquí?", a: "Curiosidad." } }) && lead?.phone === null, JSON.stringify(lead?.intakeAnswers));

    // ================= 2 =================
    log(`\n## 2 — required is enforced by the server, not the attribute`);
    const wsId = await inT(() => BF.ensureBookingWorksheet(pract.id));
    const ws = await rawPrisma.worksheet.findUnique({ where: { id: wsId } });
    check("builder's first visit creates the booking worksheet FROM THE DEFAULT (same two fields), flagged isBooking, in the tenant", !!ws && ws.isBooking && ws.tenantId === T && same(WM.parseFields(ws.schema).map((x) => [x.id, x.required ?? false]), [["phone", false], ["note", false]]));
    check("…and a second visit returns the SAME worksheet (idempotent)", (await inT(() => BF.ensureBookingWorksheet(pract.id))) === wsId && (await rawPrisma.worksheet.count({ where: { tenantId: T, isBooking: true } })) === 1);
    await setSchema(wsId, WM.parseFields(ws!.schema).map((x) => (x.id === "note" ? { ...x, required: true } : x)));
    f = await openForm(browser, "en");
    const r2 = await renderedFields(f.page);
    check("2: her flip renders — note is now required on /book (the attribute is emitted for the experience)", r2.find((x) => x.id === "note")?.required === true && r2.find((x) => x.id === "note")?.label === "What brings you?");
    const l2 = await leads();
    landed = await submitForm(f.page, { name: "Reqd Rae", email: "rae@c42.stranger.test", phone: "555-0101" }, { stripRequired: true });
    await f.ctx.close();
    check("2: attribute stripped, note omitted → refused with error=missing&field=note", landed.startsWith("/book?") && /error=missing/.test(landed) && /field=note/.test(landed), landed);
    check("2: …and NOTHING was written", (await leads()) === l2);
    f = await openForm(browser, "en");
    landed = await submitForm(f.page, { name: "Reqd Rae", email: "rae@c42.stranger.test", phone: "555-0101", note: "Here is why." }, { stripRequired: true });
    await f.ctx.close();
    check("2: positive control — the same POST with the answer is accepted", landed.startsWith("/book/confirmed") && (await leads()) === l2 + 1, landed);
    const html2 = await (await fetch(`${BASE}/book?error=missing&field=note`, { headers: { "x-forwarded-host": HOST } })).text();
    check("2: the refusal's page copy names the problem (not the pre-C42 'add your name' text)", !/Please add your name, a valid email/.test(html2));

    // ================= 3 =================
    log(`\n## 3 — structural fields cannot be removed or doubled`);
    await setSchema(wsId, [{ id: "email", type: "SHORT_TEXT", label: "Email again", required: true }, { id: "note", type: "LONG_TEXT", label: "What brings you?", required: false }]);
    f = await openForm(browser, "en");
    const r3 = await renderedFields(f.page);
    const emailInputs = await f.page.locator('form [name="email"]').count();
    check("3: a hand-written schema claiming id \"email\" renders exactly ONE email input (the structural one) and no second", emailInputs === 1 && r3.filter((x) => x.id === "email").length === 1 && r3.find((x) => x.id === "email")?.type === "email");
    const l3 = await leads();
    landed = await submitForm(f.page, { name: "No Mail", note: "x" }, { stripRequired: true });
    await f.ctx.close();
    check("3: a POST without email is refused at the pre-C42 check (error=missing, no field)", /error=missing/.test(landed) && !/field=/.test(landed) && (await leads()) === l3, landed);
    await setSchema(wsId, []);
    f = await openForm(browser, "en");
    const r3b = await renderedFields(f.page);
    landed = await submitForm(f.page, { name: "Empty Schema", email: "empty@c42.stranger.test" });
    await f.ctx.close();
    check("3: an EMPTY schema renders name + email only and still books", same(r3b.map((x) => x.id), ["name", "email"]) && landed.startsWith("/book/confirmed") && (await leads()) === l3 + 1, landed);
    lead = await lastLead();
    check("3: …with phone/note null and an empty snapshot (nothing was asked)", lead?.phone === null && lead?.note === null && same(lead?.intakeAnswers, {}));

    // ================= 4 =================
    log(`\n## 4 — snapshots survive edits (Rule 0.8)`);
    const qId = "c42-q1";
    await setSchema(wsId, [{ id: qId, type: "SHORT_TEXT", label: "What brings you?", required: true }]);
    f = await openForm(browser, "en");
    landed = await submitForm(f.page, { name: "Snap One", email: "snap1@c42.stranger.test", [qId]: "Sleep." });
    await f.ctx.close();
    const lead4a = await lastLead();
    check("4: booked under L1 — stored q is L1", landed.startsWith("/book/confirmed") && (lead4a?.intakeAnswers as Record<string, { q: string }>)?.[qId]?.q === "What brings you?");
    await setSchema(wsId, [{ id: qId, type: "SHORT_TEXT", label: "Tell me a little about what's going on", required: true }]);
    f = await openForm(browser, "en");
    landed = await submitForm(f.page, { name: "Snap Two", email: "snap2@c42.stranger.test", [qId]: "Work." });
    await f.ctx.close();
    const lead4b = await lastLead();
    const a4a = (await rawPrisma.lead.findUnique({ where: { id: lead4a!.id } }))?.intakeAnswers as Record<string, { q: string }>;
    check("4: after the rename, the FIRST lead's stored q is still L1; the new lead's is L2", a4a?.[qId]?.q === "What brings you?" && (lead4b?.intakeAnswers as Record<string, { q: string }>)?.[qId]?.q === "Tell me a little about what's going on");
    const cookie = await signIn("pract@c42a.fixture.test");
    const leadsHtml = await (await fetch(`${BASE}/practitioner/leads`, { headers: { "x-forwarded-host": HOST, Cookie: cookie } })).text();
    check("4: the leads page shows BOTH questions as asked — L1 for the first lead, L2 for the second (q, never the live label)", /What brings you\?/.test(leadsHtml) && /Tell me a little about what/.test(leadsHtml) && (leadsHtml.match(/data-c42="answers"/g) ?? []).length >= 2, `${(leadsHtml.match(/data-c42="answers"/g) ?? []).length} answer blocks`);
    check("4: positive control — the leads page is hers (200, signed in), not the login page", /Leads/.test(leadsHtml) && !/name="password"/.test(leadsHtml));

    // ================= 5 =================
    log(`\n## 5 — Spanish falls back to English until she adds a label`);
    f = await openForm(browser, "es");
    let r5 = await renderedFields(f.page);
    check("5: en-only field requested in es → the English label renders (fallback), the structural labels are Spanish", r5.find((x) => x.id === qId)?.label === "Tell me a little about what's going on" && r5[0].label === "Tu nombre");
    await f.ctx.close();
    await setSchema(wsId, [{ id: qId, type: "SHORT_TEXT", label: "Tell me a little about what's going on", labels: { en: "Tell me a little about what's going on", es: "Cuéntame un poco de lo que está pasando" }, required: true }]);
    f = await openForm(browser, "es");
    r5 = await renderedFields(f.page);
    check("5: with es set → the Spanish label renders", r5.find((x) => x.id === qId)?.label === "Cuéntame un poco de lo que está pasando");
    landed = await submitForm(f.page, { name: "Sofía", email: "sofia@c42.stranger.test", [qId]: "Trabajo." });
    await f.ctx.close();
    lead = await lastLead();
    check("5: …and the stored q is the Spanish text this person was asked", landed.startsWith("/book/confirmed") && (lead?.intakeAnswers as Record<string, { q: string }>)?.[qId]?.q === "Cuéntame un poco de lo que está pasando");
    f = await openForm(browser, "en");
    r5 = await renderedFields(f.page);
    check("5: positive control — the same field in EN still renders the English label", r5.find((x) => x.id === qId)?.label === "Tell me a little about what's going on");
    await f.ctx.close();

    // ================= 6 =================
    log(`\n## 6 — exactly one booking form, through the real library sheet`);
    const wsB = await rawPrisma.worksheet.create({ data: { tenantId: T, title: "C42 Other Worksheet", schema: [{ id: "o1", type: "LONG_TEXT", label: "Other?" }] as object[], createdById: pract.id } });
    const ctx6 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx6.addCookies(cookie.split("; ").map((kv) => { const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: HOST, path: "/" }; }));
    const p6 = await ctx6.newPage();
    // The library ROOT shows folder tiles; ensureLibrary files every worksheet
    // into the default "Worksheets" folder on view. A first run looked at the
    // root and found no items — the items were one folder down.
    const { worksheetsFolderId } = await import("../../lib/library");
    await p6.goto(`${HOST_URL}/practitioner/library`, { waitUntil: "networkidle" });
    await p6.goto(`${HOST_URL}/practitioner/library?folder=${worksheetsFolderId(pract.id)}&view=list`, { waitUntil: "networkidle" });
    const itemsListed = await p6.getByText("C42 Other Worksheet").count();
    let viaUi = false;
    if (itemsListed > 0) {
      // the ⋯ button is a sibling of the item's link inside one row
      const row = p6.locator("div").filter({ has: p6.locator("a", { hasText: "C42 Other Worksheet" }) }).filter({ has: p6.getByRole("button", { name: "Item actions" }) }).last();
      await row.getByRole("button", { name: "Item actions" }).click();
      const act = p6.getByText("Set as booking form", { exact: false });
      if ((await act.count()) > 0) { await act.first().click(); await p6.waitForLoadState("networkidle"); await p6.waitForTimeout(800); viaUi = true; }
    }
    await ctx6.close();
    const bAfter = await rawPrisma.worksheet.findUnique({ where: { id: wsB.id } });
    const aAfter = await rawPrisma.worksheet.findUnique({ where: { id: wsId } });
    check("6: 'Set as booking form' on B (driven in the browser) sets B and CLEARS A — exactly one", viaUi && bAfter?.isBooking === true && aAfter?.isBooking === false, `ui=${viaUi} listed=${itemsListed} B=${bAfter?.isBooking} A=${aAfter?.isBooking}`);
    check("6: exactly one isBooking worksheet in the tenant", (await rawPrisma.worksheet.count({ where: { tenantId: T, isBooking: true } })) === 1);
    f = await openForm(browser, "en");
    const r6 = await renderedFields(f.page);
    await f.ctx.close();
    check("6: positive control — /book now renders B's question, not A's", r6.some((x) => x.id === "o1") && !r6.some((x) => x.id === qId));
    // put A back as the booking form for leg 7
    await rawPrisma.$transaction([rawPrisma.worksheet.updateMany({ where: { tenantId: T, isBooking: true }, data: { isBooking: false } }), rawPrisma.worksheet.update({ where: { id: wsId }, data: { isBooking: true } })]);

    // ================= 7 =================
    log(`\n## 7 — C37's answers and hers, both on one Lead`);
    const { applyBooking } = await import("../../lib/scheduling/external/ingest");
    const sofia = await rawPrisma.lead.findFirst({ where: { tenantId: T, email: "sofia@c42.stranger.test" } });
    const start7 = new Date(now.getTime() + 5 * 86_400_000); start7.setUTCHours(15, 0, 0, 0);
    const ext = await applyBooking({ provider: "calendly", externalId: "https://api.calendly.com/scheduled_events/C42-EXT", action: "scheduled", startAt: start7, endAt: new Date(start7.getTime() + 1_800_000), invitee: { name: "Sofía", email: "sofia@c42.stranger.test", phone: null }, intakeAnswers: { "ext:1": { q: "What brings you here?", a: "Sleep." } }, idempotencyKey: "c42-ext-1", occurredAt: now, raw: {} }, T, pract.id);
    const merged = (await rawPrisma.lead.findUnique({ where: { id: sofia!.id } }))?.intakeAnswers as Record<string, { q: string; a: unknown }>;
    check("7: the external booking landed (200) on the SAME lead (one row for that email)", ext.status === 200 && (await rawPrisma.lead.count({ where: { tenantId: T, email: "sofia@c42.stranger.test" } })) === 1, `${ext.status}`);
    check("7: her form's answer AND Calendly's are both on the lead — neither overwrote the other", merged?.[qId]?.q === "Cuéntame un poco de lo que está pasando" && same(merged?.["ext:1"], { q: "What brings you here?", a: "Sleep." }), JSON.stringify(merged));
    const leadsHtml7 = await (await fetch(`${BASE}/practitioner/leads`, { headers: { "x-forwarded-host": HOST, Cookie: cookie } })).text();
    const sofiaRow = await rawPrisma.lead.findUnique({ where: { id: sofia!.id }, include: { appointment: { select: { externalProvider: true, externalId: true } } } });
    const sofiaIdx = leadsHtml7.indexOf("sofia@c42.stranger.test");
    check("7: the leads page shows the external answers under their own 'From Calendly' heading", /From Calendly/.test(leadsHtml7) && /What brings you here\?/.test(leadsHtml7) && /data-c42="external-answers"/.test(leadsHtml7),
      `appointmentId=${sofiaRow?.appointmentId} provider=${sofiaRow?.appointment?.externalProvider} ext=${/data-c42="external-answers"/.test(leadsHtml7)} heading=${/From (Calendly|Acuity|their booking tool)/.exec(leadsHtml7)?.[0]} | ${leadsHtml7.slice(sofiaIdx, sofiaIdx + 700).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)}`);
    const ext2 = await applyBooking({ provider: "calendly", externalId: "https://api.calendly.com/scheduled_events/C42-EXT-2", action: "scheduled", startAt: new Date(start7.getTime() + 86_400_000), endAt: new Date(start7.getTime() + 86_400_000 + 1_800_000), invitee: { name: "Sofía", email: "sofia@c42.stranger.test", phone: null }, intakeAnswers: { "ext:1": { q: "What brings you here?", a: "Still sleep." } }, idempotencyKey: "c42-ext-2", occurredAt: now, raw: {} }, T, pract.id);
    const merged2 = (await rawPrisma.lead.findUnique({ where: { id: sofia!.id } }))?.intakeAnswers as Record<string, { q: string; a: unknown }>;
    check("7: positive control — a later external booking REFRESHES the ext block and still keeps hers", ext2.status === 200 && merged2?.["ext:1"]?.a === "Still sleep." && merged2?.[qId]?.q === "Cuéntame un poco de lo que está pasando");

    // ================= settings entry + builder affordances =================
    log(`\n## §2.7 — the entry points exist and are gated behind isBooking`);
    const settings = await (await fetch(`${BASE}/practitioner/settings`, { headers: { "x-forwarded-host": HOST, Cookie: cookie } })).text();
    check("settings lists 'Booking questions' → /practitioner/settings/booking-questions", /Booking questions/.test(settings) && /\/practitioner\/settings\/booking-questions/.test(settings));
    const entry = await fetch(`${BASE}/practitioner/settings/booking-questions`, { headers: { "x-forwarded-host": HOST, Cookie: cookie }, redirect: "manual" });
    check("the entry route redirects to the booking worksheet's builder", entry.status === 307 && (entry.headers.get("location") ?? "").endsWith(`/practitioner/worksheets/${wsId}`), `${entry.status} ${entry.headers.get("location")}`);
    const builder = await (await fetch(`${BASE}/practitioner/worksheets/${wsId}`, { headers: { "x-forwarded-host": HOST, Cookie: cookie } })).text();
    check("the builder shows the two locked structural lines, the Spanish label input and 'Preview as a visitor' → /book", /data-c42-structural="name"/.test(builder) && /data-c42-structural="email"/.test(builder) && /name="labelEs"/.test(builder) && /data-c42="preview-visitor"/.test(builder) && !/Create a Spanish version/.test(builder));
    const builderB = await (await fetch(`${BASE}/practitioner/worksheets/${wsB.id}`, { headers: { "x-forwarded-host": HOST, Cookie: cookie } })).text();
    check("positive control — an ordinary worksheet's builder has NONE of them (additive, gated)", !/data-c42-structural/.test(builderB) && !/name="labelEs"/.test(builderB) && /Preview as a client/.test(builderB));
    const noteLog = serverLog.join("").match(/Invalid Server Actions request|Error:/g) ?? [];
    check("the server log carries no 'Invalid Server Actions request' and no unhandled Error during the walk", noteLog.length === 0, `${noteLog.length}`);
  } finally {
    try { await browser?.close(); } catch { /* */ }
    try { server.kill(); } catch { /* */ }
    try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  }
  await cleanup();
  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync("audits/forms", { recursive: true }); writeFileSync("audits/forms/BOOKING-LOG.md", report.join("\n") + "\n");
  await rawPrisma.$disconnect(); if (failed > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); await rawPrisma.$disconnect(); process.exit(1); });
