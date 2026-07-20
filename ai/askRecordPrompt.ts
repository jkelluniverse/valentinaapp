// C12X §8 / document §10 — Ask the Record: longitudinal queries answered with
// citations or declined honestly. A research tool over the record, never an
// oracle.

import { CENTRAL_PRINCIPLE, SENSITIVE_CAUTIONS } from "@/ai/integrationGuidePrompt";

export const ASK_VERSION = "ask-1";

export const ASK_SYSTEM_PROMPT = `You answer a professional coach's question about ONE client's longitudinal record. You are a careful research assistant over the material you are given — nothing more.

${CENTRAL_PRINCIPLE}

Hard rules:
- CITE OR DECLINE. Every finding cites the record item ids that establish it. If the record does not establish an answer, say exactly that — "the record doesn't establish that" — in the notEstablished list. Never fill gaps with plausible inference.
- Confidence on every finding, from EXACTLY: CONFIRMED | SUPPORTED | EMERGING | SPECULATIVE | CONTRADICTED | RESOLVED.
- Verbatim quotes stay in their original language.
- Non-clinical language. No diagnosis.
${SENSITIVE_CAUTIONS}`;

export function buildAskSystemPrompt(practitionerLocale: "en" | "es" = "en"): string {
  return practitionerLocale === "es"
    ? `${ASK_SYSTEM_PROMPT}\n\nWORKING-LANGUAGE OVERRIDE — answer in natural Spanish (es-419); quotes stay verbatim.`
    : ASK_SYSTEM_PROMPT;
}

export type AskOutput = {
  findings: { statement: string; evidenceIds: string[]; confidence: string }[];
  notEstablished: string[];
};

export const ASK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          confidence: {
            type: "string",
            enum: ["CONFIRMED", "SUPPORTED", "EMERGING", "SPECULATIVE", "CONTRADICTED", "RESOLVED"],
          },
        },
        required: ["statement", "evidenceIds", "confidence"],
        additionalProperties: false,
      },
    },
    notEstablished: { type: "array", items: { type: "string" } },
  },
  required: ["findings", "notEstablished"],
  additionalProperties: false,
} as const;

// The document's §10 query set, as suggested chips.
export const SUGGESTED_QUERIES: { en: string; es: string }[] = [
  {
    en: "Which beliefs span the most life areas?",
    es: "¿Qué creencias abarcan más áreas de su vida?",
  },
  { en: "What has become less active lately?", es: "¿Qué se ha vuelto menos activo últimamente?" },
  {
    en: "Which interventions actually helped?",
    es: "¿Qué intervenciones realmente ayudaron?",
  },
  {
    en: "What themes keep returning around work?",
    es: "¿Qué temas siguen volviendo en torno al trabajo?",
  },
];
