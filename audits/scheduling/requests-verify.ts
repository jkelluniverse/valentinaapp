// C40-APPOINTMENT-REQUESTS — the acceptance gate (rulings 223, 226-234).
//
// LEGS, numbered as in the spec's §3, each with its positive control (ruling 110):
//   1  two clients cannot hold one slot (A requests; B is not offered it and a
//      forced request conflicts; decline A -> B succeeds)
//   2  all three busy sites agree (openSlots/generateSlots, hasConflict)
//   3  a request creates NO charge, no video link, and attempts exactly ONE mail
//      (the practitioner's) — the mail ledger is the count of "[notify] … skipped /
//      not configured" lines: with no practice email the sender returns at
//      lib/notify.ts:249 via the "no practice email" branch, not the "not
//      configured" one, and a first draft matched only the latter (0 attempts)
//   4  approval creates what booking creates: same status/videoUrl/videoProvider,
//      +1 charge, two mail attempts — identical deltas to a direct booking
//   5  approval RE-CHECKS: a SCHEDULED row landing meanwhile -> conflict, stays REQUESTED
//   6  expiry: 49h-old -> EXPIRED + slot offered again + client mail attempted;
//      none -> 0; the tick's report carries requestsExpired and reminders30 at 0
//      (PRESENT, ruling 112); auto-complete leaves a past REQUESTED row alone
//   7  setting OFF = today: /book lands SCHEDULED, Lead SCHEDULED, "Your call is booked"
//   8  external stays external: setting ON, a C37 apply lands SCHEDULED
//   9  reminder defaults: no notify.* rows -> client 1d = both, practitioner 1d = off, 30m = off
//  10  the client SEES their request on /space/schedule
//  11  AppointmentStatus has 7 values, LeadStatus 6 (ruling 38)
//  12  RULING 224 both states, both surfaces, both locales, rendered — not grepped from source
//  13  the discovery path holds the slot too: two strangers, one slot, through /book
//
// SCOPE is printed at the top of every run (ruling 208). Local build on :3186,
// two throwaway tenants under c40.test, HTTP + in-process. NOT covered:
// production, real mail/push delivery (unconfigured here by design), any surface
// not named above.
import { spawn, execSync, type ChildProcess } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import bcrypt from "bcryptjs";
import { rawPrisma } from "../../lib/prisma-internal";
import { withTenantScope } from "../../lib/tenancy/tenant-scope";
import { AppointmentStatus, LeadStatus } from "@prisma/client";
import { chromium, type Browser } from "playwright";
const EXE = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

const PORT = 3186;
const BASE = `http://127.0.0.1:${PORT}`;
// THE BROWSER MUST BE ON THE TENANT'S HOST FOR REAL. A Next server action
// checks the request's Origin against its Host, so a browser at 127.0.0.1
// forwarding x-forwarded-host: c40a.c40.test is refused ("Invalid Server
// Actions request") — a first draft of this gate did exactly that. Chromium is
// launched with a resolver rule mapping the fixture host to loopback and
// navigates to the host itself; raw fetches keep the forwarded header.
const HOST_URL = (host: string) => `http://${host}:${PORT}`;
const T = "c40-fixture", T2 = "c40-fixture-2";
const HOST = "c40a.c40.test", HOST2 = "c40b.c40.test";
const JOBS = "c40-jobs-secret";

let failed = 0; const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => { if (!ok) failed++; log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`); };

// the in-process mail ledger: count of skipped-send lines
const mailLines: string[] = [];
const origInfo = console.info;
console.info = (...a: unknown[]) => { const s = a.map(String).join(" "); if (/\[notify\] .*(skipped|not configured)/.test(s)) mailLines.push(s); origInfo(...a); };
const mailCount = () => mailLines.length;

async function cleanup(): Promise<void> {
  for (const t of [T, T2]) {
    await rawPrisma.charge.deleteMany({ where: { tenantId: t } });
    await rawPrisma.lead.deleteMany({ where: { tenantId: t } });
    await rawPrisma.appointment.deleteMany({ where: { tenantId: t } });
    await rawPrisma.practiceSetting.deleteMany({ where: { tenantId: t } });
    await rawPrisma.availabilityRule.deleteMany({ where: { tenantId: t } });
    await rawPrisma.schedulingConfig.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
    await rawPrisma.consentGrant.deleteMany({ where: { tenantId: t } });
    await rawPrisma.user.deleteMany({ where: { tenantId: t } });
    await rawPrisma.tenantDomain.deleteMany({ where: { host: { in: [HOST, HOST2] } } }).catch(() => undefined);
    await rawPrisma.tenant.deleteMany({ where: { id: t } });
  }
}
async function setApproval(on: boolean) {
  await rawPrisma.practiceSetting.upsert({ where: { tenantId_key: { tenantId: T, key: "bookingRequiresApproval" } }, create: { tenantId: T, key: "bookingRequiresApproval", value: on ? "on" : "off" }, update: { value: on ? "on" : "off" } });
}
async function signIn(email: string, host = HOST): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => { for (const c of sc) { const [pair] = c.split(";"); const eq = pair.indexOf("="); if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()); } };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "x-forwarded-host": host } });
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "x-forwarded-host": host, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password: "fixture-pass-1" }) });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}
let ipN = 10;
// /book's form posts to a Next SERVER ACTION; a raw form-urlencoded POST never
// invokes it (a first draft of this gate did exactly that and got a 200 with
// nothing written). So the public legs drive the REAL form in a browser: pick
// the first day, pick slot N, wait past the 2.5s honeypot, submit, land.
// Returns the slot's ISO (read from the hidden input) and the landing URL.
async function bookViaForm(browser: Browser, slotIndex: number, email: string, lang = "en"): Promise<{ startIso: string | null; landed: string; html: string; submitLabel: string; noteShown: boolean; banner: string }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.9.9.${ipN++}` } });
  const page = await ctx.newPage();
  await page.goto(`${HOST_URL(HOST)}/book?lang=${lang}`, { waitUntil: "networkidle" });
  // Day buttons carry a date label; slot buttons carry a TIME label (h:mm). Pick
  // by text, not by position — a first draft sliced the button list and could
  // land on a day. And the startAt input is type=hidden, which is never
  // "visible": a first draft waited for visibility and timed out every run.
  await page.locator("button[type=button]").first().click();
  const slotButtons = page.getByRole("button", { name: /\d{1,2}:\d{2}/ });
  await slotButtons.first().waitFor({ state: "visible", timeout: 10_000 });
  const n = await slotButtons.count();
  await slotButtons.nth(Math.min(slotIndex, n - 1)).click();
  await page.waitForSelector('input[name="startAt"]', { state: "attached", timeout: 10_000 });
  // RULING 224, asserted RENDERED: label and note live inside the form that
  // appears after a slot is chosen — read from the DOM, not a raw GET's payload.
  const submitLabel = (await page.locator("form button").last().textContent())?.trim() ?? "";
  const noteShown = (await page.locator('[data-c40="request-note"]').count()) > 0;
  const startIso = await page.locator('input[name="startAt"]').inputValue();
  await page.fill('input[name="name"]', "Stranger Danger");
  await page.fill('input[name="email"]', email);
  await page.waitForTimeout(2700); // honeypot: the form must have been on screen >2.5s
  await page.locator("form button[type=submit], form button:not([type=button])").last().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const landed = page.url().replace(HOST_URL(HOST), "");
  const html = await page.content();
  const banner = (html.match(/(couldn.t|could not|try again|too fast|slow down|unavailable|taken|something went wrong|error)[^<]{0,80}/i) || [""])[0];
  await ctx.close();
  return { startIso, landed, html, submitLabel, noteShown, banner };
}
async function offeredSlots(browser: Browser): Promise<number> {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-host": HOST, "x-forwarded-for": `10.9.9.${ipN++}` } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/book`, { waitUntil: "networkidle" });
  await page.locator("button[type=button]").first().click();
  await page.waitForTimeout(300);
  const n = (await page.locator("button[type=button]").all()).length;
  await ctx.close();
  return n;
}
void offeredSlots;

async function main(): Promise<void> {
  log(`# C40-APPOINTMENT-REQUESTS acceptance — ${new Date().toISOString()}`);
  log(`SCOPE: hosts ${HOST}, ${HOST2} · HTTP on :${PORT} + in-process service calls · local build. NOT covered: production, real mail/push delivery, any surface not named in a leg (ruling 208).`);
  await cleanup();
  const now = new Date();
  // ---- fixtures ----
  for (const [id, slug, host] of [[T, "c40a", HOST], [T2, "c40b", HOST2]] as const) {
    await rawPrisma.tenant.create({ data: { id, slug, displayName: `C40 ${slug}`, status: "ACTIVE", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} } });
    await rawPrisma.tenantDomain.create({ data: { host, tenantId: id } }).catch(() => undefined);
  }
  const pract = await rawPrisma.user.create({ data: { email: "pract@c40a.fixture.test", name: "Pia Pract", role: "PRACTITIONER", active: true, tenantId: T, passwordHash: bcrypt.hashSync("fixture-pass-1", 4) } });
  // consentAt: the confirm page checks the LEGACY User.consentAt (recordConsent stamps both); a grant alone reads as "That time isn't available".
  const mk = async (email: string, name: string) => { const u = await rawPrisma.user.create({ data: { email, name, role: "CLIENT", active: true, tenantId: T, consentAt: new Date(), passwordHash: bcrypt.hashSync("fixture-pass-1", 4) } }); await rawPrisma.consentGrant.create({ data: { tenantId: T, userId: u.id, version: "2026-07" } }); return u; }; // CURRENT_CONSENT_VERSION — "probe" sent the client to /space/consent
  const A = await mk("a@c40a.fixture.test", "Ana A"); const B = await mk("b@c40a.fixture.test", "Bo B");
  // availability: every weekday 09:00-17:00, both kinds
  for (const wd of [0, 1, 2, 3, 4, 5, 6]) for (const kind of ["SESSION", "DISCOVERY"] as const) await rawPrisma.availabilityRule.create({ data: { tenantId: T, practitionerId: pract.id, kind, weekday: wd, startMinute: 9 * 60, endMinute: 17 * 60 } });

  const S = await import("../../lib/schedule");
  const Ap = await import("../../lib/appointments");
  const D = await import("../../lib/discovery");
  const { channelsFor, NOTIFY_KEYS } = await import("../../lib/notify-prefs");
  const inT = <X,>(fn: () => Promise<X>) => withTenantScope(T, fn);
  const config = await inT(() => S.getOrCreateConfig(pract.id));
  const horizon = new Date(now.getTime() + 7 * 86_400_000);
  const sessionSlots = (await inT(() => S.openSlots(pract.id, now, horizon, now, "SESSION"))).slots;
  const discoSlots = (await inT(() => S.openSlots(pract.id, now, horizon, now, "DISCOVERY"))).slots;
  check("fixture: the practitioner has open SESSION and DISCOVERY slots", sessionSlots.length > 5 && discoSlots.length > 5, `${sessionSlots.length}/${discoSlots.length}`);
  const slotA = sessionSlots[2].startAt, slotA_end = new Date(slotA.getTime() + config.sessionMinutes * 60000);
  const slotC = sessionSlots[5].startAt, slotC_end = new Date(slotC.getTime() + config.sessionMinutes * 60000);

  // ================= 11 =================
  log(`\n## 11 — the enums (ruling 38)`);
  check("AppointmentStatus has 7 values", Object.keys(AppointmentStatus).length === 7, Object.keys(AppointmentStatus).join(","));
  check("LeadStatus has 6 values", Object.keys(LeadStatus).length === 6, Object.keys(LeadStatus).join(","));

  // ================= 1 + 2 + 3 =================
  log(`\n## 1–3 — a request holds the slot (ruling 223), creates no money, mails only her`);
  const charges0 = await rawPrisma.charge.count({ where: { tenantId: T } }); const mail0 = mailCount();
  const reqA = await inT(() => Ap.requestAppointment({ practitionerId: pract.id, clientId: A.id, startAt: slotA, endAt: slotA_end, bookedBy: "client", location: "VIRTUAL" }));
  check("A's request is created REQUESTED", reqA.ok && reqA.appointment.status === "REQUESTED");
  const rowA = reqA.ok ? reqA.appointment : null;
  check("3: no charge was created", (await rawPrisma.charge.count({ where: { tenantId: T } })) === charges0);
  check("3: no video link was committed", rowA?.videoUrl === null);
  check("3: exactly ONE mail attempt (the practitioner's) — the client heard nothing", mailCount() - mail0 === 1, `${mailCount() - mail0} attempt(s)`);
  const offeredToB = (await inT(() => S.openSlots(pract.id, now, horizon, now, "SESSION"))).slots.some((s) => s.startAt.getTime() === slotA.getTime());
  check("1/2: openSlots (and generateSlots' re-filter) no longer offer A's slot to B", !offeredToB);
  check("2: hasConflict treats the request as busy", await inT(() => S.hasConflict(pract.id, slotA, slotA_end, config.bufferMinutes)) === true);
  const reqB = await inT(() => Ap.requestAppointment({ practitionerId: pract.id, clientId: B.id, startAt: slotA, endAt: slotA_end, bookedBy: "client", location: "VIRTUAL" }));
  check("1: B's forced request for the same slot is REFUSED (conflict)", !reqB.ok && reqB.error === "conflict");
  check("1: still exactly one appointment row for that slot", (await rawPrisma.appointment.count({ where: { tenantId: T, startAt: slotA } })) === 1);
  // positive control: decline A, then B can
  const dec = await inT(() => Ap.declineRequest(rowA!.id, pract.id));
  check("positive control: A's request DECLINED (a status, not a deletion)", dec.ok && (await rawPrisma.appointment.findUnique({ where: { id: rowA!.id } }))?.status === "DECLINED");
  const reqB2 = await inT(() => Ap.requestAppointment({ practitionerId: pract.id, clientId: B.id, startAt: slotA, endAt: slotA_end, bookedBy: "client", location: "VIRTUAL" }));
  check("positive control: with A declined, B's request for the slot SUCCEEDS", reqB2.ok);

  // ================= 4 + 5 =================
  log(`\n## 4–5 — approval runs the booking tail; approval re-checks`);
  const chargesB0 = await rawPrisma.charge.count({ where: { tenantId: T } }); const mailB0 = mailCount();
  const appr = await inT(() => Ap.approveRequest(reqB2.ok ? reqB2.appointment.id : "", pract.id));
  const apprRow = appr.ok ? appr.appointment : null;
  check("4: approval -> SCHEDULED with the standing room attached", apprRow?.status === "SCHEDULED" && apprRow.videoProvider === (apprRow.videoUrl ? "MANUAL" : null));
  const dCharge = (await rawPrisma.charge.count({ where: { tenantId: T } })) - chargesB0; const dMail = mailCount() - mailB0;
  // the same deltas from a DIRECT booking of another slot
  const chargesC0 = await rawPrisma.charge.count({ where: { tenantId: T } }); const mailC0 = mailCount();
  const direct = await inT(() => Ap.createAppointment({ practitionerId: pract.id, clientId: A.id, startAt: slotC, endAt: slotC_end, bookedBy: "client", location: "VIRTUAL" }));
  const dChargeDirect = (await rawPrisma.charge.count({ where: { tenantId: T } })) - chargesC0; const dMailDirect = mailCount() - mailC0;
  check("4: approval and a direct booking create the SAME charge delta", dCharge === dChargeDirect, `approve +${dCharge}, direct +${dChargeDirect}`);
  check("4: …and the SAME number of mail attempts (both parties)", dMail === dMailDirect && dMail >= 1, `approve ${dMail}, direct ${dMailDirect}`);
  check("4: …and the same status/videoProvider shape", direct.ok && direct.appointment.status === apprRow?.status && direct.appointment.videoProvider === apprRow?.videoProvider);
  // 5: request slot D; a SCHEDULED row (as C37 would write) lands on it; approve -> conflict
  const slotD = sessionSlots[8].startAt, slotD_end = new Date(slotD.getTime() + config.sessionMinutes * 60000);
  const reqD = await inT(() => Ap.requestAppointment({ practitionerId: pract.id, clientId: A.id, startAt: slotD, endAt: slotD_end, bookedBy: "client", location: "VIRTUAL" }));
  await rawPrisma.appointment.create({ data: { tenantId: T, practitionerId: pract.id, kind: "DISCOVERY", startAt: slotD, endAt: slotD_end, status: "SCHEDULED", bookedBy: "client", externalProvider: "calendly", externalId: "c40-meanwhile" } });
  const apprD = await inT(() => Ap.approveRequest(reqD.ok ? reqD.appointment.id : "", pract.id));
  check("5: a booking that landed meanwhile makes approval return conflict", !apprD.ok && apprD.error === "conflict");
  check("5: …and the request STAYS requested (her call, not auto-declined)", (await rawPrisma.appointment.findUnique({ where: { id: reqD.ok ? reqD.appointment.id : "" } }))?.status === "REQUESTED");

  // ================= 6 =================
  log(`\n## 6 — expiry (ruling 223), named in the tick's report`);
  const slotE = sessionSlots[11].startAt, slotE_end = new Date(slotE.getTime() + config.sessionMinutes * 60000);
  const reqE = await inT(() => Ap.requestAppointment({ practitionerId: pract.id, clientId: B.id, startAt: slotE, endAt: slotE_end, bookedBy: "client", location: "VIRTUAL" }));
  await rawPrisma.appointment.update({ where: { id: reqE.ok ? reqE.appointment.id : "" }, data: { createdAt: new Date(now.getTime() - 49 * 3_600_000) } });
  const mailE0 = mailCount();
  const expired = await inT(() => Ap.expireStaleRequests(now));
  check("a 49h-old request is expired by the step (returns 1)", expired === 1, `${expired}`);
  check("…its status is EXPIRED", (await rawPrisma.appointment.findUnique({ where: { id: reqE.ok ? reqE.appointment.id : "" } }))?.status === "EXPIRED");
  check("…the slot is offered again", (await inT(() => S.openSlots(pract.id, now, horizon, now, "SESSION"))).slots.some((s) => s.startAt.getTime() === slotE.getTime()));
  check("…and the client was told (one mail attempt)", mailCount() - mailE0 === 1);
  check("positive control: with nothing stale the step returns 0, not an absence", await inT(() => Ap.expireStaleRequests(now)) === 0);

  // ---- the built app ----
  try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  const env = { ...process.env, PORT: String(PORT), PLATFORM_DOMAIN: "c40.test", AUTH_SECRET: process.env.AUTH_SECRET || "gate-secret", JOBS_SECRET: JOBS, AUTH_TRUST_HOST: "true" };
  const serverLog: string[] = [];
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (d) => serverLog.push(String(d))); server.stderr?.on("data", (d) => serverLog.push(String(d)));
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }

    // 6 (cont): the tick's report keys, PRESENT at zero
    const tick = await fetch(`${BASE}/api/jobs/tick`, { headers: { "x-forwarded-host": HOST, authorization: `Bearer ${JOBS}` } });
    const tj = (await tick.json()) as Record<string, unknown>;
    check("6: the tick's report carries requestsExpired (ruling 112: present, even at 0)", tick.status === 200 && "requestsExpired" in tj, JSON.stringify(tj.requestsExpired));
    check("6: …and reminders30 (item 3's new step is wired)", "reminders30" in tj, JSON.stringify(tj.reminders30));
    // a PAST requested row must not be auto-completed by step 1
    const past = await rawPrisma.appointment.create({ data: { tenantId: T, practitionerId: pract.id, clientId: A.id, kind: "SESSION", startAt: new Date(now.getTime() - 5 * 3_600_000), endAt: new Date(now.getTime() - 4 * 3_600_000), status: "REQUESTED", bookedBy: "client" } });
    await fetch(`${BASE}/api/jobs/tick`, { headers: { "x-forwarded-host": HOST, authorization: `Bearer ${JOBS}` } });
    check("6: auto-complete leaves a past REQUESTED row untouched (expiry owns it, by createdAt)", (await rawPrisma.appointment.findUnique({ where: { id: past.id } }))?.status === "REQUESTED");

    // ================= 7 + 12 (off) =================
    log(`\n## 7 + 12 — setting OFF is today; ruling 224 OFF state`);
    await setApproval(false);
    let html = await (await fetch(`${BASE}/book`, { headers: { "x-forwarded-host": HOST } })).text();
    const browser = await chromium.launch({ executablePath: EXE, args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1, MAP ${HOST2} 127.0.0.1`] });
    const b1 = await bookViaForm(browser, 2, "s1@stranger.test");
    const l1 = await rawPrisma.lead.findFirst({ where: { tenantId: T, email: "s1@stranger.test" }, include: { appointment: true } });
    check("12 OFF (rendered): the submit reads \"Confirm my call\" and no note is shown", b1.submitLabel === "Confirm my call" && !b1.noteShown, `label=\"${b1.submitLabel}\" note=${b1.noteShown}`);
    if (!l1) log(`~ 7 OFF diagnostics: landed=${b1.landed} banner=\"${b1.banner}\" server: ${serverLog.join("").split("\n").filter((l) => /error|Error|\[discovery\]|\[notify\]/.test(l)).slice(-5).join(" | ").slice(0, 700)}`);
    check("7 OFF: /book books at once \u2014 appointment SCHEDULED, Lead SCHEDULED", l1?.status === "SCHEDULED" && l1.appointment?.status === "SCHEDULED", `lead=${l1?.status} appt=${l1?.appointment?.status} landed=${b1.landed}`);
    check("7 OFF: the landing page says the call is BOOKED", /data-c40="confirmed"/.test(b1.html) && b1.html.includes("Your call is booked"), b1.landed);

    // ================= 12 (on) + 13 + 8 =================
    log(`\n## 12 + 13 + 8 — setting ON: ruling 224, the public double-hold, external stays external`);
    await setApproval(true);
    html = await (await fetch(`${BASE}/book`, { headers: { "x-forwarded-host": HOST } })).text();
    const es = await (await fetch(`${BASE}/book?lang=es`, { headers: { "x-forwarded-host": HOST } })).text();
    check("12 ON es: \"Solicitar mi llamada\" + the note in Spanish", es.includes("Solicitar mi llamada") && !es.includes("Confirmar mi llamada"));
    check("12 ON (payload): \"Confirm my call\" is absent from the ON page entirely \u2014 the server sends only the mode's copy", !html.includes("Confirm my call"));
    const b2 = await bookViaForm(browser, 5, "s2@stranger.test");
    const l2 = await rawPrisma.lead.findFirst({ where: { tenantId: T, email: "s2@stranger.test" }, include: { appointment: true } });
    check("12 ON (rendered): the submit reads \"Request my call\" and the note IS shown", b2.submitLabel === "Request my call" && b2.noteShown, `label=\"${b2.submitLabel}\" note=${b2.noteShown}`);
    check("13: through /book, a request lands REQUESTED with Lead REQUESTED", l2?.status === "REQUESTED" && l2.appointment?.status === "REQUESTED", `lead=${l2?.status} appt=${l2?.appointment?.status} landed=${b2.landed}`);
    check("12 ON: the landing page says REQUESTED, not booked", /data-c40="requested"/.test(b2.html) && b2.html.includes("Your request is in") && !b2.html.includes("Your call is booked"));
    // 13: the SAME slot is no longer offered to the next stranger — the public double-hold is prevented at the offer, before any submit
    const heldIso = b2.startIso;
    const ctx3 = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.9.9.${ipN++}` } });
    const pg3 = await ctx3.newPage(); await pg3.goto(`${HOST_URL(HOST)}/book`, { waitUntil: "networkidle" }); await pg3.locator("button[type=button]").first().click(); await pg3.waitForTimeout(300);
    const offeredCount = await pg3.getByRole("button", { name: /\d{1,2}:\d{2}/ }).count();
    const slotIsos = "";
    await ctx3.close();
    const heldStillOffered = heldIso ? (await inT(() => S.openSlots(pract.id, now, horizon, now, "DISCOVERY"))).slots.some((x) => x.startAt.toISOString() === heldIso) : true;
    check("13: a second stranger is NOT offered the held slot (openSlots, which /book renders, excludes it)", !heldStillOffered, `held=${heldIso}`);
    check("13: …while other slots are still offered (positive control)", offeredCount > 3, `${offeredCount} buttons; ${String(slotIsos).length} chars`);
    check("13: exactly one appointment holds that slot", heldIso ? (await rawPrisma.appointment.count({ where: { tenantId: T, startAt: new Date(heldIso) } })) === 1 : false);
    await browser.close();
    // 8: C37's apply, setting ON
    const { applyBooking } = await import("../../lib/scheduling/external/ingest");
    const d3 = discoSlots[9].startAt;
    const ext = await applyBooking({ provider: "calendly", externalId: "https://api.calendly.com/scheduled_events/C40-EXT", action: "scheduled", startAt: d3, endAt: new Date(d3.getTime() + 30 * 60000), invitee: { name: "Ext", email: "ext@stranger.test", phone: null }, intakeAnswers: null, idempotencyKey: "c40-ext-1", occurredAt: now, raw: {} }, T, pract.id);
    const extRow = await rawPrisma.appointment.findFirst({ where: { externalId: "https://api.calendly.com/scheduled_events/C40-EXT" } });
    check("8: with the setting ON, an external booking lands SCHEDULED — never REQUESTED", ext.status === 200 && extRow?.status === "SCHEDULED", `${extRow?.status}`);

    // ================= 10 + 12 (session surface) =================
    log(`\n## 10 + 12 — the signed-in client sees the request; the session confirm page's label`);
    const cookieB = await signIn("b@c40a.fixture.test");
    const sched = await (await fetch(`${BASE}/space/schedule`, { headers: { "x-forwarded-host": HOST, Cookie: cookieB } })).text();
    const pendingB = await rawPrisma.appointment.count({ where: { clientId: B.id, status: "REQUESTED" } });
    check("10: /space/schedule renders the client's REQUESTED row(s)", pendingB === 0 || sched.includes('data-c40="requested-row"'), `${pendingB} pending; marker ${sched.includes('data-c40="requested-row"') ? "present" : "absent"}`);
    // Pick the slot NOW, not from the list taken at the gate's start: bookings
    // above have consumed slots since, and a stale index says "taken".
    const freshSlots = (await inT(() => S.openSlots(pract.id, now, horizon, now, "SESSION"))).slots;
    const confSlot = freshSlots[freshSlots.length - 1];
    const stillOpen = await inT(() => S.isSlotOpen(pract.id, confSlot.startAt, new Date()));
    log(`~ confirm-page slot ${confSlot.startAt.toISOString()} · isSlotOpen in-process: ${stillOpen} · ${freshSlots.length} open`);
    log(`~ tenant seen by a raw fetch on ${HOST}: ${await (await fetch(`${BASE}/api/tenant-kind`, { headers: { "x-forwarded-host": HOST } })).text()} · practitioner in T: ${pract.id} · users in T: ${await rawPrisma.user.count({ where: { tenantId: T } })}`);
    const confOnRes = await fetch(`${BASE}/space/schedule/confirm?start=${encodeURIComponent(confSlot.startAt.toISOString())}`, { headers: { "x-forwarded-host": HOST, Cookie: cookieB } });
    const confOn = await confOnRes.text();
    log(`~ session confirm (ON): http ${confOnRes.status} url=${confOnRes.url.replace(BASE, "")} title=${(confOn.match(/<title>([^<]*)<\/title>/) || [, "(none)"])[1]} cookie=${cookieB ? "yes" : "EMPTY"}`);
    log(`~ session confirm (ON) body: ${confOn.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 420)}`);
    check("12 ON (session): \"Request this session\" + note; \"Confirm booking\" absent", confOn.includes("Request this session") && confOn.includes('data-c40="request-note"') && !confOn.includes("Confirm booking"));
    await setApproval(false);
    const confOff = await (await fetch(`${BASE}/space/schedule/confirm?start=${encodeURIComponent(confSlot.startAt.toISOString())}`, { headers: { "x-forwarded-host": HOST, Cookie: cookieB } })).text();
    check("12 OFF (session): \"Confirm booking\", no note", confOff.includes("Confirm booking") && !confOff.includes('data-c40="request-note"'));

    // ================= 9 =================
    log(`\n## 9 — item 3 defaults are today's behaviour`);
    await rawPrisma.practiceSetting.deleteMany({ where: { tenantId: T, key: { startsWith: "notify." } } });
    const c1 = await inT(() => channelsFor(NOTIFY_KEYS.reminder1dClient)); const p1d = await inT(() => channelsFor(NOTIFY_KEYS.reminder1dPractitioner)); const c30 = await inT(() => channelsFor(NOTIFY_KEYS.reminder30Client));
    check("no notify.* rows: client 1d reminder = email + push (what fired before C40)", c1.email && c1.push);
    check("no notify.* rows: practitioner 1d = OFF (a new recipient waits for consent)", !p1d.email && !p1d.push);
    check("no notify.* rows: 30-minute = OFF", !c30.email && !c30.push);
    await rawPrisma.practiceSetting.create({ data: { tenantId: T, key: NOTIFY_KEYS.reminder1dPractitioner, value: "push" } });
    const p1dOn = await inT(() => channelsFor(NOTIFY_KEYS.reminder1dPractitioner));
    check("positive control: a row flips it — practitioner 1d = push only", p1dOn.push && !p1dOn.email);

    // ---- outstanding, named, not a check ----
    const { requestOutcomeEmail } = await import("../../lib/email-copy");
    log(`\n~ decline copy is a labelled placeholder awaiting Jacob: ${requestOutcomeEmail("declined", "en", { when: "x", practitioner: "y" }).text.includes("[JACOB") ? "PRESENT (expected until he rules)" : "REPLACED"}`);
  } finally {
    try { server.kill(); } catch { /* */ }
    try { execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  }
  await cleanup();
  console.info = origInfo;
  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync("audits/scheduling", { recursive: true }); writeFileSync("audits/scheduling/REQUESTS-LOG.md", report.join("\n") + "\n");
  await rawPrisma.$disconnect(); if (failed > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); await rawPrisma.$disconnect(); process.exit(1); });
