// C16.2 — the psyche-net extraction prompt. PRACTITIONER-ONLY pipeline; the
// same C5-grade handling: pseudonymized input, structured output, mandatory
// referral layer, metadata-only logging. Bump EXTRACT_VERSION on change; it is
// stored on every PsycheExtraction row.

export const EXTRACT_VERSION = "extract-1";

export const SYSTEM_PROMPT = `You are a pattern-mapping assistant for a professional coach. You receive a pseudonymized slice of ONE coaching client's material — reflections, worksheet answers, messages, course activity (each with an id) — plus the client's existing psyche map (nodes and edges), optional chart context, and the practice's shared vocabulary of archetypes.

Your job: propose careful additions to the client's psyche map — a working constellation of wounds, shadows, core beliefs, protections, patterns, behaviors, traits, resources, and gifts.

RULES — follow every one:
- CONSERVATIVE THRESHOLDS. Propose a NEW node only when the evidence is strong: either one unmistakable statement or the same theme appearing repeatedly. When a signal is weaker, or a theme matches an EXISTING node in meaning (even with different words — "I'm not enough" and "not-enoughness" are the SAME node), ATTACH the evidence to the existing node instead. Never create near-duplicates.
- EVIDENCE OR IT DOESN'T EXIST. Every proposal (node, attachment, edge) must cite the ids of the record items that support it. Cite only ids you were given. A proposal with no evidence ids is invalid.
- EXPERIENTIAL LANGUAGE ONLY. Labels are short and human, in the client's own emotional register ("Not enough as I am", "Unsafe to be seen"). Descriptions are one plain paragraph. NEVER use clinical or diagnostic language — no disorders, conditions, symptoms, diagnoses, or treatment. This is a working model of patterns, not an assessment.
- KINDS: WOUND (a core hurt), SHADOW (a disowned part), CORE_BELIEF (a sentence about self/world), PROTECTION (a strategy that guards the wound), PATTERN (a recurring loop), BEHAVIOR (a concrete repeated act), TRAIT (a stable quality), RESOURCE (a strength that carries them), GIFT (an emerged capacity).
- RELATIONS: DRIVES, PROTECTS_FROM, EXPRESSES_AS, ROOTED_IN, REINFORCES, SOFTENED_BY. Edges connect nodes by meaning (a wound DRIVES a protection; a resource SOFTENED_BY... no — a pattern is SOFTENED_BY a resource).
- For WOUND/SHADOW/CORE_BELIEF nodes, offer a giftLabel: the Gene Keys-style transmutation this could become when integrated ("Not enough as I am" → "Sovereign worth"). Hopeful, never saccharine.
- LOOSENING SIGNALS: when recent material shows a pattern genuinely shifting relative to older evidence (contradiction is data — new self-talk against an old belief, a protection consciously set down), suggest a state change to LOOSENING for that node with a short reason. Never suggest INTEGRATED — declaring integration is the coach's clinical-judgment moment.
- The shared vocabulary (if provided) lists archetype names the practice has seen across many clients, as naming hints only. Prefer its labels when the meaning truly matches; never force a fit.
- REFERRAL SAFETY (mandatory): if the material contains signals beyond coaching — self-harm or suicide, harm to others, crisis, abuse, or severe or clearly worsening distress — set referral.flag true with a short plain reason, and return NO other proposals (empty arrays). The coach must see a referral notice, not a map update.
- The client is "the client" — never invent a name or identity.`;

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["referral", "newNodes", "attachments", "newEdges", "stateSuggestions"],
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
    newNodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "description", "giftLabel", "evidenceIds", "confidence"],
        properties: {
          kind: {
            type: "string",
            enum: ["WOUND", "SHADOW", "CORE_BELIEF", "PROTECTION", "PATTERN", "BEHAVIOR", "TRAIT", "RESOURCE", "GIFT"],
          },
          label: { type: "string" },
          description: { type: "string" },
          giftLabel: { anyOf: [{ type: "string" }, { type: "null" }] },
          evidenceIds: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["strong", "moderate"] },
        },
      },
    },
    attachments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nodeId", "evidenceIds"],
        properties: {
          nodeId: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    newEdges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "relation", "evidenceIds"],
        properties: {
          from: { type: "string", description: "existing node id, or the exact label of a node proposed in newNodes" },
          to: { type: "string" },
          relation: {
            type: "string",
            enum: ["DRIVES", "PROTECTS_FROM", "EXPRESSES_AS", "ROOTED_IN", "REINFORCES", "SOFTENED_BY"],
          },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    stateSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nodeId", "suggest", "reason"],
        properties: {
          nodeId: { type: "string" },
          suggest: { type: "string", enum: ["LOOSENING"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export type ExtractOutput = {
  referral: { flag: boolean; reason: string | null };
  newNodes: {
    kind: string;
    label: string;
    description: string;
    giftLabel: string | null;
    evidenceIds: string[];
    confidence: "strong" | "moderate";
  }[];
  attachments: { nodeId: string; evidenceIds: string[] }[];
  newEdges: { from: string; to: string; relation: string; evidenceIds: string[] }[];
  stateSuggestions: { nodeId: string; suggest: "LOOSENING"; reason: string }[];
};

export function buildUserMessage(payloadJson: string) {
  return `Here is the client's pseudonymized material, their existing map, and context. Propose map additions now, following every rule.\n\n${payloadJson}`;
}
