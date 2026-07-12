import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { getClientRecord } from "@/lib/client-record";
import {
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  INTEGRATIVE_VERSION,
  buildUserMessage,
  type IntegrativeOutput,
} from "@/ai/integrativePrompt";

// C12.5 — the synthesis pipeline, following C5's non-negotiables:
// server-side only; unified consent required (AMENDMENT-01); pseudonymized
// payload; metadata-only logging. Plus C12's own gate: her method text must
// exist — the app never invents the integration logic.

export const METHOD_SETTING_KEY = "synthesisMethod";

export type SynthesisResult =
  | { ok: true }
  | { ok: false; error: "consent" | "config" | "method" | "lenses" | "api" };

export async function getMethodText(): Promise<string | null> {
  const row = await prisma.practiceSetting.findUnique({ where: { key: METHOD_SETTING_KEY } });
  const value = row?.value.trim();
  return value ? value : null;
}

export async function runIntegrativeSynthesis(
  clientId: string,
  practitionerId: string,
): Promise<SynthesisResult> {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client || !(await hasConsent(client.id))) return { ok: false, error: "consent" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };

  const method = await getMethodText();
  if (!method) return { ok: false, error: "method" };

  const lenses = await prisma.lensResult.findMany({ where: { userId: clientId } });
  const hd = lenses.find((l) => l.lens === "HUMAN_DESIGN");
  const gk = lenses.find((l) => l.lens === "GENE_KEYS");
  const spiral = lenses.find((l) => l.lens === "SPIRAL");
  // At minimum the birth-data lenses must exist; the spiral joins when
  // reviewed (she signs off before it enters the synthesis — spec §5c).
  if (!hd || !gk) return { ok: false, error: "lenses" };

  const rec = await getClientRecord(clientId);
  const payload = {
    method,
    lenses: {
      humanDesign: hd.result,
      geneKeys: gk.result,
      valuesSpiral: spiral?.practitionerReviewed
        ? spiral.result
        : { note: "not yet available (assessment pending or awaiting practitioner review)" },
    },
    recurringThemes: rec.themes.slice(0, 6).map((t) => t.tag),
  };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  let output: IntegrativeOutput;
  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
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
      console.log(`[integrative] refusal client=${client.id} model=${model}`);
      return { ok: false, error: "api" };
    }
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    output = JSON.parse(textBlock.text) as IntegrativeOutput;
    if (!Array.isArray(output?.throughlines)) return { ok: false, error: "api" };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[integrative] error client=${client.id} model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }

  const narrative = [
    ...output.throughlines.map((t) => `${t.title}: ${t.hypothesis}`),
    ...output.tensions.map((t) => `Tension (${t.between}): ${t.hypothesis}`),
  ].join("\n\n");

  const data = {
    synthesis: output as unknown as object,
    narrative,
    version: `${model} · ${INTEGRATIVE_VERSION}`,
    generatedAt: new Date(),
  };
  await prisma.integrativeProfile.upsert({
    where: { userId: clientId },
    create: { userId: clientId, ...data },
    update: data,
  });

  // Audit — metadata only.
  console.log(
    `[integrative] ran client=${client.id} by=${practitionerId} model=${model} prompt=${INTEGRATIVE_VERSION} spiral=${Boolean(spiral?.practitionerReviewed)}`,
  );
  return { ok: true };
}
