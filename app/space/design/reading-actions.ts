"use server";

import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { ensureReading } from "@/lib/integrative-reading";
import {
  narrativeMarkdown,
  type ReadingLocale,
  type ReadingPlacement,
  type StructuredReading,
} from "@/ai/integrativeReadingPrompt";
import { markResonance, latestMarks } from "@/lib/resonance";

// Generate (or return) the caller's own reading. Client-callable; the reading
// is chart-only by construction in ensureReading (the bright line, C12r §2).
export async function generateMyReading(): Promise<{
  ok: boolean;
  content?: string;
  blocks?: ReadingPlacement[];
  status?: string;
  error?: string;
}> {
  const user = await requireClient();
  // AMENDMENT-01: the unified consent covers generating the personal reading.
  if (!(await hasConsent(user.id))) return { ok: false, error: "consent" };
  const res = await ensureReading(user.id);
  if (!res.ok) return { ok: false, error: res.error };
  const locale: ReadingLocale = user.locale === "es" ? "es" : "en";
  const structured = res.reading.structured as StructuredReading | null;
  return {
    ok: true,
    content: structured ? narrativeMarkdown(structured, locale) : res.reading.content,
    blocks: structured?.placements ?? [],
    status: res.reading.status,
  };
}

// C12X §5 — "Does this feel true?" on a reading block. The client's own
// correction system: append-only, and it acts on the matching chart
// hypothesis (feels-true = confirmation evidence; doesn't-fit retires it).
const CLIENT_VALUES = ["FEELS_TRUE", "PARTLY", "DOESNT_FIT", "NOT_YET"] as const;

export async function markReadingBlock(
  blockKey: string,
  value: string,
): Promise<{ ok: boolean }> {
  // AMD-06 §2 exclusion 5 — resonance marks are client-voice evidence; a mark
  // she placed would poison the signal. She reads; marking is theirs.
  const { forbidInAssist } = await import("@/lib/assist");
  await forbidInAssist("resonance");
  const user = await requireClient();
  if (!(CLIENT_VALUES as readonly string[]).includes(value)) return { ok: false };
  if (!blockKey || blockKey.length > 60) return { ok: false };
  await markResonance({
    clientId: user.id,
    subjectType: "READING_BLOCK",
    subjectKey: blockKey,
    value: value as (typeof CLIENT_VALUES)[number],
    markedById: user.id,
    markedByRole: "CLIENT",
  });
  return { ok: true };
}

export async function myReadingMarks(): Promise<Record<string, string>> {
  const user = await requireClient();
  const map = await latestMarks(user.id, "READING_BLOCK");
  return Object.fromEntries(map);
}
