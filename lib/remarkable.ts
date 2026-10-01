// C14-REMARKABLE — the ingest pipeline: emailed PDF → stored original →
// transcription (Claude reads the PDF directly) → client match (suggested,
// NEVER auto-assumed) → draft awaiting her 10-second review.
//
// Privacy: C14 class (strictest). No note content in logs — ids and counts
// only. The original PDF is stored whole and served only through a
// practitioner-authed route.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  HANDWRITING_SYSTEM_PROMPT,
  HANDWRITING_OUTPUT_SCHEMA,
  HANDWRITING_VERSION,
  type HandwritingOutput,
} from "@/ai/handwritingPrompt";

const DAY = 86_400_000;

// Handwriting drops accents ("Maria" for "María") — fold diacritics before
// comparing names anywhere in the match path.
export const foldName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// §2 hard rule: sender must verify as hers. Comma-separated allowlist; the
// reMarkable's share-by-email sender plus her own addresses belong here.
export function senderAllowed(from: string): boolean {
  const allow = (process.env.REMARKABLE_SENDER_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false; // unconfigured = closed
  const addr = from.toLowerCase();
  return allow.some((a) => addr === a || addr.endsWith(`<${a}>`) || addr.includes(a));
}

export type InboundAttachment = { filename?: string; contentType?: string; contentBase64: string };

// Path A ingest. Strangers are rejected SILENTLY by the caller (the webhook
// returns 200 regardless — no information leak about the address).
export async function ingestInboundEmail(args: {
  from: string;
  subject?: string | null;
  attachments: InboundAttachment[];
}): Promise<{ ok: boolean; draftId?: string; reason?: string }> {
  if (!senderAllowed(args.from)) {
    console.log("[remarkable] inbound rejected (sender not allowlisted)");
    return { ok: false, reason: "sender" };
  }
  const pdf = args.attachments.find(
    (a) =>
      (a.contentType ?? "").includes("pdf") || (a.filename ?? "").toLowerCase().endsWith(".pdf"),
  );
  if (!pdf) {
    console.log("[remarkable] inbound had no PDF attachment");
    return { ok: false, reason: "no-pdf" };
  }
  const bytes = Buffer.from(pdf.contentBase64, "base64");
  if (bytes.length < 100 || bytes.length > 25_000_000) return { ok: false, reason: "size" };

  const draft = await prisma.handwrittenNote.create({
    data: {
      fromAddress: args.from.slice(0, 200),
      subject: args.subject?.slice(0, 200) ?? null,
      pdf: bytes,
      source: "EMAIL",
    },
  });
  console.log(`[remarkable] draft created id=${draft.id} bytes=${bytes.length}`);

  // Transcribe + match inline; failures leave a draft she can retry from.
  await transcribeHandwrittenNote(draft.id).catch(() => undefined);
  return { ok: true, draftId: draft.id };
}

export async function transcribeHandwrittenNote(
  id: string,
): Promise<{ ok: boolean; error?: "config" | "api" }> {
  const draft = await prisma.handwrittenNote.findUnique({ where: { id } });
  if (!draft) return { ok: false, error: "api" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });

  let output: HandwritingOutput;
  try {
    const params = {
      model,
      max_tokens: 8_000,
      system: HANDWRITING_SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: HANDWRITING_OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: Buffer.from(draft.pdf).toString("base64"),
              },
            },
            { type: "text", text: "Transcribe these handwritten session-note pages now." },
          ],
        },
      ],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const response = await anthropic.messages.create(params);
    if (response.stop_reason === "refusal") return { ok: false, error: "api" };
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as HandwritingOutput;
    if (typeof output?.transcript !== "string") return { ok: false, error: "api" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.error(`[remarkable] transcription error id=${id} status=${status}`);
    return { ok: false, error: "api" };
  }

  await prisma.handwrittenNote.update({
    where: { id },
    data: {
      transcript: output.transcript,
      transcriptModel: `${model} · ${HANDWRITING_VERSION}`,
    },
  });
  console.log(
    `[remarkable] transcribed id=${id} chars=${output.transcript.length} illegible=${output.illegibleCount}`,
  );
  await suggestMatch(id, output.nameOnPage);
  return { ok: true };
}

// §3 — matching: that day's calendar, a first name on the page, recency.
// A suggestion is only ever a pre-selection; Apply requires her confirm.
export async function suggestMatch(id: string, nameOnPage: string | null): Promise<void> {
  const draft = await prisma.handwrittenNote.findUnique({ where: { id } });
  if (!draft) return;

  const dayStart = new Date(draft.receivedAt.getTime() - 1.5 * DAY);
  const sessions = await prisma.appointment.findMany({
    where: {
      kind: "SESSION",
      clientId: { not: null },
      startAt: { gte: dayStart, lte: draft.receivedAt },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    orderBy: { startAt: "desc" },
    take: 10,
    include: { client: { select: { id: true, name: true } } },
  });

  const name = nameOnPage ? foldName(nameOnPage).split(/\s+/)[0] || null : null;
  const firstNameOf = (full: string | null) => foldName((full ?? "").split(/\s+/)[0] ?? "");

  let clientId: string | null = null;
  let appointmentId: string | null = null;
  let confidence: "CONFIDENT" | "AMBIGUOUS" | "NONE" = "NONE";

  const byName = name
    ? sessions.filter((s) => s.client && firstNameOf(s.client.name) === name)
    : [];
  if (byName.length >= 1) {
    clientId = byName[0].clientId;
    appointmentId = byName[0].id;
    confidence = "CONFIDENT";
  } else if (name) {
    // Name on the page but no matching session — try the roster directly.
    const clients = await prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true },
    });
    const rosterHits = clients.filter((c) => firstNameOf(c.name) === name);
    if (rosterHits.length === 1) {
      clientId = rosterHits[0].id;
      confidence = "CONFIDENT";
    } else if (rosterHits.length > 1) {
      confidence = "AMBIGUOUS";
    }
  } else if (sessions.length === 1) {
    clientId = sessions[0].clientId;
    appointmentId = sessions[0].id;
    confidence = "CONFIDENT";
  } else if (sessions.length > 1) {
    // Two sessions that day, no name — the review screen simply asks.
    clientId = sessions[0].clientId;
    appointmentId = sessions[0].id;
    confidence = "AMBIGUOUS";
  }

  await prisma.handwrittenNote.update({
    where: { id },
    data: { matchedClientId: clientId, matchedAppointmentId: appointmentId, matchConfidence: confidence },
  });
  console.log(`[remarkable] match id=${id} confidence=${confidence}`);
}
