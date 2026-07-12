import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { getClientRecord } from "@/lib/client-record";
import {
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  NOTE_SCAN_VERSION,
  buildUserMessage,
  type NoteScanOutput,
} from "@/ai/noteScanPrompt";

// C14.4 — scan a private note against a client's record for connections worth
// exploring. Reuses the C5 non-negotiables: server-side only; unified consent
// (AMENDMENT-01); pseudonymized payload; mandatory referral safety; metadata-only
// logging (never the note or record content). Practitioner-only by route.

const DAY = 24 * 60 * 60 * 1000;
const SCOPE_DAYS = 120; // a note may reach a little further back than a prep

export type ScanResult =
  | { ok: true; scanId: string; referral: boolean }
  | { ok: false; error: "unfiled" | "consent" | "config" | "empty" | "api" };

function strip(text: string | null, identifiers: string[]): string | null {
  if (!text) return text;
  let out = text;
  for (const id of identifiers) if (id) out = out.split(id).join("[client]");
  return out;
}

export async function runNoteScan(noteId: string, practitionerId: string): Promise<ScanResult> {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return { ok: false, error: "unfiled" };
  // A scan needs a client to scan against; unfiled notes carry no client data.
  if (!note.clientId) return { ok: false, error: "unfiled" };

  const client = await prisma.user.findFirst({
    where: { id: note.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { ok: false, error: "unfiled" };
  if (!(await hasConsent(client.id))) return { ok: false, error: "consent" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  const scopeFrom = new Date(Date.now() - SCOPE_DAYS * DAY);
  const rec = await getClientRecord(client.id);
  const windowed = rec.timeline.filter((i) => i.occurredAt >= scopeFrom);
  if (windowed.length === 0) return { ok: false, error: "empty" };

  const identifiers = [client.email, client.name ?? ""].filter(Boolean) as string[];

  // Reflective-profile summary (C11/C12), positions only — no identity.
  const [hd, lenses] = await Promise.all([
    prisma.humanDesignChart.findUnique({
      where: { userId: client.id },
      select: { type: true, authority: true, profile: true, definition: true },
    }),
    prisma.lensResult.findMany({ where: { userId: client.id } }),
  ]);
  const spiral = lenses.find((l) => l.lens === "SPIRAL")?.result as
    | { centerOfGravity?: string; practitionerCenter?: string }
    | undefined;

  const payload = {
    note: {
      title: strip(note.title, identifiers),
      body: strip(note.body, identifiers),
      tags: note.tags,
    },
    // Each item keeps its real id so the model can cite tappable evidence.
    record: windowed.map((i) => ({
      id: i.id,
      kind: i.kind,
      date: i.occurredAt.toISOString().slice(0, 10),
      title: strip(i.title, identifiers),
      text: strip(i.summary, identifiers),
      mood: i.mood,
      tags: i.tags,
    })),
    rollups: {
      themes: rec.themes.map((t) => ({ tag: t.tag, count: t.count, trend: t.trend })),
      moodTrend: rec.moodTrend,
    },
    charts: {
      humanDesign: hd ?? null,
      valuesCenter: spiral?.practitionerCenter ?? spiral?.centerOfGravity ?? null,
    },
  };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  let output: NoteScanOutput;
  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{ role: "user", content: buildUserMessage(JSON.stringify(payload)) }],
    };
    const response = await anthropic.messages.create(params);
    if (response.stop_reason === "refusal") {
      console.log(`[note-scan] refusal note=${note.id} model=${model}`);
      return { ok: false, error: "api" };
    }
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as NoteScanOutput;
    if (typeof output?.referral?.flag !== "boolean" || !Array.isArray(output.connections)) {
      return { ok: false, error: "api" };
    }
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[note-scan] error note=${note.id} model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }

  // Store the whole structured output (connections + referral) in the JSON
  // column; referralFlag mirrors it for indexing. On a referral, connections
  // are already empty per the schema contract.
  const scan = await prisma.noteScan.create({
    data: {
      noteId: note.id,
      model: `${model} · ${NOTE_SCAN_VERSION}`,
      connections: output as object,
      referralFlag: output.referral.flag,
    },
    select: { id: true, referralFlag: true },
  });

  console.log(
    `[note-scan] ran note=${note.id} scan=${scan.id} by=${practitionerId} model=${model} referral=${scan.referralFlag} connections=${output.referral.flag ? 0 : output.connections.length}`,
  );
  return { ok: true, scanId: scan.id, referral: scan.referralFlag };
}
