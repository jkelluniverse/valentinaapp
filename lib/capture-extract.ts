import Anthropic from "@anthropic-ai/sdk";

// SESSION-PIPELINE §6 — the extraction pass: one call per session, strict
// JSON, and a claims discipline that lives in code: DESCRIBE, never
// interpret. No diagnosis-adjacent language; crisis-relevant content raises
// a flag for the practitioner instead of being summarized away. Everything
// this returns is a DRAFT — it feeds the review UI, never writes directly.

export type CaptureExtraction = {
  session_summary: string;
  belief_statements: { statement: string; context: string }[];
  themes: string[];
  client_goals_mentioned: string[];
  action_items: { owner: "client" | "practitioner"; item: string }[];
  follow_up_questions: string[];
  notable_quotes: { speaker: string; quote: string; timestamp_ms: number }[];
  flags: string[];
};

const SYSTEM = `You extract a structured session record from a practitioner-client conversation transcript.

Rules, absolute:
- DESCRIBE, never interpret. Record what was said, in the client's own words where possible. Make no claims about mechanisms, outcomes, diagnoses, or the validity of any modality or technique.
- No diagnosis-adjacent language anywhere.
- If the transcript contains crisis-relevant content (self-harm, harm to others, acute distress), add a plain-language entry to "flags" directing the practitioner's attention to it — do not summarize it away, do not counsel.
- Also flag unclear-audio or garbled segments worth the practitioner's review.
- The summary is 3–5 neutral sentences about what was discussed.
- Everything you produce is a draft for practitioner review; write for that reader.

Return ONLY a JSON object with exactly these keys:
{"session_summary": string, "belief_statements": [{"statement","context"}], "themes": [string], "client_goals_mentioned": [string], "action_items": [{"owner":"client"|"practitioner","item"}], "follow_up_questions": [string], "notable_quotes": [{"speaker","quote","timestamp_ms"}], "flags": [string]}`;

export async function extractFromTranscript(
  segments: { speaker: string; text: string; startMs?: number }[],
): Promise<CaptureExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  const transcript = segments
    .map((s) => `[${s.speaker}${s.startMs != null ? ` @${s.startMs}ms` : ""}] ${s.text}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Transcript:\n\n${transcript}\n\nReturn the JSON object.` }],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("extraction returned no JSON object");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as CaptureExtraction;
  // Shape guard — every key present, arrays are arrays.
  parsed.belief_statements ??= [];
  parsed.themes ??= [];
  parsed.client_goals_mentioned ??= [];
  parsed.action_items ??= [];
  parsed.follow_up_questions ??= [];
  parsed.notable_quotes ??= [];
  parsed.flags ??= [];
  if (typeof parsed.session_summary !== "string") throw new Error("extraction missing session_summary");
  return parsed;
}
