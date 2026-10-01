import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { isCrisisSignal } from "@/lib/message-safety";
import {
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  DEEPEN_VERSION,
  buildUserMessage,
  type DeepenOutput,
} from "@/ai/deepeningPrompt";

// C17.1 — the Deepening pass. SAFETY-FIRST ordering is the whole shape: a
// deterministic crisis screen runs BEFORE any AI call, so a distressed client
// is never probed and never waits on a model. Otherwise a single pseudonymized
// pass reads the entry + light map context and returns ≤1 optional door, tuned
// to the client's apparent state. No entry content is ever logged.

export type DoorOffer = {
  deepeningId: string;
  crisis: boolean;
  pacing: string;
  door: string | null;
  question: string | null;
  groundingNote: string | null;
  routeToSession: boolean;
  connection: { line: string; snippet: string; when: string } | null;
};

const RECENT_FOR_ECHO = 30;

function strip(text: string | null | undefined, ids: string[]): string {
  if (!text) return "";
  let out = text;
  for (const id of ids) if (id) out = out.split(id).join("[me]");
  return out;
}

// Always returns an offer object (never throws into the keep flow). On any
// failure it degrades to "no door" — closure still completes.
export async function runDeepening(entryId: string, clientId: string): Promise<DoorOffer> {
  const none = (over: Partial<DoorOffer> = {}): DoorOffer => ({
    deepeningId: "",
    crisis: false,
    pacing: "settled",
    door: null,
    question: null,
    groundingNote: null,
    routeToSession: false,
    connection: null,
    ...over,
  });

  const entry = await prisma.logEntry.findFirst({
    where: { id: entryId, clientId },
    select: { id: true, body: true, trigger: true, mood: true },
  });
  if (!entry) return none();

  // ---- (1) SAFETY FIRST — deterministic, before any AI call ----
  if (isCrisisSignal(entry.body) || (entry.trigger && isCrisisSignal(entry.trigger))) {
    const d = await prisma.entryDeepening.create({
      data: { entryId, clientId, pacing: "crisis", crisis: true, routeToSession: true },
    });
    console.log(`[deepening] crisis client=${clientId} entry=${entryId} — deepening suppressed`);
    return none({ deepeningId: d.id, crisis: true, pacing: "crisis", routeToSession: true });
  }

  if (!(await hasConsent(clientId))) return none();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No AI configured — closure still completes, just no door.
    const d = await prisma.entryDeepening.create({ data: { entryId, clientId, pacing: "settled" } });
    return none({ deepeningId: d.id });
  }

  // ---- Assemble (pseudonymized): the entry, map themes, their OWN echoes ----
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { name: true, email: true },
  });
  const identifiers = [client?.name ?? "", client?.email ?? "", client?.email?.split("@")[0] ?? ""].filter(Boolean);

  const [themes, priors] = await Promise.all([
    prisma.psycheNode.findMany({
      where: { clientId, state: { not: "ARCHIVED" } },
      select: { label: true, kind: true },
      take: 40,
    }),
    prisma.recordItem.findMany({
      where: { clientId, id: { not: undefined }, sourceType: { in: ["LogEntry", "PsycheNode", "EntryDeepening"] } },
      orderBy: { occurredAt: "desc" },
      take: RECENT_FOR_ECHO,
      select: { id: true, title: true, summary: true, occurredAt: true },
    }),
  ]);
  // Exclude this very entry from the echo candidates.
  const echoes = priors.filter((p) => p.summary && p.summary.trim().length > 0).slice(0, RECENT_FOR_ECHO);

  const payload = {
    reflection: { text: strip(entry.body, identifiers), prompted: strip(entry.trigger, identifiers), intensity: entry.mood },
    mapThemes: themes.map((t) => ({ label: t.label, kind: t.kind })),
    myEarlierReflections: echoes.map((e) => ({
      id: e.id,
      when: e.occurredAt.toISOString().slice(0, 10),
      text: strip(e.summary, identifiers),
    })),
  };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey });
  let out: DeepenOutput;
  try {
    const params: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 1200,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{ role: "user", content: buildUserMessage(JSON.stringify(payload)) }],
    };
    const response = await anthropic.messages.create(params);
    if (response.stop_reason === "refusal") {
      const d = await prisma.entryDeepening.create({ data: { entryId, clientId, pacing: "settled" } });
      return none({ deepeningId: d.id });
    }
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) throw new Error("no text");
    out = JSON.parse(textBlock.text) as DeepenOutput;
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[deepening] error client=${clientId} entry=${entryId} status=${status}`);
    const d = await prisma.entryDeepening.create({ data: { entryId, clientId, pacing: "settled" } });
    return none({ deepeningId: d.id });
  }

  // Model-side safety backstop.
  if (out.crisis?.flag) {
    const d = await prisma.entryDeepening.create({
      data: { entryId, clientId, pacing: "crisis", crisis: true, routeToSession: true },
    });
    return none({ deepeningId: d.id, crisis: true, pacing: "crisis", routeToSession: true });
  }

  // Validate the echo id belongs to THIS client (never cross-client).
  let connection: DoorOffer["connection"] = null;
  let connectionItemId: string | null = null;
  if (out.connection?.itemId) {
    const echo = echoes.find((e) => e.id === out.connection!.itemId);
    if (echo) {
      connectionItemId = echo.id;
      connection = {
        line: out.connection.line.slice(0, 240),
        snippet: echo.summary ?? "",
        when: echo.occurredAt.toISOString(),
      };
    }
  }

  const offer = out.offer;
  const d = await prisma.entryDeepening.create({
    data: {
      entryId,
      clientId,
      pacing: out.pacing || "settled",
      door: offer?.door ?? null,
      question: offer?.question?.slice(0, 300) ?? null,
      groundingNote: out.groundingNote?.slice(0, 300) ?? null,
      routeToSession: Boolean(out.routeToSession),
      connectionItemId,
      connectionLine: connection?.line ?? null,
    },
  });

  console.log(
    `[deepening] ran client=${clientId} entry=${entryId} pacing=${out.pacing} door=${offer?.door ?? "none"} route=${out.routeToSession} echo=${connectionItemId ? "y" : "n"} model=${model} v=${DEEPEN_VERSION}`,
  );

  return {
    deepeningId: d.id,
    crisis: false,
    pacing: out.pacing || "settled",
    door: offer?.door ?? null,
    question: offer?.question ?? null,
    groundingNote: out.groundingNote ?? null,
    routeToSession: Boolean(out.routeToSession),
    connection,
  };
}

// Which doors, when answered, also become a star on the client's own self-map
// (C16.5) — the ones that name a piece of their inner landscape.
export const SELF_MAP_DOORS: Record<string, string> = {
  belief: "CORE_BELIEF",
  origin: "WOUND",
  protection: "PROTECTION",
  resource: "RESOURCE",
  recurrence: "PATTERN",
  connection: "PATTERN",
  somatic: "BEHAVIOR",
  temporal: "PATTERN",
};
