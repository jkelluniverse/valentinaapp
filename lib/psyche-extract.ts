import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import type { NodeKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { massFromEvidence, RELATIONS } from "@/lib/psyche";
import {
  buildSystemPrompt,
  OUTPUT_SCHEMA,
  EXTRACT_VERSION,
  buildUserMessage,
  type ExtractOutput,
  type PractitionerLocale,
} from "@/ai/psycheExtractPrompt";

// C16.2 / C16.7 — the extraction pipeline. C5 non-negotiables hold: server-side
// only; unified consent; pseudonymized payload; mandatory referral layer;
// metadata-only logging (never record content, node labels, or map material).
//
// Long memory (§3.5): incremental runs read only NEW record items since the
// last extraction; a DEEP pass re-reads the whole record to catch slow arcs.
// Evidence never expires — weight is cumulative mass; recency only drives glow.

export const NOTES_SOURCE_KEY = "psycheIncludeNotes"; // her toggle, default off
const INCREMENTAL_CAP = 150;
const DEEP_CAP = 400;
const KINDS: NodeKind[] = [
  "WOUND",
  "SHADOW",
  "CORE_BELIEF",
  "PROTECTION",
  "PATTERN",
  "BEHAVIOR",
  "TRAIT",
  "RESOURCE",
  "GIFT",
];
const K_FLOOR = 5; // §3.6 — patterns must describe at least this many clients

export type ExtractResult =
  | { ok: true; created: number; updated: number; edges: number; referral: boolean }
  | { ok: false; error: "consent" | "config" | "empty" | "api" };

function strip(text: string | null | undefined, identifiers: string[]): string {
  if (!text) return "";
  let out = text;
  for (const id of identifiers) if (id) out = out.split(id).join("[client]");
  return out;
}

export async function runPsycheExtraction(
  clientId: string,
  practitionerId: string,
  // AMD-05 — practitionerLocale: extraction labels are HER-facing (English today).
  opts: { deep?: boolean; practitionerLocale?: PractitionerLocale } = {},
): Promise<ExtractResult> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { ok: false, error: "consent" };
  if (!(await hasConsent(client.id))) return { ok: false, error: "consent" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  const deep = Boolean(opts.deep);
  const lastRun = deep
    ? null
    : await prisma.psycheExtraction.findFirst({
        where: { clientId },
        orderBy: { scopeTo: "desc" },
        select: { scopeTo: true },
      });
  const scopeFrom = lastRun?.scopeTo ?? null;
  const scopeTo = new Date();

  // ---- Assemble (whole-portal per §3.5; C4 is the amalgamated record) ----
  const items = await prisma.recordItem.findMany({
    where: {
      clientId,
      ...(scopeFrom ? { occurredAt: { gt: scopeFrom, lte: scopeTo } } : { occurredAt: { lte: scopeTo } }),
    },
    orderBy: { occurredAt: "desc" },
    take: deep ? DEEP_CAP : INCREMENTAL_CAP,
    select: { id: true, kind: true, title: true, summary: true, tags: true, occurredAt: true },
  });
  if (items.length === 0) return { ok: false, error: "empty" };

  const identifiers = [client.name ?? "", client.email, client.email.split("@")[0]].filter(Boolean);

  const [existingNodes, existingEdges, hd, notesEnabled] = await Promise.all([
    prisma.psycheNode.findMany({
      where: { clientId, state: { not: "ARCHIVED" } },
      select: { id: true, kind: true, label: true, state: true, giftLabel: true },
    }),
    prisma.psycheEdge.findMany({
      where: { clientId },
      select: { fromId: true, toId: true, relation: true },
    }),
    prisma.humanDesignChart.findUnique({
      where: { userId: clientId },
      select: { type: true, profile: true, authority: true },
    }),
    prisma.practiceSetting.findUnique({ where: { key: NOTES_SOURCE_KEY } }),
  ]);

  // Her notes as CONTEXT only (no ids — they are never evidence), if enabled.
  let notesContext: string[] = [];
  if (notesEnabled?.value === "true") {
    const notes = await prisma.note.findMany({
      where: { clientId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { body: true },
    });
    notesContext = notes.map((n) => strip(n.body, identifiers).slice(0, 400));
  }

  // The Pattern Library vocabulary — abstractions only, k-floored (§3.6).
  const [archetypes, links] = await Promise.all([
    prisma.patternArchetype.findMany({
      where: { clientCount: { gte: K_FLOOR } },
      select: { kind: true, label: true, definition: true },
    }),
    prisma.patternLink.findMany({ where: { clientCount: { gte: K_FLOOR } } }),
  ]);
  const archetypeById = new Map<string, string>();

  const payload = {
    material: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: strip(i.title, identifiers),
      text: strip(i.summary, identifiers),
      tags: i.tags,
      when: i.occurredAt.toISOString().slice(0, 10),
    })),
    existingMap: {
      nodes: existingNodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        state: n.state,
      })),
      edges: existingEdges.map((e) => ({ from: e.fromId, to: e.toId, relation: e.relation })),
    },
    charts: hd ? { humanDesign: { type: hd.type, profile: hd.profile, authority: hd.authority } } : null,
    practitionerNotesContext: notesContext.length > 0 ? notesContext : undefined,
    sharedVocabulary:
      archetypes.length > 0
        ? archetypes.map((a) => ({ kind: a.kind, label: a.label, definition: a.definition }))
        : undefined,
    pass: deep ? "deep (full record)" : "incremental (new material only)",
  };

  // ---- Call (C5 pattern) ----
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey });
  let output: ExtractOutput;
  try {
    const params: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 8000,
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
      console.log(`[psyche-extract] refusal client=${client.id} model=${model}`);
      return { ok: false, error: "api" };
    }
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as ExtractOutput;
    if (typeof output?.referral?.flag !== "boolean") return { ok: false, error: "api" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[psyche-extract] error client=${client.id} model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }

  // ---- Apply, defensively ----
  const validIds = new Set(items.map((i) => i.id));
  const okEvidence = (ids: string[]) => ids.filter((id) => validIds.has(id));
  const byLabel = new Map(existingNodes.map((n) => [n.label.trim().toLowerCase(), n.id]));
  const nodeIds = new Set(existingNodes.map((n) => n.id));

  let created = 0;
  let updated = 0;
  let edgesCreated = 0;

  if (!output.referral.flag) {
    // New nodes — conservative: strong single evidence, or repetition (2+ items).
    for (const n of output.newNodes ?? []) {
      const evidence = okEvidence(n.evidenceIds ?? []);
      if (evidence.length === 0) continue;
      if (n.confidence !== "strong" && evidence.length < 2) continue;
      if (!KINDS.includes(n.kind as NodeKind)) continue;
      const key = n.label.trim().toLowerCase();
      const existingId = byLabel.get(key);
      if (existingId) {
        // Same meaning already mapped — attach instead of duplicating.
        output.attachments = [...(output.attachments ?? []), { nodeId: existingId, evidenceIds: evidence }];
        continue;
      }
      const node = await prisma.psycheNode.create({
        data: {
          clientId,
          kind: n.kind as NodeKind,
          label: n.label.trim().slice(0, 120),
          description: n.description?.slice(0, 1500) || null,
          giftLabel: n.giftLabel?.trim().slice(0, 120) || null,
          source: "AI_EXTRACTED",
          evidenceRecordItemIds: evidence,
          weight: massFromEvidence(evidence.length),
        },
      });
      byLabel.set(key, node.id);
      nodeIds.add(node.id);
      created++;
    }

    // Attachments — weaker signals strengthen existing nodes.
    for (const a of output.attachments ?? []) {
      if (!nodeIds.has(a.nodeId)) continue;
      const evidence = okEvidence(a.evidenceIds ?? []);
      if (evidence.length === 0) continue;
      const node = await prisma.psycheNode.findFirst({ where: { id: a.nodeId, clientId } });
      if (!node) continue;
      const merged = [...new Set([...node.evidenceRecordItemIds, ...evidence])];
      if (merged.length === node.evidenceRecordItemIds.length) continue;
      await prisma.psycheNode.update({
        where: { id: node.id },
        data: { evidenceRecordItemIds: merged, weight: massFromEvidence(merged.length) },
      });
      updated++;
    }

    // Edges — resolve by id or by label of a just-created/existing node.
    const resolve = (ref: string): string | null =>
      nodeIds.has(ref) ? ref : byLabel.get(ref.trim().toLowerCase()) ?? null;
    for (const e of output.newEdges ?? []) {
      const fromId = resolve(e.from);
      const toId = resolve(e.to);
      const evidence = okEvidence(e.evidenceIds ?? []);
      if (!fromId || !toId || fromId === toId) continue;
      if (!RELATIONS.includes(e.relation as (typeof RELATIONS)[number])) continue;
      const existing = await prisma.psycheEdge.findUnique({
        where: { fromId_toId_relation: { fromId, toId, relation: e.relation } },
      });
      if (existing) {
        const merged = [...new Set([...existing.evidenceRecordItemIds, ...evidence])];
        await prisma.psycheEdge.update({
          where: { id: existing.id },
          data: { evidenceRecordItemIds: merged, weight: massFromEvidence(merged.length) },
        });
      } else {
        await prisma.psycheEdge.create({
          data: {
            clientId,
            fromId,
            toId,
            relation: e.relation,
            evidenceRecordItemIds: evidence,
            weight: massFromEvidence(Math.max(1, evidence.length)),
          },
        });
        edgesCreated++;
      }
    }

    // Loosening suggestions — stored for Valentina to confirm, never auto-applied.
    for (const s of output.stateSuggestions ?? []) {
      if (!nodeIds.has(s.nodeId)) continue;
      await prisma.psycheNode.updateMany({
        where: { id: s.nodeId, clientId, state: "ACTIVE" },
        data: { suggestedState: "LOOSENING", suggestedReason: s.reason.slice(0, 500) },
      });
    }
  }

  const run = await prisma.psycheExtraction.create({
    data: {
      clientId,
      requestedById: practitionerId,
      deep,
      scopeFrom,
      scopeTo,
      model: `${model} · prompt:${EXTRACT_VERSION}`,
      nodesCreated: created,
      nodesUpdated: updated,
      edgesCreated,
      referralFlag: output.referral.flag,
    },
    select: { id: true },
  });

  // Metadata only — never labels, content, or map material.
  console.log(
    `[psyche-extract] ran client=${client.id} run=${run.id} deep=${deep} items=${items.length} created=${created} updated=${updated} edges=${edgesCreated} referral=${output.referral.flag}`,
  );
  void archetypeById; // (reserved for future link hints)
  void links;

  return { ok: true, created, updated, edges: edgesCreated, referral: output.referral.flag };
}
