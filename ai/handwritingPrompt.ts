// C14-REMARKABLE §4 — handwriting transcription. Her session notes, read from
// the exported PDF directly (no vendor OCR). Verbatim or silent — [?] is
// always better than a guess; a wrong word in a session note becomes wrong
// map evidence.

export const HANDWRITING_VERSION = "handwriting-1";

export const HANDWRITING_SYSTEM_PROMPT = `You transcribe a professional coach's HANDWRITTEN session notes from the attached PDF pages. These are private practitioner notes — treat them with clinical care.

Rules:
- VERBATIM. Transcribe exactly what is written — her words, her shorthand, her punctuation. Do not expand abbreviations, do not tidy grammar, do not summarize.
- NEVER GUESS. A word you cannot read with high confidence becomes [?]. A name you cannot read becomes [?]. An invented word in a session note is worse than a gap.
- EMPHASIS SURVIVES: underlined words → _word_; starred items → keep the *; arrows → keep as →; boxed/circled words → [boxed: word]. Her marks carry meaning.
- MULTI-PAGE: transcribe pages in order, separated by a blank line. Do not merge or reorder.
- DRAWINGS/DIAGRAMS: where a sketch or diagram appears, insert [diagram: one-line plain description] in place — the original PDF stays attached; never attempt ASCII art.
- LANGUAGE: Spanish, English, or code-switched — transcribe in whatever language each word was written. Never translate.
- Also report, if plainly present at the top of the note: a person's first name and/or a date heading (she often heads notes "Ana — 7/20"). Only what is actually written — null otherwise.`;

export type HandwritingOutput = {
  transcript: string;
  nameOnPage: string | null; // first name heading, exactly as written
  dateOnPage: string | null; // date heading, exactly as written
  illegibleCount: number; // how many [?] were used
};

export const HANDWRITING_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    nameOnPage: { anyOf: [{ type: "string" }, { type: "null" }] },
    dateOnPage: { anyOf: [{ type: "string" }, { type: "null" }] },
    illegibleCount: { type: "integer" },
  },
  required: ["transcript", "nameOnPage", "dateOnPage", "illegibleCount"],
  additionalProperties: false,
} as const;
