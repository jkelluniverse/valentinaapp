// C12X §7 (domain K) — Belief Work statement machinery. The 8 criteria are
// enforced twice: mechanically where language can be linted, and by the
// approval gate (no statement is usable until the CLIENT approves wording —
// stored on BeliefWork.approvedStatement/approvedAt, checked everywhere).

import Anthropic from "@anthropic-ai/sdk";

export const STATEMENT_CRITERIA = [
  { key: "positive", label: "Stated positively (what IS wanted, no negations)" },
  { key: "present", label: "Present tense (as if already true)" },
  { key: "meaningful", label: "Personally meaningful (her judgment, with the client)" },
  { key: "internal", label: "Internally focused (about self, not circumstances)" },
  { key: "noControl", label: "Doesn't control other people" },
  { key: "specific", label: "Specific enough to recognize" },
  { key: "flexible", label: "Flexible (no rigid absolutes)" },
  { key: "approved", label: "Client-approved wording before any use" },
] as const;

export type StatementLint = {
  pass: boolean;
  checks: { key: string; ok: boolean | null; note: string }[]; // null = human judgment
};

// Mechanical lint for the criteria language can carry. "Meaningful" and final
// approval are human; they render as judgment checkboxes, never auto-passed.
export function lintStatement(text: string): StatementLint {
  const t = text.trim().toLowerCase();
  const checks: StatementLint["checks"] = [];

  const negations = /\b(not|never|no longer|won't|don't|can't|stop|quit|nunca|no\s|dejar de)\b/;
  checks.push({
    key: "positive",
    ok: !negations.test(` ${t} `),
    note: "no negations ('not', 'never', 'stop', 'dejar de'…)",
  });

  const future = /\b(will|going to|someday|voy a|seré|podré|algún día)\b/;
  checks.push({ key: "present", ok: !future.test(t), note: "present tense, not future" });

  checks.push({ key: "meaningful", ok: null, note: "her judgment, with the client" });

  const firstPerson = /\b(i|i'm|i am|my|me|yo|soy|estoy|mi|me)\b/;
  checks.push({ key: "internal", ok: firstPerson.test(t), note: "first-person, about self" });

  const controlling = /\b(make (him|her|them)|makes? people|get (him|her|them) to|hacer que (él|ella|ellos))\b/;
  checks.push({ key: "noControl", ok: !controlling.test(t), note: "no controlling others" });

  checks.push({ key: "specific", ok: t.length >= 15, note: "specific enough to recognize" });

  const absolutes = /\b(always|every single|perfectly|completely|totally|siempre|perfectamente|completamente)\b/;
  checks.push({ key: "flexible", ok: !absolutes.test(t), note: "no rigid absolutes" });

  checks.push({ key: "approved", ok: null, note: "client approves the final wording in session" });

  return { pass: checks.every((c) => c.ok !== false), checks };
}

// Generate 3 statement OPTIONS from a limiting belief (never pre-approved).
export async function generateStatementOptions(
  belief: string,
  locale: "en" | "es",
): Promise<{ ok: true; options: string[] } | { ok: false; error: "config" | "api" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  try {
    const params = {
      model,
      max_tokens: 1000,
      system:
        `You draft PSYCH-K-style goal-statement OPTIONS from a limiting belief, for a professional coach to explore WITH her client. Rules — every option must be: positive (no negations), present tense, personally meaningful in spirit, internally focused, free of controlling other people, specific, flexible (no absolutes like "always"/"perfectly"). Write in ${locale === "es" ? "natural Latin American Spanish (es-419), first person" : "English, first person"}. These are OPTIONS ONLY — the client chooses and adapts the wording; never present them as final.`,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              options: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
            },
            required: ["options"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user" as const, content: `Limiting belief (their wording): ${belief}` }],
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const response = await anthropic.messages.create(params);
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };
    const parsed = JSON.parse(textBlock.text) as { options?: string[] };
    if (!parsed.options?.length) return { ok: false, error: "api" };
    return { ok: true, options: parsed.options };
  } catch {
    console.error("[belief-statements] generation failed");
    return { ok: false, error: "api" };
  }
}
