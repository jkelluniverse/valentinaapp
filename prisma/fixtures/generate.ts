import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// FIXTURES-SPEC §9 — the generator. brief → Anthropic API → dated content that
// follows each client's arc, voice, and language. Run ONCE and commit the
// output (generated/*.json); the seed reads THAT, so seeding is reproducible,
// free, and fast. Regenerate only when briefs change:
//   ANTHROPIC_API_KEY=... npx tsx prisma/fixtures/generate.ts [--force] [id ...]
//
// The generator itself needn't be deterministic (LLM output varies) — the
// COMMITTED cache is the fixed artifact the deterministic seed consumes.

const BRIEFS = join(__dirname, "briefs");
const OUT = join(__dirname, "generated");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

type Brief = {
  id: string;
  identity: { name: string; pronouns?: string; language?: string };
  arrived?: { presenting?: string };
  psyche?: Record<string, unknown>;
  first_map?: { self_named?: string[] };
  arc?: { months?: number; stage?: number; beats?: { m: number; note: string }[] };
  engagement?: { reflections_per_month?: number; messages_per_month?: number; worksheets?: number; course?: string };
  voice?: string;
  safety_test?: boolean;
  // light briefs (pending/deactivated) may set this to skip generation
  generate?: boolean;
};

const SYSTEM = `You generate synthetic, entirely fictional journaling content for a neuropsychology coaching app's STAGING fixtures. These are literary characters, never real people. Write with dignity — plausible human struggle, never trauma spectacle. Match the character's VOICE and LANGUAGE exactly (if the brief says they write in Spanish or code-switch, do that — code-switching means mixing Spanish and English mid-thought). Follow the ARC: spread content across the tenure so early entries differ from later ones, and where a belief is LOOSENING or INTEGRATED, the later entries must show that shift. Output STRICT JSON only, no prose, no markdown fences.`;

function prompt(b: Brief): string {
  const months = b.arc?.months ?? 3;
  const rpm = Math.min(b.engagement?.reflections_per_month ?? 4, 5); // cap density for one-shot volume
  const targetReflections = Math.max(4, Math.min(Math.round(rpm * months * 0.6), 40));
  const targetMessages = Math.max(2, Math.min(Math.round((b.engagement?.messages_per_month ?? 3) * months * 0.4), 24));
  return `Character brief (JSON):
${JSON.stringify(b, null, 2)}

Generate this character's record over their ${months}-month tenure. "day" is a NEGATIVE integer = days before now (0 = today; spread across ~${months * 30} days, earliest ≈ -${months * 30}). Honor the arc beats' month → day mapping.

Return STRICT JSON:
{
  "reflections": [ { "day": -123, "body": "<in their voice + language>", "mood": <1-5>, "tags": ["short","lowercase"] } ],   // ~${targetReflections} items, evolving across the arc
  "messages": [ { "from": "CLIENT" | "PRACTITIONER", "day": -60, "body": "<short, in voice>", "unread": false } ],           // ~${targetMessages} items
  "notes": [ { "day": -90, "body": "<a private Margins note in VALENTINA'S clinical-but-warm voice, ABOUT this client>" } ]  // 2-6 items
}

Rules:
- Reflect the wounds/beliefs/patterns/resources indirectly through lived detail — never as clinical labels.
- Moods track the arc (lower in struggle, lifting where counter-evidence lands).
${b.safety_test ? `- SAFETY CASE: include EXACTLY ONE client message carrying an unambiguous but plain crisis signal (brief, no method detail, no spectacle). All other content is ordinary.` : `- No crisis content.`}
- Keep each body realistic length for the voice (terse voices = a few words; expansive voices = a paragraph).
- Accents/ñ and any non-English text must be correct UTF-8.`;
}

async function main() {
  const force = process.argv.includes("--force");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required to generate (the cache is committed; you only need this when briefs change).");
  const anthropic = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });

  const files = readdirSync(BRIEFS).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const b = JSON.parse(readFileSync(join(BRIEFS, f), "utf8")) as Brief;
    if (only.length && !only.includes(b.id)) continue;
    if (b.generate === false || !b.arc?.months) { console.log(`- skip ${b.id} (no arc — pending/deactivated)`); continue; }
    const outPath = join(OUT, `${b.id}.json`);
    if (existsSync(outPath) && !force) { console.log(`- cached ${b.id}`); continue; }

    process.stdout.write(`~ generating ${b.id} … `);
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 12_000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt(b) }],
    });
    const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.log("PARSE FAIL — saving raw for inspection");
      writeFileSync(join(OUT, `${b.id}.raw.txt`), text);
      continue;
    }
    parsed.id = b.id;
    writeFileSync(outPath, JSON.stringify(parsed, null, 2));
    const r = parsed.reflections?.length ?? 0, m = parsed.messages?.length ?? 0, n = parsed.notes?.length ?? 0;
    console.log(`ok (reflections ${r}, messages ${m}, notes ${n})`);
  }
  console.log("generation complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
