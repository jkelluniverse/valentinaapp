// C37-EXTERNAL-SCHEDULING — the acceptance gate.
//
// WHAT IT PROVES, and which ruling each leg answers to:
//
//   RULING 195 — attribution comes from the EVENT, never the request host.
//   RULING 196 — Acuity's per-connection PATH selects the key and does NOT
//                grant trust. Both directions, plus an unknown path.
//   RULING 197 — connection health is a STATUS the practitioner reads. Only
//                unambiguous breakage sets NEEDS_ATTENTION; silence does not.
//   RULING 193 — a synced booking makes an Appointment and a lightweight
//                contact, and NEVER a ClientProfile.
//   RULING 198 — the evidence boundary is GATED, not asserted in a comment:
//                a synced booking yields ZERO RecordItem, the citation path
//                demonstrably works anyway (positive control), and promoted
//                material IS citable.
//   RULING 110 — every absence check is paired with a positive control, so
//                "nothing found" can never be indistinguishable from
//                "nothing looked".
//
// HONEST LIMITATIONS (ruling 109):
//   · CLI-only. It drives the ingress SERVICES directly, so it proves the
//     resolution, verification, attribution and apply logic. It does NOT prove
//     Next.js binds the [token] path segment — that is framework behaviour, and
//     a gate cannot prove a deployment seam anyway (ruling 76).
//   · The provider signature SCHEMES are transcribed from Calendly's and
//     Acuity's published documentation, read 2026-09-28. This gate proves we
//     verify what we believe the scheme to be; it cannot prove the scheme.
//   · It never contacts a provider. No network.
//
//   npx tsx audits/scheduling/external-verify.ts
import { createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { rawPrisma } from "../../lib/prisma-internal";
import { withTenantScope } from "../../lib/tenancy/tenant-scope";
import { encryptToken, newIngressToken } from "../../lib/scheduling/external/connection";
import { ingestCalendlyEvent, ingestAcuityEvent } from "../../lib/scheduling/external/ingress";
import { getClientRecord } from "../../lib/client-record";

const T = "c37-fixture-tenant";
const T2 = "c37-fixture-tenant-2";
const CAL_KEY = "c37-calendly-signing-key";
const ACU_KEY = "c37-acuity-api-key";
const OWNER = "https://api.calendly.com/users/C37OWNER";
const OWNER2 = "https://api.calendly.com/users/C37OWNER2";

let failed = 0;
const log = (s: string) => console.log(s);
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

function calendlySig(body: string, key = CAL_KEY, tSec = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", key).update(`${tSec}.${body}`).digest("hex");
  return `t=${tSec},v1=${v1}`;
}
function acuitySig(body: string, key = ACU_KEY): string {
  return createHmac("sha256", key).update(body).digest("base64");
}

function calendlyBody(opts: {
  event?: string; owner?: string; eventUri?: string; email?: string;
  start?: string; end?: string; createdAt?: string; qa?: { question: string; answer: string }[];
}): string {
  return JSON.stringify({
    event: opts.event ?? "invitee.created",
    created_at: opts.createdAt ?? "2026-10-01T10:00:00.000000Z",
    payload: {
      uri: "https://api.calendly.com/scheduled_events/EVT/invitees/INV",
      email: opts.email ?? "stranger@example.test",
      name: "A Stranger",
      text_reminder_number: null,
      questions_and_answers: opts.qa ?? [],
      scheduled_event: {
        uri: opts.eventUri ?? "https://api.calendly.com/scheduled_events/EVT-1",
        start_time: opts.start ?? "2026-10-05T15:00:00.000000Z",
        end_time: opts.end ?? "2026-10-05T16:00:00.000000Z",
        event_memberships: [{ user: opts.owner ?? OWNER }],
      },
    },
  });
}

async function cleanup(): Promise<void> {
  for (const t of [T, T2]) {
    await rawPrisma.recordItem.deleteMany({ where: { tenantId: t } });
    await rawPrisma.consentGrant.deleteMany({ where: { tenantId: t } });
    await rawPrisma.lead.deleteMany({ where: { tenantId: t } });
    await rawPrisma.appointment.deleteMany({ where: { tenantId: t } });
    await rawPrisma.externalSchedulingConnection.deleteMany({ where: { tenantId: t } });
    await rawPrisma.user.deleteMany({ where: { tenantId: t } });
    await rawPrisma.tenant.deleteMany({ where: { id: t } });
  }
  await rawPrisma.webhookEvent.deleteMany({ where: { layer: { in: ["calendly", "acuity"] } } });
}

async function main(): Promise<void> {
  log(`# C37-EXTERNAL-SCHEDULING acceptance — ${new Date().toISOString()}`);
  await cleanup();

  // ---- fixtures: TWO tenants, so "the right tenant" is a real question ----
  for (const [id, slug] of [[T, "c37a"], [T2, "c37b"]] as const) {
    await rawPrisma.tenant.create({
      data: { id, slug, displayName: `C37 ${slug}`, status: "ACTIVE", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
    });
    await rawPrisma.user.create({
      data: { email: `pract@${slug}.fixture.test`, name: "C37 Pract", role: "PRACTITIONER", active: true, tenantId: id, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
    });
  }
  const ingress = newIngressToken();
  await rawPrisma.externalSchedulingConnection.create({
    data: { tenantId: T, provider: "calendly", externalOwner: OWNER, credentialEnc: encryptToken("cal-token"), signingKeyEnc: encryptToken(CAL_KEY) },
  });
  await rawPrisma.externalSchedulingConnection.create({
    data: { tenantId: T, provider: "acuity", credentialEnc: encryptToken(ACU_KEY), ingressTokenHash: ingress.hash },
  });
  // T2 owns a DIFFERENT Calendly account, so a misattribution would be visible.
  await rawPrisma.externalSchedulingConnection.create({
    data: { tenantId: T2, provider: "calendly", externalOwner: OWNER2, credentialEnc: encryptToken("cal-token-2"), signingKeyEnc: encryptToken(CAL_KEY) },
  });

  // ================= RULING 195 — attribution from the payload =================
  log(`\n## Ruling 195 — the tenant comes from the EVENT, not the host`);

  const b1 = calendlyBody({ qa: [{ question: "What brings you here?", answer: "I have been having trouble sleeping." }] });
  const r1 = await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(b1) }, b1);
  check("a correctly signed Calendly delivery is accepted", r1.status === 200, r1.note);

  const appts = await rawPrisma.appointment.findMany({ where: { externalProvider: "calendly" } });
  check("it produced exactly ONE appointment", appts.length === 1, `${appts.length}`);
  check(
    "the appointment landed on the tenant the PAYLOAD names, not the other fixture tenant",
    appts[0]?.tenantId === T,
    `tenantId=${appts[0]?.tenantId}`,
  );

  // POSITIVE CONTROL for the attribution leg (ruling 110): the SAME body with
  // the other owner uri must land on the OTHER tenant. If attribution were
  // hardcoded or host-derived, this leg fails.
  const b2 = calendlyBody({ owner: OWNER2, eventUri: "https://api.calendly.com/scheduled_events/EVT-2", email: "second@example.test" });
  const r2 = await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(b2) }, b2);
  const appt2 = await rawPrisma.appointment.findFirst({ where: { externalId: "https://api.calendly.com/scheduled_events/EVT-2" } });
  check("positive control: a different owner uri routes to a DIFFERENT tenant", r2.status === 200 && appt2?.tenantId === T2, `tenantId=${appt2?.tenantId}`);

  const b3 = calendlyBody({ owner: "https://api.calendly.com/users/NOBODY", eventUri: "https://api.calendly.com/scheduled_events/EVT-X" });
  const r3 = await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(b3) }, b3);
  const orphan = await rawPrisma.appointment.findFirst({ where: { externalId: "https://api.calendly.com/scheduled_events/EVT-X" } });
  check("an unmatched owner is acknowledged and DROPPED, never guessed into a tenant", r3.status === 200 && !orphan, r3.note);

  const rBad = await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(b1, "wrong-key") }, b1);
  check("a Calendly delivery with a bad signature is REFUSED", rBad.status === 403, rBad.note);

  // ================= RULING 196 — the path selects; it does not grant =========
  log(`\n## Ruling 196 — the Acuity path SELECTS the key, it does not GRANT trust`);

  const ab = "action=appointment.scheduled&id=99001&calendarID=7&appointmentTypeID=3";
  const okPath = await ingestAcuityEvent(ingress.raw, { "x-acuity-signature": acuitySig(ab) }, ab);
  check("correct path + correct signature is ACCEPTED", okPath.status === 200, okPath.note);

  const badSig = await ingestAcuityEvent(ingress.raw, { "x-acuity-signature": acuitySig(ab, "wrong-key") }, ab);
  check("correct path + WRONG signature is REFUSED (the path is not authority)", badSig.status === 403, badSig.note);

  const noSig = await ingestAcuityEvent(ingress.raw, {}, ab);
  check("correct path + NO signature is REFUSED", noSig.status === 403, noSig.note);

  // Ruling 197's ONE alerting case, asserted HERE — at the moment of breakage.
  // Later in this gate a valid delivery succeeds on this same connection and
  // clears the flag, which is correct and is gated separately below. Asserting
  // it after that success would have measured the healing, not the flagging.
  const flaggedNow = await rawPrisma.externalSchedulingConnection.findFirst({ where: { tenantId: T, provider: "acuity" } });
  check(
    "an unverifiable signature sets NEEDS_ATTENTION (ruling 197's one unambiguous breakage)",
    flaggedNow?.status === "NEEDS_ATTENTION" && !!flaggedNow?.lastError,
    `status=${flaggedNow?.status} err=${flaggedNow?.lastError}`,
  );

  const unknown = await ingestAcuityEvent(newIngressToken().raw, { "x-acuity-signature": acuitySig(ab) }, ab);
  check("an UNKNOWN path is refused with 404", unknown.status === 404, unknown.note);

  // The raw token must be unrecoverable from the database (the stored-hash
  // precedent). Proven positively: the hash is present AND is not the token.
  const acuRow = await rawPrisma.externalSchedulingConnection.findFirst({ where: { tenantId: T, provider: "acuity" } });
  check(
    "the ingress token is stored HASHED — the raw token appears nowhere in the row",
    !!acuRow?.ingressTokenHash && acuRow.ingressTokenHash !== ingress.raw && !JSON.stringify(acuRow).includes(ingress.raw),
    `hash=${acuRow?.ingressTokenHash?.slice(0, 12)}…`,
  );

  // ---- the idempotency correction, gated ----
  log(`\n## Idempotency — a retry must not double-apply, and must not vanish`);
  const dup = await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(b1) }, b1);
  const afterDup = await rawPrisma.appointment.count({ where: { externalId: "https://api.calendly.com/scheduled_events/EVT-1" } });
  check("a byte-identical Calendly retry is swallowed as a duplicate", dup.note.includes("duplicate"), dup.note);
  check("positive control: the retry did NOT create a second appointment", afterDup === 1, `${afterDup}`);

  // Acuity applies nothing yet (its webhook carries no times), so its claim must
  // be RELEASED — otherwise the booking is swallowed forever on first arrival.
  const acuClaim = await rawPrisma.webhookEvent.findFirst({ where: { layer: "acuity" } });
  check(
    "an Acuity delivery that applied nothing RELEASED its idempotency claim (it is not marked processed)",
    acuClaim === null,
    acuClaim ? `claim ${acuClaim.id} left behind` : "released",
  );
  const acuAgain = await ingestAcuityEvent(ingress.raw, { "x-acuity-signature": acuitySig(ab) }, ab);
  check(
    "positive control: because the claim was released, a later delivery is processed again rather than swallowed",
    !acuAgain.note.includes("duplicate"),
    acuAgain.note,
  );

  // A reschedule MOVES the booking; a cancel KEEPS the row.
  const resched = calendlyBody({ event: "invitee.created", createdAt: "2026-10-02T10:00:00.000000Z", start: "2026-10-06T15:00:00.000000Z", end: "2026-10-06T16:00:00.000000Z" });
  await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(resched) }, resched);
  const moved = await rawPrisma.appointment.findFirst({ where: { externalId: "https://api.calendly.com/scheduled_events/EVT-1" } });
  const movedCount = await rawPrisma.appointment.count({ where: { externalId: "https://api.calendly.com/scheduled_events/EVT-1" } });
  check("a reschedule MOVES the one booking rather than forking it", movedCount === 1 && moved?.startAt?.toISOString().startsWith("2026-10-06") === true, `count=${movedCount} start=${moved?.startAt?.toISOString()}`);

  const cancel = calendlyBody({ event: "invitee.canceled", createdAt: "2026-10-03T10:00:00.000000Z" });
  await ingestCalendlyEvent({ "calendly-webhook-signature": calendlySig(cancel) }, cancel);
  const cancelled = await rawPrisma.appointment.findFirst({ where: { externalId: "https://api.calendly.com/scheduled_events/EVT-1" } });
  check("a cancellation KEEPS the row and marks it CANCELLED (a cancellation is context)", cancelled?.status === "CANCELLED", `status=${cancelled?.status}`);

  // ================= RULING 193 — contact, never a client ====================
  log(`\n## Ruling 193 — a synced booking never manufactures a client record`);
  const lead = await rawPrisma.lead.findFirst({ where: { tenantId: T, email: "stranger@example.test" } });
  check("the invitee became a lightweight CONTACT (Lead)", !!lead, lead ? `lead ${lead.id}` : "none");
  const profiles = await rawPrisma.clientProfile.count({ where: { tenantId: T } });
  check("ZERO ClientProfile rows were created", profiles === 0, `${profiles}`);
  const clients = await rawPrisma.user.count({ where: { tenantId: T, role: "CLIENT" } });
  check("ZERO client User rows were created", clients === 0, `${clients}`);
  check("the invitee's answers were stored on the contact", !!lead?.intakeAnswers, JSON.stringify(lead?.intakeAnswers ?? null).slice(0, 60));

  // ================= RULING 198 — the evidence boundary, GATED ===============
  log(`\n## Ruling 198 — the evidence boundary is gated, not commented`);
  const SECRET = "I have been having trouble sleeping.";

  // A real client, so the citation path has something to be right about.
  const client = await rawPrisma.user.create({
    data: { email: "client@c37a.fixture.test", name: "C37 Client", role: "CLIENT", active: true, tenantId: T, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });

  // LEG 1 — the synced answers are NOT reachable by the citation path.
  const before = await withTenantScope(T, () => getClientRecord(client.id));
  const beforeText = JSON.stringify(before);
  check(
    "a synced booking's answers are NOT in the citation path's record",
    !beforeText.includes(SECRET),
    `timeline=${before.timeline.length} item(s)`,
  );

  // LEG 2 — POSITIVE CONTROL (ruling 110). The check above must be capable of
  // failing. Promote the SAME sentence into a RecordItem and it must appear.
  await rawPrisma.recordItem.create({
    data: {
      tenantId: T, clientId: client.id, kind: "NOTE", occurredAt: new Date(),
      title: "Promoted from booking", summary: SECRET, tags: [],
      sourceType: "C37Promotion", sourceId: `c37-${client.id}`,
    },
  });
  const after = await withTenantScope(T, () => getClientRecord(client.id));
  const afterText = JSON.stringify(after);
  check(
    "positive control: once PROMOTED into the record, the same sentence IS citable",
    afterText.includes(SECRET) && after.timeline.length === 1,
    `timeline=${after.timeline.length} item(s)`,
  );
  check(
    "so the earlier absence was a real boundary, not a blind instrument",
    !beforeText.includes(SECRET) && afterText.includes(SECRET),
  );

  // LEG 3 — the structural reason, asserted against the source.
  const src = (await import("fs")).readFileSync("lib/client-record.ts", "utf8");
  check(
    "structurally: the citation path reads RecordItem by clientId and nothing else",
    /recordItem\.findMany/.test(src) && !/intakeAnswers/.test(src),
    "lib/client-record.ts",
  );

  // ================= RULING 197 — health is a STATUS ========================
  log(`\n## Ruling 197 — health is a status the practitioner reads`);
  const calRow = await rawPrisma.externalSchedulingConnection.findFirst({ where: { tenantId: T, provider: "calendly" } });
  check("a successful delivery records lastEventAt", !!calRow?.lastEventAt, String(calRow?.lastEventAt));
  check("a successful delivery increments the 30-day count", (calRow?.eventCount30d ?? 0) > 0, `${calRow?.eventCount30d}`);
  check("a healthy connection stays CONNECTED — silence alone never flags it", calRow?.status === "CONNECTED", `status=${calRow?.status}`);

  // RECOVERY. The Acuity connection was flagged NEEDS_ATTENTION above, then a
  // valid delivery arrived on it. A connection that is demonstrably working is
  // not broken, so the flag CLEARS itself — the practitioner is not left
  // chasing a warning about something that already healed.
  const healed = await rawPrisma.externalSchedulingConnection.findFirst({ where: { tenantId: T, provider: "acuity" } });
  check(
    "a connection that was flagged and then delivered successfully HEALS back to CONNECTED",
    healed?.status === "CONNECTED" && healed?.lastError === null,
    `status=${healed?.status} err=${healed?.lastError}`,
  );
  check(
    "…and the failure is still legible as history (lastErrorAt survives the healing)",
    !!healed?.lastErrorAt,
    String(healed?.lastErrorAt),
  );

  // ---- OFF BY DEFAULT ----
  log(`\n## Off by default`);
  const none = await rawPrisma.externalSchedulingConnection.count({ where: { tenantId: T2, provider: "acuity" } });
  check("a tenant with no connection has none — the feature is opt-in per practice", none === 0, `${none}`);

  await cleanup();
  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  await rawPrisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  await rawPrisma.$disconnect();
  process.exit(1);
});
