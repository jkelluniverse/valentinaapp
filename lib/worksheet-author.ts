import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  AUTHOR_SYSTEM_PROMPT,
  AUTHOR_OUTPUT_SCHEMA,
  AUTHOR_PROMPT_VERSION,
  buildAuthorMessage,
  type AuthorDraft,
} from "@/ai/worksheetAuthorPrompt";
import { FIELD_TYPES, type WorksheetField, type FieldType } from "@/lib/worksheet-meta";

// AI worksheet authoring (C9 spec §3). Server-side only; the payload is the
// practitioner's description/reference — never client data. Metadata-only logs.

export type AuthorResult =
  | { ok: true; title: string; intro: string; fields: WorksheetField[] }
  | { ok: false; error: "config" | "empty" | "api" };

export async function draftWorksheet(
  description: string,
  referenceBlocks: Anthropic.ContentBlockParam[],
): Promise<AuthorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };
  if (!description.trim() && referenceBlocks.length === 0) return { ok: false, error: "empty" };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: AUTHOR_SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: AUTHOR_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            ...referenceBlocks,
            {
              type: "text",
              text: buildAuthorMessage(description.slice(0, 2000), referenceBlocks.length > 0),
            },
          ],
        },
      ],
    };
    const response = await anthropic.messages.create(params);

    if (response.stop_reason === "refusal") return { ok: false, error: "api" };
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };

    const draft = JSON.parse(textBlock.text) as AuthorDraft;
    if (!draft?.title || !Array.isArray(draft.fields)) return { ok: false, error: "api" };

    const fields: WorksheetField[] = draft.fields
      .filter((f) => FIELD_TYPES.includes(f.type as FieldType))
      .map((f) => ({
        id: randomUUID(),
        type: f.type as FieldType,
        label: f.label || "Untitled",
        ...(f.help ? { help: f.help } : {}),
        ...(f.options?.length ? { options: f.options } : {}),
        ...(f.required ? { required: true } : {}),
      }));

    console.log(
      `[worksheet-author] drafted model=${model} prompt=${AUTHOR_PROMPT_VERSION} fields=${fields.length}`,
    );
    return { ok: true, title: draft.title, intro: draft.intro ?? "", fields };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[worksheet-author] error model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }
}
