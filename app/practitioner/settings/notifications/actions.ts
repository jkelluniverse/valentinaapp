"use server";

import { revalidatePath } from "next/cache";
import { requirePractitioner } from "@/lib/auth-guards";
import { writePracticeSetting } from "@/lib/practice-settings";
import { NOTIFY_KEYS } from "@/lib/notify-prefs";
import { BOOKING_REQUIRES_APPROVAL_KEY } from "@/lib/booking-mode";

const CHANNEL_KEYS = new Set<string>(Object.values(NOTIFY_KEYS));
const CHANNEL_VALUES = new Set(["push", "email", "both", "off"]);

export async function saveNotificationPrefs(form: FormData): Promise<void> {
  await requirePractitioner();
  for (const key of CHANNEL_KEYS) {
    const v = String(form.get(key) ?? "");
    if (CHANNEL_VALUES.has(v)) await writePracticeSetting(key, v);
  }
  // C40 §1.6 — the request mode itself. Default off; she turns it on here.
  await writePracticeSetting(BOOKING_REQUIRES_APPROVAL_KEY, form.get("bookingRequiresApproval") === "on" ? "on" : "off");
  // autoPayReminders had one reader and NO writer (ruling 219's audit). This is the writer.
  await writePracticeSetting("autoPayReminders", form.get("autoPayReminders") === "on" ? "on" : "off");
  revalidatePath("/practitioner/settings/notifications");
}
