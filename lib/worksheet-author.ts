import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  AUTHOR_SYSTEM_PROMPT,
  AUTHOR_OUTPUT_SCHEMA,
  AUTHOR_PROMPT_VERSION,
  TRANSLATE_SYSTEM_PROMPT,
  buildAuthorMessage,
  buildTranslateMessage,
  type AuthorDraft,
} from "@/ai/worksheetAuthorPrompt";
import { FIELD_TYPES, type WorksheetField, type FieldType } from "@/lib/worksheet-meta";

// AI worksheet authoring (C9 spec §3). Server-side only; the payload is the
// practitioner's description/reference — never client data. Metadata-only logs.
//
// AMD-05 A5.5 — translate mode: pass `translateFrom` to draft the Spanish
// (es-419) version of an existing worksheet in Valentina's voice. Field ids,
// types, and required flags are copied POSITIONALLY from the original — the
// model only supplies translated display text — so answers keyed on field ids
// stay compatible with the original by construction.

export type AuthorResult =
  | { ok: true; title: string; intro: string; fields: WorksheetField[] }
  | { ok: false; error: "config" | "empty" | "api" };

export type TranslateSource = {
  title: string;
  intro: string | null;
  schema: WorksheetField[];
};

export async function draftWorksheet(
  description: string,
  referenceBlocks: Anthropic.ContentBlockParam[],
  opts: { translateFrom?: TranslateSource; targetLocale?: "es" } = {},
): Promise<AuthorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };
  const translateFrom = opts.translateFrom;
  if (translateFrom && translateFrom.schema.length === 0) return { ok: false, error: "empty" };
  if (!translateFrom && !description.trim() && referenceBlocks.length === 0) {
    return { ok: false, error: "empty" };
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: translateFrom ? TRANSLATE_SYSTEM_PROMPT : AUTHOR_SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: AUTHOR_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: translateFrom
            ? [
                {
                  type: "text",
                  text: buildTranslateMessage(
                    JSON.stringify({
                      title: translateFrom.title,
                      intro: translateFrom.intro,
                      // Ids stay server-side; the model sees position, type, text.
                      fields: translateFrom.schema.map((f, i) => ({
                        position: i + 1,
                        type: f.type,
                        label: f.label,
                        help: f.help ?? null,
                        options: f.options ?? null,
                        required: Boolean(f.required),
                      })),
                    }),
                  ),
                },
              ]
            : [
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

    if (translateFrom) {
      // Positional merge: structure (id/type/required/option-count) is the
      // original's, verbatim; only display text comes from the draft.
      if (draft.fields.length !== translateFrom.schema.length) return { ok: false, error: "api" };
      const fields: WorksheetField[] = translateFrom.schema.map((orig, i) => {
        const t = draft.fields[i];
        const next: WorksheetField = { ...orig };
        if (t?.label?.trim()) next.label = t.label.trim();
        if (orig.help && t?.help?.trim()) next.help = t.help.trim();
        if (orig.options?.length) {
          next.options =
            t?.options && t.options.length === orig.options.length
              ? t.options.map((o, j) => o.trim() || orig.options![j])
              : orig.options;
        }
        return next;
      });
      console.log(
        `[worksheet-author] translated model=${model} prompt=${AUTHOR_PROMPT_VERSION} fields=${fields.length} target=es`,
      );
      return { ok: true, title: draft.title, intro: draft.intro ?? "", fields };
    }

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
