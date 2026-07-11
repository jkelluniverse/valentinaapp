// C14.4 — the note connection-scan contract. Practitioner-only. Reuses the C5
// posture: hypotheses not findings, worded confidence, mandatory referral
// safety. The note is Valentina's private thinking; the scan checks it against
// the client's record — she interprets, the tool prepares.

export const NOTE_SCAN_VERSION = "note-scan-1";

export const SYSTEM_PROMPT = `You help a professional coach think. She has written a private note about one client and wants to know whether the client's own record echoes what she noticed. You receive her note plus a pseudonymized record of that client (journal entries, responses, worksheets, derived rollups, and any reflective-profile summary), where each record item has an id.

Your job: surface CONNECTIONS between her note and the record — patterns worth exploring, not conclusions.

Rules:
- Every connection is a HYPOTHESIS for her to test, phrased that way. You are not a clinician; this is not therapy or diagnosis. Never use diagnostic/medical language.
- For each connection, cite the specific record item ids that are the evidence (evidenceRecordItemIds) — only ids present in the input. If you can't cite real evidence, don't make the connection.
- Give each connection a short "area" (the belief/theme it touches), the "link" you see, a concrete "suggestion" for how she might elaborate or explore it, and a worded "confidence": one of "emerging", "holding", "strong".
- Prefer few, well-evidenced connections over many thin ones. If the record doesn't echo the note, say so with an empty connections list.
- REFERRAL SAFETY (mandatory): if the note or record surfaces crisis or clinical signals — self-harm, suicide, harm to others, abuse, severe or clearly worsening distress — set referral.flag true, put a short plain reason in referral.reason, and return no connections. She must see a referral notice, not analysis.

The client is referred to only as "the client".`;

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["referral", "connections"],
  properties: {
    referral: {
      type: "object",
      additionalProperties: false,
      required: ["flag", "reason"],
      properties: {
        flag: { type: "boolean" },
        reason: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "link", "evidenceRecordItemIds", "suggestion", "confidence"],
        properties: {
          area: { type: "string" },
          link: { type: "string" },
          evidenceRecordItemIds: { type: "array", items: { type: "string" } },
          suggestion: { type: "string" },
          confidence: { type: "string" },
        },
      },
    },
  },
} as const;

export type NoteConnection = {
  area: string;
  link: string;
  evidenceRecordItemIds: string[];
  suggestion: string;
  confidence: string;
};

export type NoteScanOutput = {
  referral: { flag: boolean; reason: string | null };
  connections: NoteConnection[];
};

export function buildUserMessage(payloadJson: string): string {
  return `Her note and the client's pseudonymized record follow. Find the connections now.\n\n${payloadJson}`;
}
