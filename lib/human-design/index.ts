import { createHash } from "crypto";
import type { ClientProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { zonedWallToUtc } from "@/lib/schedule";
import { computeChart } from "./engine";

// The generation service: birth data on a ClientProfile → stored
// HumanDesignChart. Idempotent via inputHash — saving unrelated profile fields
// never recomputes; editing birth data always does. Everything runs in-house
// (astronomy-engine ephemeris); birth data never leaves the server. No PII in
// logs, including on failure.

export const HD_PROVIDER = "veritas-inhouse-1"; // engine + version, for audit

const ESTIMATED_TIME = "12:00"; // noon estimate when the birth time is unknown

export const UNKNOWN_TIME_NOTE =
  "Birth time estimated (noon). Type and Strategy usually hold; Authority, Profile, and finer layers can shift with the exact time. A birth certificate or hospital record often has it — update it here and the chart regenerates.";

export function birthDataComplete(p: ClientProfile): boolean {
  return Boolean(
    p.birthDate && (p.birthTime || p.birthTimeUnknown) && p.birthLat != null && p.birthTz,
  );
}

function inputHash(p: ClientProfile): string {
  const parts = [
    p.birthDate?.toISOString() ?? "",
    p.birthTimeUnknown ? "unknown" : p.birthTime ?? "",
    p.birthLat?.toFixed(4) ?? "",
    p.birthLng?.toFixed(4) ?? "",
    p.birthTz ?? "",
  ].join("|");
  return createHash("sha256").update(parts).digest("hex");
}

// Regenerate the chart if birth data is complete and changed (or no chart
// yet). Returns whether a chart now exists. Never throws — a chart failure
// must not block a profile save.
export async function ensureChart(profile: ClientProfile): Promise<boolean> {
  try {
    if (!birthDataComplete(profile)) return false;

    const hash = inputHash(profile);
    const existing = await prisma.humanDesignChart.findUnique({
      where: { userId: profile.userId },
      select: { inputHash: true },
    });
    if (existing?.inputHash === hash) return true;

    // Birth wall-clock (local to the birthplace, historical tz rules applied
    // by the IANA database) → the UTC instant the ephemeris needs.
    const d = profile.birthDate!;
    const time = profile.birthTimeUnknown ? ESTIMATED_TIME : profile.birthTime!;
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m) return false;
    const birthUtc = zonedWallToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      Number(m[1]) * 60 + Number(m[2]),
      profile.birthTz!,
    );

    const chart = computeChart(birthUtc);

    await prisma.humanDesignChart.upsert({
      where: { userId: profile.userId },
      create: {
        userId: profile.userId,
        provider: HD_PROVIDER,
        type: chart.type,
        strategy: chart.strategy,
        authority: chart.authority,
        profile: chart.profile,
        definition: chart.definition,
        centers: chart.centers,
        channels: chart.channels,
        gates: { personality: chart.personality, design: chart.design },
        raw: chart as object,
        inputHash: hash,
        generatedAt: new Date(),
        accuracyNote: profile.birthTimeUnknown ? UNKNOWN_TIME_NOTE : null,
      },
      update: {
        provider: HD_PROVIDER,
        type: chart.type,
        strategy: chart.strategy,
        authority: chart.authority,
        profile: chart.profile,
        definition: chart.definition,
        centers: chart.centers,
        channels: chart.channels,
        gates: { personality: chart.personality, design: chart.design },
        raw: chart as object,
        inputHash: hash,
        generatedAt: new Date(),
        accuracyNote: profile.birthTimeUnknown ? UNKNOWN_TIME_NOTE : null,
      },
    });
    return true;
  } catch {
    // Metadata-only logging: which user's chart failed, never the birth data.
    console.error(`[human-design] chart generation failed for user ${profile.userId}`);
    return false;
  }
}
