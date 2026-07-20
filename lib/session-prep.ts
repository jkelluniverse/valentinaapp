import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { getClientRecord } from "@/lib/client-record";
import {
  buildSystemPrompt,
  OUTPUT_SCHEMA,
  PROMPT_VERSION,
  buildUserMessage,
  type PrepOutput,
  type PractitionerLocale,
} from "@/ai/sessionPrepPrompt";
import { nodeConfidence } from "@/lib/confidence";

// C5 pipeline (spec §4). Non-negotiables enforced here as code:
// - runs server-side only; the API key never leaves this module
// - only for a client who holds the unified consent (AMENDMENT-01), which
//   covers AI-assisted processing of the record
// - scoped window, pseudonymized payload (no name/email/ids)
// - referral flag is read from structured output and stored
// - logging is METADATA ONLY — never any record or formulation content

const DAY = 24 * 60 * 60 * 1000;
const SCOPE_DAYS = 90; // default scope window (spec §6); rollups stay full-history

export type PrepResult =
  | { ok: true; prepId: string; referral: boolean }
  | { ok: false; error: "consent" | "config" | "empty" | "api" };

function stripIdentifiers(text: string | null, identifiers: string[]) {
  if (!text) return text;
  let out = text;
  for (const id of identifiers) {
    if (!id) continue;
    out = out.split(id).join("[client]");
  }
  return out;
}

export async function runSessionPrep(
  clientId: string,
  practitionerId: string,
  // AMD-05 — prep is HER-facing; her working language governs (English today).
  opts: { practitionerLocale?: PractitionerLocale } = {},
): Promise<PrepResult> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { ok: false, error: "consent" };

  // Gate (AMENDMENT-01): no unified consent on record, no pipeline. Ever.
  if (!(await hasConsent(client.id))) return { ok: false, error: "consent" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  // Assemble (spec §4.3): scoped window of the C4 record + full rollups.
  const scopeTo = new Date();
  const scopeFrom = new Date(scopeTo.getTime() - SCOPE_DAYS * DAY);
  const rec = await getClientRecord(client.id);
  const windowed = rec.timeline.filter((i) => i.occurredAt >= scopeFrom);
  if (windowed.length === 0) return { ok: false, error: "empty" };

  // Pseudonymize (spec §6): the payload carries no name, no email, no ids —
  // just dated content under a neutral client reference. Direct identifiers
  // we hold are also stripped out of free text.
  const identifiers = [client.email, client.name ?? ""].filter(Boolean) as string[];

  // C12X §8 — the map (with §6 confidence levels), goals in their own words,
  // open belief work, chart context, and resonance marks all inform the brief.
  // CONTRADICTED never surfaces as live guidance ("retired from prep").
  const [mapNodes, goals, beliefWork, chart, readingMarks] = await Promise.all([
    prisma.psycheNode.findMany({
      where: { clientId: client.id, state: { notIn: ["ARCHIVED"] } },
      select: {
        id: true,
        kind: true,
        label: true,
        state: true,
        source: true,
        chartBasis: true,
        evidenceRecordItemIds: true,
      },
    }),
    prisma.clientGoal.findMany({
      where: { clientId: client.id, status: { in: ["ACTIVE", "PROGRESSING"] } },
      select: { statement: true, whyItMatters: true, obstacles: true, status: true },
    }),
    prisma.beliefWork.findMany({
      where: { clientId: client.id, status: "ACTIVE" },
      select: {
        belief: true,
        statementOptions: true,
        approvedStatement: true,
      },
    }),
    prisma.humanDesignChart.findUnique({
      where: { userId: client.id },
      select: { type: true, strategy: true, authority: true, profile: true, accuracyNote: true },
    }),
    prisma.resonanceMark.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "asc" },
      select: { subjectType: true, subjectKey: true, value: true },
    }),
  ]);
  const latestResonance = new Map<string, string>();
  for (const m of readingMarks) latestResonance.set(`${m.subjectType}:${m.subjectKey}`, m.value);

  const mapSummary = mapNodes.map((n) => ({
    kind: n.kind,
    label: n.label,
    state: n.state,
    source: n.source,
    chartBasis: n.chartBasis,
    confidence: nodeConfidence({
      source: n.source,
      state: n.state,
      evidenceCount: n.evidenceRecordItemIds.length,
      latestResonance: latestResonance.get(`NODE:${n.id}`) ?? null,
    }),
  }));

  const payload = {
    clientRef: "the client",
    windowDays: SCOPE_DAYS,
    timeline: windowed.map((i) => ({
      kind: i.kind,
      occurredAt: i.occurredAt.toISOString().slice(0, 10),
      title: stripIdentifiers(i.title, identifiers),
      text: stripIdentifiers(i.summary, identifiers),
      mood: i.mood,
      tags: i.tags,
    })),
    rollups: {
      themes: rec.themes.map((t) => ({ tag: t.tag, count: t.count, trend: t.trend })),
      moodTrend: rec.moodTrend,
      cadence: {
        thisWeek: rec.cadence.thisWeek,
        lastFourWeeks: rec.cadence.lastFourWeeks,
        weekStreak: rec.cadence.weekStreak,
      },
      counts: rec.counts,
    },
    map: mapSummary,
    goals,
    beliefWork: beliefWork.map((b) => ({
      belief: b.belief,
      options: (b.statementOptions as { text?: string }[] | string[] | null) ?? [],
      approvedStatement: b.approvedStatement,
    })),
    chartContext: chart
      ? {
          type: chart.type,
          strategy: chart.strategy,
          authority: chart.authority,
          profile: chart.profile,
          accuracyNote: chart.accuracyNote,
        }
      : null,
  };

  // Call (spec §4.5): one server-side request; structured output enforces the
  // §5 contract; bounded retries and a hard timeout.
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  let output: PrepOutput;
  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt(opts.practitionerLocale),
      output_config: {
        format: {
          type: "json_schema",
          schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content: buildUserMessage(JSON.stringify(payload)) }],
    };
    const response = await anthropic.messages.create(params);

    if (response.stop_reason === "refusal") {
      console.log(`[session-prep] refusal client=${client.id} model=${model}`);
      return { ok: false, error: "api" };
    }

    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as PrepOutput;
    if (typeof output?.referral?.flag !== "boolean" || !output.formulation) {
      return { ok: false, error: "api" };
    }
  } catch (e) {
    // Metadata only — never the payload or any response content.
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[session-prep] error client=${client.id} model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }

  // Store (spec §8): the SessionPrep row is the only persisted output and the
  // audit record. Practitioner-only by route authorization.
  const prep = await prisma.sessionPrep.create({
    data: {
      clientId: client.id,
      requestedById: practitionerId,
      scopeFrom,
      scopeTo,
      model: `${model} · prompt:${PROMPT_VERSION}`,
      referralFlag: output.referral.flag,
      output: output as object,
    },
    select: { id: true, referralFlag: true },
  });

  // Audit log — metadata only (spec §2.6).
  console.log(
    `[session-prep] ran client=${client.id} prep=${prep.id} by=${practitionerId} model=${model} prompt=${PROMPT_VERSION} referral=${prep.referralFlag}`,
  );

  return { ok: true, prepId: prep.id, referral: prep.referralFlag };
}
