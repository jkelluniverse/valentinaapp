import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { IntegrativeReading } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SpherePosition } from "@/lib/gene-keys";
import {
  buildSystemPrompt,
  buildUserMessage,
  READING_VERSION,
  type ReadingLocale,
} from "@/ai/integrativeReadingPrompt";

// C12 reading pipeline. THE BRIGHT LINE (spec §2, §9): the reading is generated
// from the three CHARTS ONLY. This module reads exclusively from chart tables
// (HumanDesignChart + LensResult) and NEVER from RecordItem/LogEntry/responses.
// If you are tempted to add record data here, don't — that would cross the one
// line that makes this output safe to show a client.

export const READING_HOLD_KEY = "readingHoldForReview";

export type ChartPayload = {
  humanDesign: {
    type: string | null;
    strategy: string | null;
    authority: string | null;
    profile: string | null;
    definition: string | null;
    centers: unknown;
    channels: unknown;
    accuracyNote: string | null;
  };
  geneKeys: { spheres: SpherePosition[] } | null;
  valuesSpiral: {
    centerOfGravity?: string;
    practitionerCenter?: string;
    weights?: { stage: string; label: string; weight: number }[];
  } | null;
};

// Assemble the chart-only payload. Returns null if the birth-data chart is
// missing entirely. `complete` tells whether all three maps are present.
export async function assembleCharts(
  userId: string,
): Promise<{ payload: ChartPayload; complete: boolean; hasSpiral: boolean } | null> {
  const [hd, lenses] = await Promise.all([
    prisma.humanDesignChart.findUnique({ where: { userId } }),
    prisma.lensResult.findMany({ where: { userId, lens: { in: ["GENE_KEYS", "SPIRAL"] } } }),
  ]);
  if (!hd) return null;

  const gk = lenses.find((l) => l.lens === "GENE_KEYS")?.result as { spheres?: SpherePosition[] } | undefined;
  const spiral = lenses.find((l) => l.lens === "SPIRAL")?.result as ChartPayload["valuesSpiral"] | undefined;

  const payload: ChartPayload = {
    humanDesign: {
      type: hd.type,
      strategy: hd.strategy,
      authority: hd.authority,
      profile: hd.profile,
      definition: hd.definition,
      centers: hd.centers,
      channels: hd.channels,
      accuracyNote: hd.accuracyNote,
    },
    geneKeys: gk?.spheres ? { spheres: gk.spheres } : null,
    valuesSpiral: spiral ?? null,
  };

  const hasSpiral = Boolean(spiral);
  const complete = Boolean(payload.geneKeys) && hasSpiral;
  return { payload, complete, hasSpiral };
}

// AMD-05 A5.2 — the reader's locale is part of the input: switching language
// regenerates the reading cleanly. "en" adds no suffix so every reading hashed
// before locales existed stays valid (no surprise mass regeneration).
export function chartInputHash(payload: ChartPayload, locale: ReadingLocale = "en"): string {
  const shape = {
    hd: {
      type: payload.humanDesign.type,
      strategy: payload.humanDesign.strategy,
      authority: payload.humanDesign.authority,
      profile: payload.humanDesign.profile,
      definition: payload.humanDesign.definition,
      accuracyNote: payload.humanDesign.accuracyNote,
    },
    gk: payload.geneKeys?.spheres.map((s) => `${s.key}:${s.geneKey}.${s.line}`) ?? null,
    spiral: payload.valuesSpiral?.practitionerCenter ?? payload.valuesSpiral?.centerOfGravity ?? null,
    spiralWeights: payload.valuesSpiral?.weights?.map((w) => `${w.stage}:${w.weight}`) ?? null,
  };
  const input = JSON.stringify(shape) + (locale === "en" ? "" : `|locale:${locale}`);
  return createHash("sha256").update(input).digest("hex");
}

async function holdForReview(): Promise<boolean> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: READING_HOLD_KEY } });
  return row?.value === "1";
}

export type ReadingResult =
  | { ok: true; reading: IntegrativeReading }
  | { ok: false; error: "incomplete" | "config" | "api" | "no-charts" };

// Generate + store the reading. Idempotent by inputHash unless `force`.
export async function ensureReading(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<ReadingResult> {
  const charts = await assembleCharts(userId);
  if (!charts) return { ok: false, error: "no-charts" };
  if (!charts.complete) return { ok: false, error: "incomplete" };

  // AMD-05 A5.2 — the reading is written in the READER's language. Evidence-free
  // by construction (charts only), so the whole text renders in their locale.
  const reader = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const locale: ReadingLocale = reader?.locale === "es" ? "es" : "en";

  const hash = chartInputHash(charts.payload, locale);
  const existing = await prisma.integrativeReading.findUnique({ where: { userId } });
  if (!opts.force && existing && existing.inputHash === hash) {
    return { ok: true, reading: existing };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });

  let content: string;
  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt(locale),
      messages: [{ role: "user", content: buildUserMessage(JSON.stringify(charts.payload)) }],
    };
    const response = await anthropic.messages.create(params);
    if (response.stop_reason === "refusal") {
      console.log(`[reading] refusal user=${userId} model=${model}`);
      return { ok: false, error: "api" };
    }
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock || textBlock.text.trim().length < 200) return { ok: false, error: "api" };
    content = textBlock.text.trim();
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[reading] error user=${userId} model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }

  const status = (await holdForReview()) ? "PENDING_REVIEW" : "PUBLISHED";
  const data = {
    content,
    model: `${model} · ${READING_VERSION}`,
    inputHash: hash,
    status,
    editedByPractitioner: false,
    generatedAt: new Date(),
  };
  const reading = await prisma.integrativeReading.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  console.log(
    `[reading] generated user=${userId} model=${model} status=${status} locale=${locale} chars=${content.length}`,
  );
  return { ok: true, reading };
}
