// C12.5 — the cross-lens synthesis prompt. The integration LOGIC comes from
// Valentina's own method text (elicited in-app, stored as a practice setting);
// the AI drafts practitioner-facing hypotheses THROUGH that method — it never
// invents the method itself (charter rule).

export const INTEGRATIVE_VERSION = "integrative-2";

export const SYSTEM_PROMPT = `You draft practitioner-facing working hypotheses for an integrative
self-exploration method used in a private coaching practice.

The practitioner combines three reflective lenses on a client:
1. A bodygraph system (type, strategy, authority, profile, defined/open centers).
2. A 64-key contemplative system read from the same birth computation (sphere positions,
   each key seen as a spectrum from contracted to open expression).
3. A developmental values snapshot from the client's own questionnaire (a normalized blend
   of stages with a center of gravity — always a context-dependent blend, never a fixed label).

Non-negotiables:
- The practitioner's own integration method (provided in the input) is the ONLY integration
  logic you use. Where her method doesn't speak, note the gap rather than inventing a rule.
- Everything you produce is a HYPOTHESIS for the practitioner to test in conversation — phrase
  it that way. She interprets, sequences, and works with the client in person.
- This is reflective self-exploration, not assessment or treatment: no clinical, diagnostic,
  or medical language, and no deterministic claims about who the client "is".
- Do not reproduce copyrighted source-system texts (key descriptions, stage instruments);
  refer to positions mechanically (e.g. "key 25, line 2") and reason in plain original language.
- The belief-change work itself happens only in person, in the practitioner's certified
  practice. You may suggest candidate self-beliefs worth exploring there — never instructions
  for performing any protocol.
- If the lens data is too thin to say something grounded, say less. Fewer, better hypotheses.
- LANGUAGE: client material (recurring themes, questionnaire-derived signals) may arrive in
  Spanish, English, or code-switched between the two — read it all natively. Any client words
  you quote must remain VERBATIM in their original language — never translate them. Write your
  own hypotheses, starters, and candidates in English (the practitioner's working language).`;

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["throughlines", "tensions", "sessionStarters", "beliefCandidates"],
  properties: {
    throughlines: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "hypothesis", "basis"],
        properties: {
          title: { type: "string", description: "Short name for the pattern" },
          hypothesis: { type: "string", description: "The cross-lens working hypothesis, phrased as something to test" },
          basis: { type: "string", description: "Which positions/weights across the lenses suggest it" },
        },
      },
    },
    tensions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["between", "hypothesis"],
        properties: {
          between: { type: "string", description: "The two signals that pull differently" },
          hypothesis: { type: "string" },
        },
      },
    },
    sessionStarters: {
      type: "array",
      maxItems: 4,
      items: { type: "string", description: "A gentle opening question for the next session" },
    },
    beliefCandidates: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["belief", "rationale"],
        properties: {
          belief: { type: "string", description: "A candidate self-belief to explore in person" },
          rationale: { type: "string" },
        },
      },
    },
    methodGaps: {
      type: "array",
      maxItems: 3,
      items: { type: "string", description: "Where her method text didn't cover a combination that arose" },
    },
  },
} as const;

export type IntegrativeOutput = {
  throughlines: { title: string; hypothesis: string; basis: string }[];
  tensions: { between: string; hypothesis: string }[];
  sessionStarters: string[];
  beliefCandidates: { belief: string; rationale: string }[];
  methodGaps?: string[];
};

// AMD-05 — her-facing output follows HER working language (English today).
export type PractitionerLocale = "en" | "es";

export function buildSystemPrompt(practitionerLocale: PractitionerLocale = "en"): string {
  if (practitionerLocale !== "es") return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nWORKING-LANGUAGE OVERRIDE: the practitioner's working language is Spanish — write hypotheses, starters, and candidates in natural Spanish (es-419). Client quotes still remain verbatim in whatever language the client wrote.`;
}

export function buildUserMessage(payloadJson: string): string {
  return `Draft the cross-lens working formulation for this client using ONLY the practitioner's
method as integration logic. Input (her method text, the three lens results, and recurring
journal themes — pseudonymized, no identity):

${payloadJson}`;
}
