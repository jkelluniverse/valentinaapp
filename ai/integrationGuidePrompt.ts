// C12X §3 — the Practitioner Integration Guide: chart × the full record.
// HER eyes only — the heaviest AI call in the app by design. Every claim
// carries evidence ids, a §6 confidence level, and the §5 transparent-
// connection format; cautions ship as a standing section.

export const GUIDE_VERSION = "guide-1";

// The document's §13 central principle — verbatim, in every consumer.
export const CENTRAL_PRINCIPLE =
  "The client is not the chart, the diagnosis, the belief, the pattern, or the map. Every interpretation is a hypothesis in service of a human being who exceeds all of them.";

// §9 — the sensitive-inference caution list, adopted verbatim: these areas
// require DIRECT evidence; flag rather than infer; never speculate.
export const SENSITIVE_CAUTIONS = `SENSITIVE AREAS — require direct evidence, flag rather than infer, never speculate:
trauma history · abuse · psychiatric or medical diagnoses · sexuality · religion · allegations about family members · medical conditions · legal matters · risk of harm · third parties who have not consented. If the record only hints at one of these, add a caution — do not build an interpretation on it.`;

export const GUIDE_SYSTEM_PROMPT = `You prepare a private Integration Guide for a professional coach: her client's chart read AGAINST the full lived record. You are a careful colleague, not an oracle.

${CENTRAL_PRINCIPLE}

For each significant chart component you receive, produce a component block with:
- what the placement traditionally describes (one plain paragraph),
- crossRefs: evidence from the record CONSISTENT with the theme and evidence that CONTRADICTS or complicates it. Every crossRef uses the transparent-connection format: the theme → the possible connection → the cited evidence (by the record item ids you were given) → a confidence level → one question the coach could use to validate it in session. Cite ONLY ids that exist in the supplied record. If the record says nothing about a theme, say exactly that ("the record doesn't establish this yet") with an empty evidence list.
- beliefs: subconscious beliefs the record ACTUALLY shows, client's own wording first (verbatim quotes in their original language, never translated).
- statementOptions: 1-3 PSYCH-K-style goal-statement OPTIONS for the most evidenced belief (positive, present-tense, personally meaningful, internally focused, no controlling others, specific, flexible). These are options only — the client approves wording in session, never here.
- homeworkIdeas: 1-2 small experiment/assignment candidates she could turn into assignments.
- confidence: one overall level for the component from EXACTLY this vocabulary: CONFIRMED | SUPPORTED | EMERGING | SPECULATIVE | CONTRADICTED | RESOLVED.
- cautions: any that apply from: unsupported assumption · conflicting evidence · sensitive material · consent-required topic · deterministic phrasing risk · scope-of-practice · needs human review.

Rules:
- Evidence-mandatory: no claim without cited ids or an explicit "not established".
- RECENCY MATTERS: the record is dated. Where recent entries (the last few weeks) speak to a theme, cite them alongside older evidence — a refreshed guide that ignores what just happened is stale on arrival. Note genuine shifts ("this month reads differently from the spring").
- The client's resonance marks are law: themes they marked "doesn't fit" are RETIRED — mention them only under a CONTRADICTED label, never as live guidance. Lead with client-confirmed material.
- Non-clinical language throughout. No diagnosis. ${""}
- ${"Respect the sensitive list below absolutely."}

${SENSITIVE_CAUTIONS}

Also produce:
- overview: 2-3 sentences — where chart and record most strongly rhyme, and where they diverge (divergence is information, not failure).
- referral: { flag, reason } — true only if the material suggests needs beyond coaching; if true, keep components minimal.`;

export function buildGuideSystemPrompt(practitionerLocale: "en" | "es" = "en"): string {
  return practitionerLocale === "es"
    ? `${GUIDE_SYSTEM_PROMPT}\n\nWORKING-LANGUAGE OVERRIDE — write all analysis in natural Spanish (es-419). Evidence quotes stay VERBATIM in their original language.`
    : GUIDE_SYSTEM_PROMPT;
}

export type GuideCrossRef = {
  theme: string;
  connection: string;
  direction: "CONSISTENT" | "COMPLICATES";
  evidenceIds: string[];
  confidence: string;
  validationQuestion: string;
};

export type GuideComponent = {
  key: string;
  title: string;
  traditional: string;
  crossRefs: GuideCrossRef[];
  beliefs: { wording: string; evidenceIds: string[] }[];
  statementOptions: string[];
  homeworkIdeas: string[];
  confidence: string;
  cautions: string[];
};

export type GuideOutput = {
  referral: { flag: boolean; reason: string | null };
  overview: string;
  components: GuideComponent[];
};

const CONFIDENCE_ENUM = [
  "CONFIRMED",
  "SUPPORTED",
  "EMERGING",
  "SPECULATIVE",
  "CONTRADICTED",
  "RESOLVED",
];

export const GUIDE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    referral: {
      type: "object",
      properties: {
        flag: { type: "boolean" },
        reason: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["flag", "reason"],
      additionalProperties: false,
    },
    overview: { type: "string" },
    components: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          traditional: { type: "string" },
          crossRefs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                theme: { type: "string" },
                connection: { type: "string" },
                direction: { type: "string", enum: ["CONSISTENT", "COMPLICATES"] },
                evidenceIds: { type: "array", items: { type: "string" } },
                confidence: { type: "string", enum: CONFIDENCE_ENUM },
                validationQuestion: { type: "string" },
              },
              required: [
                "theme",
                "connection",
                "direction",
                "evidenceIds",
                "confidence",
                "validationQuestion",
              ],
              additionalProperties: false,
            },
          },
          beliefs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                wording: { type: "string" },
                evidenceIds: { type: "array", items: { type: "string" } },
              },
              required: ["wording", "evidenceIds"],
              additionalProperties: false,
            },
          },
          statementOptions: { type: "array", items: { type: "string" } },
          homeworkIdeas: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: CONFIDENCE_ENUM },
          cautions: { type: "array", items: { type: "string" } },
        },
        required: [
          "key",
          "title",
          "traditional",
          "crossRefs",
          "beliefs",
          "statementOptions",
          "homeworkIdeas",
          "confidence",
          "cautions",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["referral", "overview", "components"],
  additionalProperties: false,
} as const;
