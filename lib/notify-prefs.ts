import { practiceSettingValue } from "@/lib/practice-settings";

// C40 item 3 — per-practitioner notification channels, PracticeSetting keys
// through the one access point. Value: "push" | "email" | "both" | "off".
//
// DEFAULTS ARE TODAY'S BEHAVIOUR. The 24h client reminder fires email+push with
// no row present, exactly as before C40; everything NEW (a practitioner
// recipient, the 30-minute window) is "off" until she turns it on. The gate
// asserts that with no notify.* rows the tick sends what it sent before.
export type Channels = { email: boolean; push: boolean };
export const NOTIFY_KEYS = {
  requestNew: "notify.request.new",                         // practitioner · default both
  requestOutcome: "notify.request.outcome",                 // client · default email
  reminder1dClient: "notify.reminder.1d.client",            // client · default both (= today)
  reminder1dPractitioner: "notify.reminder.1d.practitioner",// practitioner · default off (NEW recipient)
  reminder30Client: "notify.reminder.30m.client",           // client · default off (NEW window)
  reminder30Practitioner: "notify.reminder.30m.practitioner",// practitioner · default off
} as const;
export const NOTIFY_DEFAULTS: Record<string, string> = {
  [NOTIFY_KEYS.requestNew]: "both",
  [NOTIFY_KEYS.requestOutcome]: "email",
  [NOTIFY_KEYS.reminder1dClient]: "both",
  [NOTIFY_KEYS.reminder1dPractitioner]: "off",
  [NOTIFY_KEYS.reminder30Client]: "off",
  [NOTIFY_KEYS.reminder30Practitioner]: "off",
};
export function toChannels(v: string | null | undefined, fallback: string): Channels {
  const x = v ?? fallback;
  return { email: x === "email" || x === "both", push: x === "push" || x === "both" };
}
export async function channelsFor(key: string): Promise<Channels> {
  return toChannels(await practiceSettingValue(key), NOTIFY_DEFAULTS[key] ?? "off");
}
