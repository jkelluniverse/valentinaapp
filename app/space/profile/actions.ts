"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { geocodePlace } from "@/lib/geocode";
import { ensureChart } from "@/lib/human-design";
import { syncSquareCustomer } from "@/lib/square";

const PATH = "/space/profile";

// Save the client's own profile. Birth data is sensitive PII: it stays on the
// server, is never logged, and drives the in-house chart. Only the place NAME
// goes to the geocoder — no date, no identity.
export async function saveProfile(formData: FormData) {
  const user = await requireClient();
  if (!(await hasConsent(user.id))) redirect("/space/consent");

  const preferredName = String(formData.get("preferredName") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  // Birth fields
  const rawDate = String(formData.get("birthDate") ?? "").trim();
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
  const birthDate = dm
    ? new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])))
    : null;
  if (rawDate && !dm) redirect(`${PATH}?error=date`);

  // AMD-05 B5.3 — three-way precision. birthTimeUnknown stays in sync
  // (UNKNOWN → true) so the chart engine behaves exactly as before.
  const rawPrecision = String(formData.get("birthTimePrecision") ?? "");
  const birthTimePrecision = ["EXACT", "APPROXIMATE", "UNKNOWN"].includes(rawPrecision)
    ? rawPrecision
    : "EXACT";
  const birthTimeUnknown = birthTimePrecision === "UNKNOWN";
  const rawTime = String(formData.get("birthTime") ?? "").trim();
  const birthTime = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime : null;
  if (birthDate && !birthTimeUnknown && !birthTime) redirect(`${PATH}?error=time`);

  const birthPlace = String(formData.get("birthPlace") ?? "").trim() || null;
  if (birthDate && !birthPlace) redirect(`${PATH}?error=place`);

  const existing = await prisma.clientProfile.findUnique({ where: { userId: user.id } });

  // Geocode only when the place changed (or was never resolved).
  let birthLat = existing?.birthLat ?? null;
  let birthLng = existing?.birthLng ?? null;
  let birthTz = existing?.birthTz ?? null;
  if (birthPlace && (birthPlace !== existing?.birthPlace || birthLat == null || !birthTz)) {
    const geo = await geocodePlace(birthPlace);
    if (!geo) redirect(`${PATH}?error=geocode`);
    birthLat = geo.lat;
    birthLng = geo.lng;
    birthTz = geo.tz;
  }
  if (!birthPlace) {
    birthLat = null;
    birthLng = null;
    birthTz = null;
  }

  const data = {
    preferredName,
    phone,
    birthDate,
    birthTime: birthTimeUnknown ? null : birthTime,
    birthTimeUnknown,
    birthTimePrecision,
    birthPlace,
    birthLat,
    birthLng,
    birthTz,
  };

  const profile = await prisma.clientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  // Regenerates only when birth inputs actually changed (inputHash).
  const hasChart = await ensureChart(profile);

  // C13-PKG §2 — profile changes enqueue a Square sync (name/phone stay
  // current on her processor). Fire-and-forget; never blocks the save.
  void syncSquareCustomer(user.id).catch(() => undefined);

  revalidatePath(PATH);
  revalidatePath("/space/design");
  redirect(hasChart ? `/space/design?generated=1` : `${PATH}?saved=1`);
}
