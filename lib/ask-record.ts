// C12X §8 — Ask the Record. Practitioner-only, consent-gated, pseudonymized,
// cite-or-decline. Answers persist (AskRecordAnswer) because yesterday's
// answer is session gold; question text is practitioner-authored material.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { getClientRecord } from "@/lib/client-record";
import {
  buildAskSystemPrompt,
  ASK_OUTPUT_SCHEMA,
  ASK_VERSION,
  type AskOutput,
} from "@/ai/askRecordPrompt";

export type AskResult =
  | { ok: true; answerId: string }
  | { ok: false; error: "consent" | "config" | "empty" | "api" };

function strip(text: string, identifiers: string[]): string {
  let out = text;
  for (const ident of identifiers) if (ident) out = out.split(ident).join("[client]");
  return out;
}

export async function askRecord(
  clientId: string,
  practitionerId: string,
  question: string,
  opts: { practitionerLocale?: "en" | "es" } = {},
): Promise<AskResult> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { ok: false, error: "empty" };
  if (!(await hasConsent(client.id))) return { ok: false, error: "consent" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  const record = await getClientRecord(clientId);
  if (record.timeline.length === 0) return { ok: false, error: "empty" };

  const identifiers = [client.name ?? "", client.email];
  const items = record.timeline.slice(0, 500).map((i) => ({
    id: i.id,
    kind: i.kind,
    occurredAt: i.occurredAt.toISOString().slice(0, 10),
    title: i.title ? strip(i.title, identifiers) : null,
    text: i.summary ? strip(i.summary, identifiers) : null,
    mood: i.mood,
    tags: i.tags,
  }));

  // The three ledgers feed longitudinal questions ("which interventions helped?").
  const [goals, beliefs, outcomes, nodes] = await Promise.all([
    prisma.clientGoal.findMany({
      where: { clientId },
      select: { statement: true, status: true, whyItMatters: true, createdAt: true },
    }),
    prisma.beliefWork.findMany({
      where: { clientId },
      select: { belief: true, status: true, approvedStatement: true, subjectiveResponse: true },
    }),
    prisma.interventionOutcome.findMany({
      where: { clientId },
      select: {
        purpose: true,
        clientResponse: true,
        insights: true,
        difficulties: true,
        decision: true,
        createdAt: true,
      },
    }),
    prisma.psycheNode.findMany({
      where: { clientId, state: { not: "ARCHIVED" } },
      select: { kind: true, label: true, state: true, source: true, evidenceRecordItemIds: true },
    }),
  ]);

  const payload = {
    question,
    clientRef: "the client",
    record: { items, rollups: { themes: record.themes, cadence: record.cadence } },
    goals,
    beliefWork: beliefs,
    interventionOutcomes: outcomes,
    map: nodes.map((n) => ({
      kind: n.kind,
      label: n.label,
      state: n.state,
      source: n.source,
      evidenceCount: n.evidenceRecordItemIds.length,
    })),
  };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  let output: AskOutput;
  try {
    const params = {
      model,
      max_tokens: 12_000,
      thinking: { type: "adaptive" },
      system: buildAskSystemPrompt(opts.practitionerLocale ?? "en"),
      output_config: { format: { type: "json_schema", schema: ASK_OUTPUT_SCHEMA } },
      messages: [{ role: "user" as const, content: JSON.stringify(payload) }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const response = await anthropic.messages.create(params);
    if (response.stop_reason === "refusal") return { ok: false, error: "api" };
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as AskOutput;
    if (!Array.isArray(output?.findings)) return { ok: false, error: "api" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.error(`[ask-record] error client=${clientId} status=${status}`);
    return { ok: false, error: "api" };
  }

  // Cite-or-decline enforced structurally: findings with no valid evidence
  // move to notEstablished rather than standing as unsupported claims.
  const validIds = new Set(items.map((i) => i.id));
  const kept: AskOutput["findings"] = [];
  for (const f of output.findings) {
    f.evidenceIds = f.evidenceIds.filter((id) => validIds.has(id));
    if (f.evidenceIds.length > 0) kept.push(f);
    else output.notEstablished.push(f.statement);
  }
  output.findings = kept;

  const answer = await prisma.askRecordAnswer.create({
    data: {
      clientId,
      question,
      model: `${model} · ${ASK_VERSION}`,
      output: output as unknown as object,
      askedById: practitionerId,
    },
  });
  console.log(
    `[ask-record] answered client=${clientId} findings=${output.findings.length} declined=${output.notEstablished.length}`,
  );
  return { ok: true, answerId: answer.id };
}
