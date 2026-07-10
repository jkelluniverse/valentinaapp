import Anthropic from "@anthropic-ai/sdk";
import {
  LIBRARY_AUTHOR_SYSTEM_PROMPT,
  LIBRARY_AUTHOR_OUTPUT_SCHEMA,
  LIBRARY_AUTHOR_VERSION,
  type LibraryDraft,
} from "@/ai/libraryAuthorPrompt";
import type { PromptKind } from "@prisma/client";

// Server-side drafting of a library item (prompt/exercise/check-in).
// Payload = the practitioner's description + reference blocks; never client data.

export type LibraryAuthorResult =
  | { ok: true; kind: PromptKind; title: string; body: string }
  | { ok: false; error: "config" | "empty" | "api" };

export async function draftLibraryItem(
  description: string,
  referenceBlocks: Anthropic.ContentBlockParam[],
): Promise<LibraryAuthorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "config" };
  if (!description.trim() && referenceBlocks.length === 0) return { ok: false, error: "empty" };

  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
  const anthropic = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });

  const content: Anthropic.ContentBlockParam[] = [
    ...referenceBlocks,
    {
      type: "text",
      text: `${
        description.trim()
          ? `What Valentina wants: ${description.trim().slice(0, 2000)}`
          : "Valentina hasn't described it — infer the intent from the reference material."
      }\n\nDraft the item now.`,
    },
  ];

  try {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: LIBRARY_AUTHOR_SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: LIBRARY_AUTHOR_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content }],
    };
    const response = await anthropic.messages.create(params);

    if (response.stop_reason === "refusal") return { ok: false, error: "api" };
    const textBlock = response.content.find(
      (b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text",
    );
    if (!textBlock) return { ok: false, error: "api" };

    const draft = JSON.parse(textBlock.text) as LibraryDraft;
    if (!draft?.title || !draft?.body) return { ok: false, error: "api" };
    const kind: PromptKind = ["PROMPT", "EXERCISE", "CHECK_IN"].includes(draft.kind)
      ? (draft.kind as PromptKind)
      : "PROMPT";

    console.log(`[library-author] drafted model=${model} prompt=${LIBRARY_AUTHOR_VERSION} kind=${kind}`);
    return { ok: true, kind, title: draft.title, body: draft.body };
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : "network";
    console.log(`[library-author] error model=${model} status=${status}`);
    return { ok: false, error: "api" };
  }
}
