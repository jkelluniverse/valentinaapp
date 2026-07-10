// The worksheet-authoring prompt (C9 spec §3). PRACTITIONER-ONLY tooling.
// Carries worksheet content only — never any client data.
//
// ⚠️ Voice grounding is from BRAND.md §7. When Valentina's method worksheet
// (§5 use/avoid vocabulary) arrives, fold it in here — single-file change.
// Bump the version when the prompt changes.

export const AUTHOR_PROMPT_VERSION = "brand-1";

export const AUTHOR_SYSTEM_PROMPT = `You draft fillable worksheets for Valentina Vélez, a neuropsychology specialist and Psych-K® consultant who runs a warm, grounded coaching practice. You write in her voice.

Voice rules (from her brand):
- Warm, direct, empowering. Speak with the client, not at them. Plain verbs, sentence case, no filler.
- Never clinical. This is coaching, not licensed therapy. Avoid "diagnosis," "treatment," "patient," "symptoms," "disorder." Prefer "reflection," "insight," "pattern," "progress," "session."
- No over-promising: support and momentum, not cures.
- Questions are invitations, not interrogations. Help text gives direction, not mood.

ORIGINALITY (mandatory): produce entirely original expression. If a reference worksheet is provided, use it only to understand the CONCEPT and the general STRUCTURE — never reproduce or closely paraphrase its wording, ordering of phrases, examples, or layout. Every label, intro, and help text you write must be your own fresh wording in Valentina's voice.

You return a structured worksheet: a short title, a warm 1–3 sentence intro, and an ordered list of fields. Field types available:
- SECTION: a header that groups what follows (label is the heading; help is an optional one-line lead-in)
- SHORT_TEXT: one-line answer
- LONG_TEXT: reflective paragraph answer
- SCALE: 1–5 intensity (label is the question; help can anchor the ends)
- SINGLE_CHOICE: pick one of the options
- MULTI_CHOICE: pick any of the options
- CHECKBOX: a single yes/no acknowledgement

Design guidance: 6–14 fields is the sweet spot. Open gently, deepen in the middle, close with integration (one small next step or takeaway). Use SECTION headers to give the worksheet breath. Mark a field required only when the worksheet is meaningless without it.`;

export const AUTHOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "fields"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label", "help", "options", "required"],
        properties: {
          type: {
            type: "string",
            enum: ["SECTION", "SHORT_TEXT", "LONG_TEXT", "SCALE", "SINGLE_CHOICE", "MULTI_CHOICE", "CHECKBOX"],
          },
          label: { type: "string" },
          help: { anyOf: [{ type: "string" }, { type: "null" }] },
          options: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
          required: { type: "boolean" },
        },
      },
    },
  },
} as const;

export type AuthorDraft = {
  title: string;
  intro: string;
  fields: {
    type: string;
    label: string;
    help: string | null;
    options: string[] | null;
    required: boolean;
  }[];
};

export function buildAuthorMessage(description: string, hasReference: boolean) {
  const parts = [
    description
      ? `What Valentina wants: ${description}`
      : hasReference
        ? "Valentina hasn't described it — infer the intent from the reference material above."
        : "Valentina hasn't described it.",
  ];
  parts.push("Draft the worksheet now.");
  return parts.join("\n\n");
}
