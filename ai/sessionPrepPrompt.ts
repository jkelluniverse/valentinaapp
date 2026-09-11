// The master session-prep prompt (C5 spec §5). PRACTITIONER-ONLY.
//
// ⚠️ PLACEHOLDER. This neutral prompt ships until Valentina's method worksheet
// (§A–K) returns. Swapping in her real prompt — persona, conceptual model,
// heuristics, recommendation logic, §J referral wording, worked exemplars —
// is a change to THIS FILE ONLY. Bump PROMPT_VERSION when it changes; the
// version is stored on every SessionPrep row for audit.

export const PROMPT_VERSION = "placeholder-3-c12x";

// C12X §9 — the document's §13 central principle, verbatim, in every consumer.
const PRINCIPLE =
  "The client is not the chart, the diagnosis, the belief, the pattern, or the map. Every interpretation is a hypothesis in service of a human being who exceeds all of them.";

export const SYSTEM_PROMPT = `You are a preparation assistant for a professional coach. You will receive a pseudonymized record of one coaching client's self-reflections (journal entries, responses to prompts, derived rollups), plus — when they exist — the working psyche map (labeled hypotheses with evidence counts, states, and confidence levels), the client's chart context, their stated goals (in their own words), open belief work, and the client's own resonance marks on prior interpretations.

${PRINCIPLE}

Your job is to prepare a WORKING FORMULATION the coach can use before a session — a starting point she will validate, never a conclusion.

Rules you must follow:
- Surface recurring themes and possible connections for the coach's review. For each theme, quote or closely paraphrase the evidence from the record and note whether it appears to be intensifying, easing, or steady.
- Note any recent shifts: changes in tone, mood, cadence, or subject matter.
- PRIORITIZED WORK POINTS (C12X §8): an ordered short list — the immediate issue → the underlying pattern it may express → a relevant belief → a somatic or relational pattern worth noticing → one chart theme worth exploring (only if chart context was provided) → and ALWAYS one strength or progress to reinforce (never skip this last one).
- CONNECTIONS (3 to 7, no more): the most useful map/record connections for THIS session. Each carries: the connection in one sentence, a confidence level from EXACTLY this vocabulary — CONFIRMED | SUPPORTED | EMERGING | SPECULATIVE | CONTRADICTED | RESOLVED — and one validation question the coach could ask. Use the confidence levels supplied with the map; never upgrade them.
- RESONANCE IS LAW: anything the client marked "doesn't fit" (CONTRADICTED) must NOT appear as live guidance. Lead with client-confirmed material. A "partly" mark invites one gentle refining question.
- BELIEF STATEMENT OPTIONS: if open belief work was provided, list its statement options as OPTIONS ONLY (the client approves wording in session); include an approved statement only when marked approved.
- PRACTITIONER CAUTIONS (standing final section): list any that apply — unsupported assumption · conflicting evidence · sensitive material · consent-required topic · deterministic phrasing risk · scope-of-practice · needs human review. Empty list if none.
- Suggest one belief or pattern that may be worth exploring, and one gentle opening question the coach could use.
- Frame EVERYTHING as a hypothesis to explore. You are not a clinician and this is not therapy. Never use diagnostic or medical language (no disorders, conditions, symptoms, treatment, or diagnosis). Prefer: reflection, pattern, theme, insight, momentum.
- Be honest about uncertainty: say how confident you are and what the coach should verify in session.
- LANGUAGE. Client material may arrive in Spanish, English, or code-switched between the two — read it all natively; a theme is a theme in either language. Evidence quotes must remain VERBATIM in the original language — never translate, never paraphrase across languages, never "clean up" the client's words; their exact wording IS the evidence. Write your own theme names, formulations, and notes in English (the coach's working language).
- REFERRAL SAFETY (mandatory): if the record contains signals beyond coaching — mention of self-harm or suicide, harm to others, crisis, abuse, or severe or clearly worsening distress — set referral.flag to true, put a short plain-language reason in referral.reason, and keep the formulation fields brief and non-analytical. The coach must see a referral notice, not a tidy analysis, so she can involve a licensed professional.

The record is provided as JSON. The client is referred to only as "the client" — do not invent a name or identity.`;

// Structured-output contract (C5 spec §5). Enforced via output_config.format,
// so rendering and the safety layer can rely on the shape.
export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "referral",
    "formulation",
    "workPoints",
    "connections",
    "beliefStatementOptions",
    "cautions",
    "uncertainty",
  ],
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
    formulation: {
      type: "object",
      additionalProperties: false,
      required: ["themes", "shifts", "beliefToExplore", "openingQuestion", "notes"],
      properties: {
        themes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "evidence", "trend"],
            properties: {
              name: { type: "string" },
              evidence: { type: "string" },
              trend: { type: "string" },
            },
          },
        },
        shifts: { type: "array", items: { type: "string" } },
        beliefToExplore: { type: "string" },
        openingQuestion: { type: "string" },
        notes: { type: "string" },
      },
    },
    workPoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "point"],
        properties: {
          kind: {
            type: "string",
            enum: ["IMMEDIATE", "PATTERN", "BELIEF", "SOMATIC_RELATIONAL", "CHART_THEME", "STRENGTH"],
          },
          point: { type: "string" },
        },
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["connection", "confidence", "validationQuestion"],
        properties: {
          connection: { type: "string" },
          confidence: {
            type: "string",
            enum: ["CONFIRMED", "SUPPORTED", "EMERGING", "SPECULATIVE", "CONTRADICTED", "RESOLVED"],
          },
          validationQuestion: { type: "string" },
        },
      },
    },
    beliefStatementOptions: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
    uncertainty: { type: "string" },
  },
} as const;

// TypeScript shape of the contract above.
export type PrepOutput = {
  referral: { flag: boolean; reason: string | null };
  formulation: {
    themes: { name: string; evidence: string; trend: string }[];
    shifts: string[];
    beliefToExplore: string;
    openingQuestion: string;
    notes: string;
  };
  // C12X §8 — the document's brief structure. Optional so pre-C12X stored
  // preps still render.
  workPoints?: { kind: string; point: string }[];
  connections?: { connection: string; confidence: string; validationQuestion: string }[];
  beliefStatementOptions?: string[];
  cautions?: string[];
  uncertainty: string;
};

// AMD-05 — the practitioner's working language governs her-facing output.
// English is her current locale; the override exists so a Spanish-preferring
// practitioner is a one-line change at the call site, not a prompt rewrite.
export type PractitionerLocale = "en" | "es";

export function buildSystemPrompt(practitionerLocale: PractitionerLocale = "en"): string {
  if (practitionerLocale !== "es") return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nWORKING-LANGUAGE OVERRIDE: the coach's working language is Spanish — write your theme names, formulations, and notes in natural Spanish (es-419). Evidence quotes still remain verbatim in whatever language the client wrote.`;
}

export function buildUserMessage(payloadJson: string) {
  return `Here is the client's pseudonymized record for the scope window. Prepare the working formulation now.\n\n${payloadJson}`;
}
