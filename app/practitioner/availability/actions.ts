"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPractitioner, getOrCreateConfig, newFeedSecret } from "@/lib/schedule";
import { timeValueToMinutes, COMMON_TIMEZONES } from "@/lib/schedule-meta";

const PATH = "/practitioner/availability";

async function practitionerId(): Promise<string> {
  await requirePractitioner();
  const p = await getPractitioner();
  if (!p) throw new Error("No practitioner");
  return p.id;
}

function clampInt(v: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function saveConfig(formData: FormData) {
  const pid = await practitionerId();
  await getOrCreateConfig(pid);

  const tz = String(formData.get("timezone") ?? "");
  const timezone = COMMON_TIMEZONES.includes(tz) ? tz : undefined;
  const rawVideo = String(formData.get("defaultVideoUrl") ?? "").trim();

  await prisma.schedulingConfig.update({
    where: { practitionerId: pid },
    data: {
      ...(timezone ? { timezone } : {}),
      sessionMinutes: clampInt(formData.get("sessionMinutes"), 15, 240, 50),
      bufferMinutes: clampInt(formData.get("bufferMinutes"), 0, 120, 10),
      minNoticeHours: clampInt(formData.get("minNoticeHours"), 0, 336, 12),
      maxAdvanceDays: clampInt(formData.get("maxAdvanceDays"), 1, 365, 60),
      cancelCutoffHours: clampInt(formData.get("cancelCutoffHours"), 0, 336, 24),
      defaultVideoUrl: rawVideo && isHttpUrl(rawVideo) ? rawVideo : null,
    },
  });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=config`);
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// One continuous window per weekday keeps the grid calm; a lunch gap is a
// one-off BLOCK. Saving replaces that weekday's rules atomically.
export async function saveWeekdayHours(weekday: number, formData: FormData) {
  const pid = await practitionerId();
  const enabled = formData.get("enabled") === "on";
  const start = timeValueToMinutes(String(formData.get("start") ?? ""));
  const end = timeValueToMinutes(String(formData.get("end") ?? ""));

  await prisma.$transaction(async (tx) => {
    await tx.availabilityRule.deleteMany({ where: { practitionerId: pid, weekday } });
    if (enabled && start != null && end != null && end > start) {
      await tx.availabilityRule.create({
        data: { practitionerId: pid, weekday, startMinute: start, endMinute: end, active: true },
      });
    }
  });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=hours`);
}

export async function addException(formData: FormData) {
  const pid = await practitionerId();
  const dateStr = String(formData.get("date") ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) redirect(`${PATH}?error=date`);
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));

  const type = formData.get("type") === "OPEN" ? "OPEN" : "BLOCK";
  const start = timeValueToMinutes(String(formData.get("start") ?? ""));
  const end = timeValueToMinutes(String(formData.get("end") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  // OPEN must carry a window; a BLOCK with no window closes the whole day.
  if (type === "OPEN" && (start == null || end == null || end <= start)) {
    redirect(`${PATH}?error=window`);
  }

  await prisma.availabilityException.create({
    data: {
      practitionerId: pid,
      date,
      type,
      startMinute: type === "BLOCK" && (start == null || end == null) ? null : start,
      endMinute: type === "BLOCK" && (start == null || end == null) ? null : end,
      reason,
    },
  });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=exception`);
}

export async function deleteException(id: string) {
  const pid = await practitionerId();
  await prisma.availabilityException.deleteMany({ where: { id, practitionerId: pid } });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=exception`);
}

// Rotating the secret instantly revokes the old ICS feed URL (spec §6, §9).
export async function rotateFeedSecret() {
  const pid = await practitionerId();
  await getOrCreateConfig(pid);
  await prisma.schedulingConfig.update({
    where: { practitionerId: pid },
    data: { calendarFeedSecret: newFeedSecret() },
  });
  revalidatePath(PATH);
  revalidatePath("/practitioner/schedule");
  redirect(`${PATH}?saved=rotated`);
}
