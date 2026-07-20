// C12X §3 — the Practitioner Integration Guide pipeline. C5-grade posture:
// server-only, consent-gated, pseudonymized, metadata-only logging. The
// heaviest AI call in the app (chart × full record) — refreshed on demand
// from the Portrait, never on a schedule.

import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { getClientRecord } from "@/lib/client-record";
import { assembleCharts } from "@/lib/integrative-reading";
import { latestMarks } from "@/lib/resonance";
import {
  buildGuideSystemPrompt,
  GUIDE_OUTPUT_SCHEMA,
  GUIDE_VERSION,
  type GuideOutput,
} from "@/ai/integrationGuidePrompt";

export type GuideResult =
  | { ok: true; guideId: string; referral: boolean }
  | { ok: false; error: "consent" | "config" | "no-charts" | "empty" | "api" };

function stripIdentifiers(text: string, identifiers: string[]): string {
  let out = text;
  for (const ident of identifiers) {
    if (!ident) continue;
    out = out.split(ident).join("[client]");
  }
  return out;
}

export async function runIntegrationGuide(
  clientId: string,
  practitionerId: string,
  opts: { practitionerLocale?: "en" | "es" } = {},
): Promise<GuideResult> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { ok: false, error: "empty" };
  if (!(await hasConsent(client.id))) return { ok: false, error: "consent" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  const charts = await assembleCharts(clientId);
  if (!charts) return { ok: false, error: "no-charts" };

  const record = await getClientRecord(clientId);
  if (record.timeline.length === 0) return { ok: false, error: "empty" };

  // The record, pseudonymized but with REAL item ids so every claim is
  // tappable (the note-scan pattern).
  const identifiers = [client.name ?? "", client.email];
  const items = record.timeline.slice(0, 400).map((i) => ({
    id: i.id,
    kind: i.kind,
    occurredAt: i.occurredAt.toISOString().slice(0, 10),
    title: i.title ? stripIdentifiers(i.title, identifiers) : null,
    text: i.summary ? stripIdentifiers(i.summary, identifiers) : null,
    mood: i.mood,
    tags: i.tags,
  }));

  // The map (labels + states + confidence-relevant facts) and the client's
  // resonance marks — "the AI must use them."
  const nodes = await prisma.psycheNode.findMany({
    where: { clientId, state: { not: "ARCHIVED" } },
    select: {
      id: true,
      kind: true,
      label: true,
      state: true,
      source: true,
      chartBasis: true,
      blockKey: true,
      evidenceRecordItemIds: true,
    },
  });
  const readingMarks = await latestMarks(clientId, "READING_BLOCK");
  const guideMarks = await latestMarks(clientId, "GUIDE_CLAIM");
  const goals = await prisma.clientGoal.findMany({
    where: { clientId, status: { in: ["ACTIVE", "PROGRESSING"] } },
    select: { statement: true, whyItMatters: true, status: true },
  });
  const beliefs = await prisma.beliefWork.findMany({
    where: { clientId, status: "ACTIVE" },
    select: { belief: true, approvedStatement: true },
  });

  const payload = {
    clientRef: "the client",
    charts: charts.payload,
    record: { items, rollups: { themes: record.themes, cadence: record.cadence } },
    map: nodes.map((n) => ({
      kind: n.kind,
      label: n.label,
      state: n.state,
      source: n.source,
      chartBasis: n.chartBasis,
      blockKey: n.blockKey,
      evidenceCount: n.evidenceRecordItemIds.length,
    })),
    resonance: {
      readingBlocks: Object.fromEntries(readingMarks),
      guideClaims: Object.fromEntries(guideMarks),
    },
    goals,
    beliefWork: beliefs,
  };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });

  let output: GuideOutput;
  try {
    const params = {
      model,
      max_tokens: 28_000,
      thinking: { type: "adaptive" },
      system: buildGuideSystemPrompt(opts.practitionerLocale ?? "en"),
      output_config: { format: { type: "json_schema", schema: GUIDE_OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user" as const,
          content: `Here is the chart, the record (item ids are real — cite them), the current map, the client's resonance marks, and the open goals/belief work. Write the Integration Guide now.\n\n${JSON.stringify(payload)}`,
        },
      ],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const response = await anthropic.messages.create(params);
    if (response.stop_reason === "refusal") return { ok: false, error: "api" };
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as GuideOutput;
    if (!output?.components) return { ok: false, error: "api" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.error(`[guide] error client=${clientId} status=${status}`);
    return { ok: false, error: "api" };
  }

  // Evidence hygiene: drop cited ids that aren't actually this client's items.
  const validIds = new Set(items.map((i) => i.id));
  for (const c of output.components) {
    for (const ref of c.crossRefs) ref.evidenceIds = ref.evidenceIds.filter((id) => validIds.has(id));
    for (const b of c.beliefs) b.evidenceIds = b.evidenceIds.filter((id) => validIds.has(id));
  }

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        chart: charts.payload.humanDesign,
        lastItem: items[0]?.id ?? null,
        count: items.length,
        v: GUIDE_VERSION,
      }),
    )
    .digest("hex");

  const guide = await prisma.integrationGuide.upsert({
    where: { clientId },
    create: {
      clientId,
      model: `${model} · ${GUIDE_VERSION}`,
      inputHash,
      output: output as unknown as object,
    },
    update: {
      model: `${model} · ${GUIDE_VERSION}`,
      inputHash,
      output: output as unknown as object,
      generatedAt: new Date(),
    },
  });
  console.log(
    `[guide] generated client=${clientId} by=${practitionerId} components=${output.components.length} referral=${output.referral.flag}`,
  );
  return { ok: true, guideId: guide.id, referral: output.referral.flag };
}
