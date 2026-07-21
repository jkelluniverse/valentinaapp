import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { createHash, randomBytes } from "crypto";
import { isCrisisSignal } from "../../lib/message-safety";

// FIXTURES-SPEC §9 — the seed. Reads the committed briefs + generated content and
// writes the roster to the DB. Deterministic (fixed NOW anchor, hashed
// placements), idempotent (per-client reset), and GUARDED: refuses to run unless
// SEED_ENV=staging and the DATABASE_URL host is not production.
//   SEED_ENV=staging DATABASE_URL=...staging npx tsx prisma/fixtures/seed-staging.ts

const prisma = new PrismaClient();
const NOW = new Date("2026-07-14T16:00:00Z"); // fixed anchor — the roster never drifts
const DAY = 86_400_000;
const CONSENT_VERSION = "2026-07";
const BRIEFS = join(__dirname, "briefs");
const GEN = join(__dirname, "generated");

const hash = (p: string) => bcrypt.hashSync(p, 10);
const at = (dayOffset: number) => new Date(NOW.getTime() + dayOffset * DAY);
const unit = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0) / 0xffffffff;

type Brief = {
  id: string;
  identity: { name: string; age?: number; pronouns?: string; lives?: string; work?: string; email: string; language?: string };
  birth?: { date?: string; time?: string; precision?: string; place?: string; tz_expect?: string } | null;
  psyche?: { wounds?: string[]; beliefs?: string[]; protections?: string[]; patterns?: string[]; resources?: string[]; origin?: string };
  first_map?: { self_named?: string[]; unaware_of?: string[] };
  arc?: { months?: number; stage?: number } | null;
  lifecycle?: string; // "pending" | "deactivated" — else active
  safety_test?: boolean;
  // FIXTURES-PATCH-VALUES §5b — authored assessment ANSWERS (never blends);
  // the seed runs them through the real scorer → blend → approval path.
  values_answers?: Record<string, number>;
  values_state?: "SENT" | "UNAPPROVED"; // Ben: sent, unanswered · Marcos: answered, awaiting approval
};
type Gen = {
  reflections?: { day: number; body: string; mood?: number; tags?: string[] }[];
  messages?: { from: "CLIENT" | "PRACTITIONER"; day: number; body: string; unread?: boolean }[];
  notes?: { day: number; body: string }[];
};

const STAGE = ["", "STABILIZE", "DEEPEN", "INTEGRATE"]; // brief.arc.stage 1..3

function ianaFrom(tzExpect?: string): string | null {
  const m = tzExpect?.match(/\b(America|Asia|Pacific|Europe|Africa)\/[A-Za-z_]+/);
  return m ? m[0] : null;
}
// Which star-kind a self-named item is, by matching the psyche categories.
function starKind(label: string, p: Brief["psyche"]): string {
  const has = (arr?: string[]) => arr?.some((x) => x.toLowerCase() === label.toLowerCase());
  if (has(p?.wounds)) return "WOUND";
  if (has(p?.beliefs)) return "CORE_BELIEF";
  if (has(p?.protections)) return "PROTECTION";
  if (has(p?.resources)) return "RESOURCE";
  if (has(p?.patterns)) return "PATTERN";
  return "PATTERN";
}
const humanize = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function resetClientContent(clientId: string) {
  await prisma.psycheNode.deleteMany({ where: { clientId } });
  await prisma.psycheEdge.deleteMany({ where: { clientId } });
  await prisma.message.deleteMany({ where: { conversation: { clientId } } });
  await prisma.note.deleteMany({ where: { clientId } });
  await prisma.appointment.deleteMany({ where: { clientId } });
  await prisma.recordItem.deleteMany({ where: { clientId } });
  await prisma.logEntry.deleteMany({ where: { clientId } });
  await prisma.psycheExtraction.deleteMany({ where: { clientId } });
}

async function main() {
  // ---- Hard guard (§0.2) ----
  if (process.env.SEED_ENV !== "staging") throw new Error("REFUSING: set SEED_ENV=staging to seed fixtures.");
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x/x").host;
  if (/prod/i.test(host)) throw new Error(`REFUSING: DATABASE_URL host looks production (${host}). Fixtures are staging-only.`);

  const pw = await prisma.user.upsert({
    where: { email: "valentina@fixture.test" },
    update: { passwordHash: hash("fixture-pass-1") },
    create: { email: "valentina@fixture.test", name: "Valentina Vélez", role: "PRACTITIONER", active: true, passwordHash: hash("fixture-pass-1") },
  });
  await prisma.schedulingConfig.upsert({
    where: { practitionerId: pw.id },
    update: {},
    create: { practitionerId: pw.id, timezone: "America/New_York", defaultVideoUrl: "https://example.com/room/valentina", discoveryMinutes: 20, calendarFeedSecret: randomBytes(12).toString("hex") },
  });

  // FIXTURES-PATCH-VALUES — the practice's spiral assessment, exactly as the
  // library action would create it (one per practice).
  const { buildSpiralFields, scoreSpiral } = await import("../../lib/spiral");
  let spiralWs = await prisma.worksheet.findFirst({ where: { isSpiral: true } });
  if (!spiralWs) {
    spiralWs = await prisma.worksheet.create({
      data: {
        title: "Where your energy lives — a values snapshot",
        intro:
          "A short reflection on what's steering your life right now. Rate how true each statement feels these days — honestly, not aspirationally. There are no better or worse answers.",
        schema: buildSpiralFields() as unknown as object,
        isSpiral: true,
        createdById: pw.id,
        sourceNote: "Original practice assessment (C12 values spiral)",
      },
    });
  }

  const files = readdirSync(BRIEFS).filter((f) => f.endsWith(".json"));
  let clients = 0, reflections = 0, messages = 0, notes = 0, stars = 0, crises = 0, blends = 0;

  for (const f of files) {
    const b = JSON.parse(readFileSync(join(BRIEFS, f), "utf8")) as Brief;
    const email = b.identity.email;
    const rawStatus = String((b as { status?: string }).status ?? b.lifecycle ?? "");
    const isPending = b.id === "ana" || !b.arc || /pending/i.test(rawStatus);
    const isDeactivated = b.id === "ruth" || (b.arc as { status?: string } | null)?.status === "closed" || /deactiv|closed/i.test(rawStatus);

    // ---- Lifecycle: pending invite (Ana) → no user, just an invite ----
    if (isPending && !isDeactivated) {
      const token = createHash("sha256").update(`invite:${b.id}`).digest("hex");
      await prisma.invite.deleteMany({ where: { email } });
      await prisma.invite.create({ data: { email, name: b.identity.name, tokenHash: token, status: "PENDING", invitedById: pw.id, expiresAt: at(7) } });
      console.log(`  · ${b.id}: pending invite (converted from lead)`);
      continue;
    }

    const active = !isDeactivated; // Ruth (closed) → cannot log in
    const months = b.arc?.months ?? 3;
    // AMD-05 — the reading/emails follow User.locale; es-primary briefs read in Spanish.
    const locale = /es primary/i.test(b.identity.language ?? "") ? "es" : "en";
    const u = await prisma.user.upsert({
      where: { email },
      update: { name: b.identity.name, active, locale },
      create: { email, name: b.identity.name, role: "CLIENT", active, locale, passwordHash: hash("fixture-pass-1"), consentAt: at(-months * 30), createdAt: at(-months * 30) },
    });
    await prisma.consentGrant.upsert({ where: { userId_version: { userId: u.id, version: CONSENT_VERSION } }, update: {}, create: { userId: u.id, version: CONSENT_VERSION } });

    // Birth data → profile (charts generate from this later; timezone honored).
    const birthDate = b.birth?.date ? new Date(`${b.birth.date}T00:00:00Z`) : null;
    const unknownTime = (b.birth?.precision ?? "").toUpperCase() === "UNKNOWN";
    await prisma.clientProfile.upsert({
      where: { userId: u.id },
      update: {
        stage: STAGE[b.arc?.stage ?? 1] ?? "STABILIZE",
        firstMapCompletedAt: b.first_map?.self_named?.length ? at(-months * 30 + 5) : null,
      },
      create: {
        userId: u.id,
        stage: STAGE[b.arc?.stage ?? 1] ?? "STABILIZE",
        intakeCompletedAt: at(-months * 30 + 2),
        firstMapCompletedAt: b.first_map?.self_named?.length ? at(-months * 30 + 5) : null,
        birthDate,
        birthTime: unknownTime ? null : b.birth?.time ?? null,
        birthTimeUnknown: unknownTime,
        birthTimePrecision: b.birth?.precision ?? null, // C12X — APPROXIMATE is held lightly
        birthPlace: b.birth?.place ?? null,
        birthTz: ianaFrom(b.birth?.tz_expect),
      },
    });

    await resetClientContent(u.id);

    // First Map — self-named stars (SELF_REPORTED), deterministic placement.
    for (const label of b.first_map?.self_named ?? []) {
      await prisma.psycheNode.create({
        data: {
          clientId: u.id, kind: starKind(label, b.psyche) as never, label: humanize(label), source: "SELF_REPORTED",
          selfX: unit(`${b.id}:${label}:x`), selfY: unit(`${b.id}:${label}:y`), weight: 1.4,
        },
      });
      stars++;
    }

    // Generated content (reflections / messages / notes).
    const genPath = join(GEN, `${b.id}.json`);
    const gen: Gen = existsSync(genPath) ? JSON.parse(readFileSync(genPath, "utf8")) : {};

    for (let i = 0; i < (gen.reflections?.length ?? 0); i++) {
      const r = gen.reflections![i];
      const when = at(r.day ?? -1);
      const e = await prisma.logEntry.create({ data: { clientId: u.id, body: r.body, mood: r.mood ?? 3, occurredAt: when, tags: r.tags ?? [], type: "REFLECTION" } });
      await prisma.recordItem.upsert({
        where: { sourceType_sourceId: { sourceType: "LogEntry", sourceId: e.id } },
        create: { clientId: u.id, kind: "LOG_ENTRY" as never, occurredAt: when, title: "", summary: r.body.slice(0, 240), tags: r.tags ?? [], sourceType: "LogEntry", sourceId: e.id },
        update: {},
      });
      reflections++;
    }

    if (gen.messages?.length) {
      const convo = await prisma.conversation.upsert({
        where: { clientId: u.id },
        update: { lastMessageAt: at(Math.max(...gen.messages.map((m) => m.day))) },
        create: { clientId: u.id, practitionerId: pw.id, lastMessageAt: at(Math.max(...gen.messages.map((m) => m.day))) },
      });
      for (const m of gen.messages) {
        // Use the app's real crisis detector so the safety path is exercised
        // exactly as production would flag it (§7).
        const crisis = m.from === "CLIENT" && isCrisisSignal(m.body);
        if (crisis) crises++;
        await prisma.message.create({
          data: {
            conversationId: convo.id, senderId: m.from === "CLIENT" ? u.id : pw.id, senderRole: m.from, body: m.body,
            createdAt: at(m.day), deliveredAt: at(m.day), readAt: m.unread ? null : at(m.day + 0.01),
            safetyFlag: crisis, safetyCleared: false,
          },
        });
        messages++;
      }
    }

    // Margins notes (C14) — Valentina's voice, practitioner-authored.
    for (const n of gen.notes ?? []) {
      await prisma.note.create({ data: { clientId: u.id, authorId: pw.id, body: n.body, createdAt: at(n.day), status: "OPEN", depth: "NOTE" } as never });
      notes++;
    }

    // ---- FIXTURES-PATCH-VALUES §5b — the values spiral, via the REAL path ----
    // Answers (authored in character) → assignment → response → scoreSpiral →
    // LensResult, approval stamped as Valentina mid-tenure. Deliberate gaps:
    // Tomás never (lens-absent branch), Ben sent-unanswered, Marcos unapproved.
    await prisma.worksheetAssignment.deleteMany({ where: { clientId: u.id, worksheetId: spiralWs.id } });
    await prisma.lensResult.deleteMany({ where: { userId: u.id, lens: "SPIRAL" } });
    if (b.values_state === "SENT") {
      // Sent, unanswered — the "sent · awaiting" profile state, permanently.
      await prisma.worksheetAssignment.create({
        data: { worksheetId: spiralWs.id, clientId: u.id, assignedById: pw.id, status: "PENDING", createdAt: at(-Math.round(months * 30 * 0.35)) },
      });
      console.log(`  · ${b.id}: values assessment sent, awaiting answers`);
    } else if (b.values_answers) {
      const takenDay = -Math.round(months * 30 * 0.45); // mid-tenure, never seed-day
      const assignment = await prisma.worksheetAssignment.create({
        data: { worksheetId: spiralWs.id, clientId: u.id, assignedById: pw.id, status: "COMPLETED", createdAt: at(takenDay - 4) },
      });
      const response = await prisma.worksheetResponse.create({
        data: { assignmentId: assignment.id, answers: b.values_answers, completedAt: at(takenDay) },
      });
      await prisma.recordItem.upsert({
        where: { sourceType_sourceId: { sourceType: "WorksheetResponse", sourceId: response.id } },
        create: { clientId: u.id, kind: "WORKSHEET_RESPONSE" as never, occurredAt: at(takenDay), title: spiralWs.title, summary: "Completed the values snapshot", tags: [], sourceType: "WorksheetResponse", sourceId: response.id },
        update: {},
      });
      const score = scoreSpiral(b.values_answers);
      if (score) {
        const approved = b.values_state !== "UNAPPROVED";
        await prisma.lensResult.create({
          data: {
            userId: u.id, lens: "SPIRAL", sourceType: "ASSESSMENT",
            result: score as unknown as object, contentRef: score.contentRef,
            practitionerReviewed: approved, // Valentina's sign-off (fixture-era, two days after)
            generatedAt: at(takenDay),
          },
        });
        blends++;
        console.log(`  · ${b.id}: values blend ${score.centerOfGravity}${approved ? " (approved)" : " (awaiting her review)"}`);
      }
    }

    clients++;
    console.log(`  · ${b.id}: ${active ? "active" : "deactivated"} — ${gen.reflections?.length ?? 0} refl, ${gen.messages?.length ?? 0} msg, ${b.first_map?.self_named?.length ?? 0} stars`);
  }

  console.log(`\n=== FIXTURE SEED COMPLETE (staging) ===`);
  console.log(`clients=${clients} reflections=${reflections} messages=${messages} notes=${notes} stars=${stars} crisis-messages=${crises} values-blends=${blends}`);
  console.log(`Practitioner: valentina@fixture.test / fixture-pass-1  ·  clients: <id>@fixture.test / fixture-pass-1`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
