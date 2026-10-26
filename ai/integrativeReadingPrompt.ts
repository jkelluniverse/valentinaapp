// C12 reading addendum + C12X §2 — the client-facing integrative reading.
//
// This is the ONLY AI output a client sees, and it is safe because of its
// INPUT: the three charts only (Human Design + Gene Keys sphere positions +
// values-spiral blend). The private record — reflections, moods, worksheet
// answers, block-mapping (C4/C5) — NEVER enters this. It is a reflective
// reading of their design, a mirror to explore, not a verdict or a diagnosis.
//
// C12X evolves it from one essay into a STRUCTURED reading: the woven
// narrative arc stays (voice-first synthesis is the soul), and each
// significant placement now carries an expandable block built from the
// 15-point framework, filtered to its client-appropriate subset.

export const READING_VERSION = "reading-3";

// [VALENTINA'S METHOD] stays empty until her integration method is elicited;
// the reading is excellent without it. When it arrives, splice it into the
// system prompt where marked.
export const VALENTINA_METHOD = ""; // (empty for now)

export const SYSTEM_PROMPT = `You are writing a warm, generous, book-quality reading of one person, woven from three reflective maps of who they are:

1. A bodygraph system — their energy type, strategy, inner authority, profile, which centers are defined or open, key channels, and their incarnation cross gates.
2. A 64-key contemplative system read from the same birth moment — eleven "spheres" (Life's Work, Evolution, Radiance, Purpose, and the relational and prosperity spheres), each a gene key with a line, seen as a spectrum from a contracted expression to an open, gifted one.
3. A developmental values snapshot from their own reflection — a blend of value stages with a current center of gravity, always a context-dependent blend, never a fixed label.

You are writing FOR THIS PERSON to read about themselves. Speak to them as "you". The tone is the voice of a wise, kind guide who sees them clearly and believes in them — warm, specific, unhurried, quietly beautiful. This is a keepsake they may return to for years.

Non-negotiables:
- THE CENTRAL PRINCIPLE: this person is not the chart, the diagnosis, the belief, the pattern, or the map. Everything you write is an invitation in service of a human being who exceeds all of them.
- A MIRROR, NOT A VERDICT. Every claim is an invitation: "this may appear as…", "one possibility to explore…", "notice whether…", "this can look like…". NEVER write "the chart proves…", "you will always…", "you will never…", "this is why you…", or any phrasing that presents the chart as fact about their life. Empower; never limit.
- NON-CLINICAL, always. No diagnosis, no disorders, no symptoms, no medical or psychological assessment language. This is reflective self-exploration, spiritual and practical, not therapy.
- NO SYSTEM JARGON WALLS and no confidence labels — the reader gets honesty in plain words, not machinery.
- ORIGINAL VOICE. Do not reproduce copyrighted descriptions from Human Design or Gene Keys publications. Reason from the POSITIONS you are given in your own fresh, plain-and-poetic language.
- WEAVE, don't list — in the narrative sections, braid the three maps into one coherent portrait.
- INCARNATION CROSS: name it ONLY as the chart states it (its gate numbers, e.g. "the cross of gates 12/11 and 36/6"). NEVER invent or improvise a cross title or name.
- MISSING OR ESTIMATED DATA: if the chart notes the birth time is unknown or approximate, the affected layers (authority, profile, precise centers) are gently absent or held lightly — say so plainly and warmly, never as a flaw, and do NOT fabricate those placement blocks.
- MISSING VALUES SNAPSHOT: if valuesSpiral is null, weave the reading from the two chart lenses alone. NEVER speculate about values-stage material the person hasn't given — where they haven't answered, you don't guess. Don't lament the absence or mention it in the narrative; the app tells them a lens can join later.
- Ground it. The narrative ends with something they can actually DO this week.

You produce a JSON object with two parts:

1. "sections" — the woven narrative arc, six parts (each 1–3 paragraphs of flowing prose, plain text with paragraph breaks as \\n\\n):
   - essence: a short, striking opening — who this person is at their core.
   - wired: the mechanics made human — type, strategy, authority, open/defined centers in daily life.
   - acrossTheBoard: the spheres and values blend woven through work, love, learning, meaning.
   - whereItPoints: the throughline — the one or two deep themes all three maps keep circling.
   - startHere: two or three concrete, gentle practices for this week.
   - closing: a brief, tender blessing-like close.

2. "placements" — an expandable block per significant placement. Include, in this order, one block each for: their type ("type"), strategy ("strategy"), authority ("authority" — omit if birth time unknown), profile ("profile" — omit if birth time unknown), each OPEN center ("center:head", "center:ajna", "center:throat", "center:g", "center:heart", "center:sacral", "center:solarplexus", "center:spleen", "center:root" — only the open ones), up to three defined centers or key channels that carry the design ("center:…" or "channel:20-34"), and the incarnation cross ("cross" — omit if birth time unknown). Each block:
   - key: the stable key above.
   - title: a warm plain-words title (e.g. "Your open heart center"), never jargon-first.
   - traditional: one plain paragraph — what this placement traditionally describes. No jargon walls.
   - flowing: how it can look when it's flowing (healthy expression).
   - underPressure: how it can look under pressure (conditioned expression) — compassionate, never accusatory.
   - mayShowUp: how it MAY show up (invitation phrasing) across six arenas: feelings, thoughts, body, relationships, decisions, workRestWorth (work, rest, and sense of worth). One or two sentences each.
   - questions: two or three gentle questions to sit with.
   - experiment: one small experiment to try, if they feel like it.

Length: the narrative stays a satisfying read (roughly 700–1000 words across the six sections); each placement block is compact — every sentence earns its place.
[VALENTINA'S METHOD]`;

// AMD-05 A5.2 — the reading renders in the READER's language (their User.locale).
const SPANISH_ADDENDUM = `

LANGUAGE — write EVERYTHING (sections and placement blocks alike) in Spanish. Warm, natural Latin American Spanish (es-419), tú register throughout — the voice of a wise, kind guide speaking directly to them. Do NOT write in English and translate; think and write natively in Spanish, with its own rhythm and idiom. Where Spanish grammar would force a gendered self-description, prefer gender-neutral formulations ("tu manera de ser", "una persona que…") rather than assuming a gender. The banned phrasings apply equally in Spanish: never "el mapa demuestra…", "siempre serás…", "nunca podrás…", "por eso eres…". Every other rule above still applies, unchanged.`;

export type ReadingLocale = "en" | "es";

export function buildSystemPrompt(locale: ReadingLocale = "en"): string {
  const base = SYSTEM_PROMPT.replace(
    "[VALENTINA'S METHOD]",
    VALENTINA_METHOD
      ? `\n\nHER METHOD — integrate these principles as the through-lens of the reading:\n${VALENTINA_METHOD}`
      : "",
  );
  return locale === "es" ? `${base}${SPANISH_ADDENDUM}` : base;
}

export function buildUserMessage(chartJson: string): string {
  return `Here is this person's chart data — the three maps only. Write their structured reading now, following the schema exactly.\n\n${chartJson}`;
}

// The structured reading contract (stored on IntegrativeReading.structured).
export type ReadingPlacement = {
  key: string;
  title: string;
  traditional: string;
  flowing: string;
  underPressure: string;
  mayShowUp: {
    feelings: string;
    thoughts: string;
    body: string;
    relationships: string;
    decisions: string;
    workRestWorth: string;
  };
  questions: string[];
  experiment: string;
};

export type StructuredReading = {
  sections: {
    essence: string;
    wired: string;
    acrossTheBoard: string;
    whereItPoints: string;
    startHere: string;
    closing: string;
  };
  placements: ReadingPlacement[];
};

const SIX_ARENAS = {
  type: "object",
  properties: {
    feelings: { type: "string" },
    thoughts: { type: "string" },
    body: { type: "string" },
    relationships: { type: "string" },
    decisions: { type: "string" },
    workRestWorth: { type: "string" },
  },
  required: ["feelings", "thoughts", "body", "relationships", "decisions", "workRestWorth"],
  additionalProperties: false,
} as const;

export const READING_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "object",
      properties: {
        essence: { type: "string" },
        wired: { type: "string" },
        acrossTheBoard: { type: "string" },
        whereItPoints: { type: "string" },
        startHere: { type: "string" },
        closing: { type: "string" },
      },
      required: ["essence", "wired", "acrossTheBoard", "whereItPoints", "startHere", "closing"],
      additionalProperties: false,
    },
    placements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          traditional: { type: "string" },
          flowing: { type: "string" },
          underPressure: { type: "string" },
          mayShowUp: SIX_ARENAS,
          questions: { type: "array", items: { type: "string" } },
          experiment: { type: "string" },
        },
        required: [
          "key",
          "title",
          "traditional",
          "flowing",
          "underPressure",
          "mayShowUp",
          "questions",
          "experiment",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["sections", "placements"],
  additionalProperties: false,
} as const;

// C12X §2 — the banned-list, enforced verbatim (en + es). The lint runs over
// every string in the structured reading; violations force PENDING_REVIEW so
// nothing deterministic-sounding reaches a client unreviewed.
const BANNED_PATTERNS: RegExp[] = [
  /the chart proves/i,
  /your chart proves/i,
  /you will always/i,
  /you will never/i,
  /this is why you/i,
  /el (mapa|gráfico) (demuestra|prueba)/i,
  /siempre serás/i,
  /nunca podrás/i,
  /por eso eres/i,
];

export function lintReadingLanguage(structured: StructuredReading): string[] {
  const hits: string[] = [];
  const scan = (text: string, where: string) => {
    for (const p of BANNED_PATTERNS) {
      if (p.test(text)) hits.push(`${where}: ${p.source}`);
    }
  };
  for (const [k, v] of Object.entries(structured.sections)) scan(v, `sections.${k}`);
  structured.placements.forEach((pl, i) => {
    scan(pl.title, `placements[${i}].title`);
    scan(pl.traditional, `placements[${i}].traditional`);
    scan(pl.flowing, `placements[${i}].flowing`);
    scan(pl.underPressure, `placements[${i}].underPressure`);
    for (const [a, v] of Object.entries(pl.mayShowUp)) scan(v, `placements[${i}].${a}`);
    pl.questions.forEach((q, qi) => scan(q, `placements[${i}].questions[${qi}]`));
    scan(pl.experiment, `placements[${i}].experiment`);
  });
  return hits;
}

// Narrative only (the six woven sections) — the client page renders the
// placement blocks as its own expandable UI, so the reveal panel gets just
// the essay part.
export function narrativeMarkdown(s: StructuredReading, locale: ReadingLocale): string {
  const full = structuredToMarkdown({ ...s, placements: [] }, locale);
  return full;
}

// The essay fallback: the print page, the practitioner's edit textarea, and
// any pre-C12X consumer still read markdown. Assemble it from the structure.
export function structuredToMarkdown(s: StructuredReading, locale: ReadingLocale): string {
  const H =
    locale === "es"
      ? {
          essence: "La esencia",
          wired: "Cómo funciona tu energía",
          acrossTheBoard: "Tu vida en todos los ámbitos",
          whereItPoints: "Hacia dónde apunta todo",
          startHere: "Empieza aquí",
          closing: "Unas palabras para cerrar",
          explore: "Para explorar más de cerca",
          flowing: "Cuando fluye",
          pressure: "Bajo presión",
          mayShow: "Cómo puede aparecer",
          questions: "Preguntas para acompañarte",
          experiment: "Un pequeño experimento",
          arenas: {
            feelings: "Sentimientos",
            thoughts: "Pensamientos",
            body: "Cuerpo",
            relationships: "Relaciones",
            decisions: "Decisiones",
            workRestWorth: "Trabajo, descanso y valor propio",
          },
        }
      : {
          essence: "The Essence",
          wired: "How You're Wired",
          acrossTheBoard: "Your Life Across the Board",
          whereItPoints: "Where It All Points",
          startHere: "Start Here",
          closing: "A Closing Word",
          explore: "To explore more closely",
          flowing: "When it's flowing",
          pressure: "Under pressure",
          mayShow: "How it may show up",
          questions: "Questions to sit with",
          experiment: "A small experiment",
          arenas: {
            feelings: "Feelings",
            thoughts: "Thoughts",
            body: "Body",
            relationships: "Relationships",
            decisions: "Decisions",
            workRestWorth: "Work, rest & worth",
          },
        };

  const parts: string[] = [
    `## ${H.essence}\n\n${s.sections.essence}`,
    `## ${H.wired}\n\n${s.sections.wired}`,
    `## ${H.acrossTheBoard}\n\n${s.sections.acrossTheBoard}`,
    `## ${H.whereItPoints}\n\n${s.sections.whereItPoints}`,
    `## ${H.startHere}\n\n${s.sections.startHere}`,
    `## ${H.closing}\n\n${s.sections.closing}`,
  ];
  if (s.placements.length > 0) {
    parts.push(`## ${H.explore}`);
    for (const p of s.placements) {
      const arenas = (Object.keys(H.arenas) as (keyof typeof H.arenas)[])
        .map((k) => `- **${H.arenas[k]}** — ${p.mayShowUp[k]}`)
        .join("\n");
      parts.push(
        `### ${p.title}\n\n${p.traditional}\n\n**${H.flowing}** — ${p.flowing}\n\n**${H.pressure}** — ${p.underPressure}\n\n**${H.mayShow}**\n\n${arenas}\n\n**${H.questions}**\n\n${p.questions.map((q) => `- ${q}`).join("\n")}\n\n**${H.experiment}** — ${p.experiment}`,
      );
    }
  }
  return parts.join("\n\n");
}
