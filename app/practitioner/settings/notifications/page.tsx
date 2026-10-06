import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { practiceSettingValue } from "@/lib/practice-settings";
import { NOTIFY_KEYS, NOTIFY_DEFAULTS } from "@/lib/notify-prefs";
import { bookingRequiresApproval } from "@/lib/booking-mode";
import { pushConfigured } from "@/lib/push";
import { PushToggle } from "@/components/PushToggle";
import { PendingButton } from "@/components/PendingButton";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { saveNotificationPrefs } from "./actions";

// C40 item 3 — Settings → Notifications. Per practitioner, all toggleable,
// PracticeSetting keys through the single access point. The C37 settings
// pattern: one LinkRow in, one page, one actions file.
export const dynamic = "force-dynamic";

const ROWS: { key: string; label: string; who: string; note?: string }[] = [
  { key: NOTIFY_KEYS.requestNew, label: "New session request", who: "you" },
  { key: NOTIFY_KEYS.requestOutcome, label: "Request approved, declined or lapsed", who: "the client" },
  { key: NOTIFY_KEYS.reminder1dClient, label: "Reminder, one day before", who: "the client" },
  { key: NOTIFY_KEYS.reminder1dPractitioner, label: "Reminder, one day before", who: "you" },
  { key: NOTIFY_KEYS.reminder30Client, label: "Reminder, about 30 minutes before", who: "the client", note: "Delivered 30–45 minutes before: the scheduler runs every 15 minutes, never later than 30." },
  { key: NOTIFY_KEYS.reminder30Practitioner, label: "Reminder, about 30 minutes before", who: "you", note: "Includes discovery calls booked through Calendly or Acuity." },
];

export default async function NotificationsSettingsPage() {
  await requirePractitioner();
  const values = Object.fromEntries(await Promise.all(ROWS.map(async (r) => [r.key, (await practiceSettingValue(r.key)) ?? NOTIFY_DEFAULTS[r.key]])));
  const requires = await bookingRequiresApproval();
  const autoPay = (await practiceSettingValue("autoPayReminders")) === "on";
  const vapid = process.env.VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10">
      <div>
        <Eyebrow>Practice</Eyebrow>
        <h1 className="text-2xl font-medium text-ink-strong">Notifications</h1>
        <SignatureRule />
        <p className="mt-3 max-w-prose text-sm text-slate">Who hears what, and how. Email, a tap on your phone, or both — each one is yours to set.</p>
      </div>

      <section className="rounded-lg border border-line bg-canvas-subtle p-4">
        <p className="text-sm font-medium text-ink-strong">Push on this device</p>
        <p className="mt-1 text-xs text-slate">Push arrives on devices where you have turned it on. If your browser has blocked notifications for this site, email will still work and the push option below will say so.</p>
        <div className="mt-3">
          {pushConfigured() && vapid ? (
            <PushToggle vapidPublicKey={vapid} labels={{ enable: "Enable push on this device", disable: "Turn off on this device", on: "Push is on for this device", unsupported: "This browser cannot receive push notifications. Email will still work.", blocked: "Your browser has blocked notifications for this site. Email will still work.", iosHint: "On iPhone, add this site to your Home Screen first, then enable push." }} />
          ) : (
            <p className="text-sm text-slate">Push is not configured on this server; email only.</p>
          )}
        </div>
      </section>

      <form action={saveNotificationPrefs} className="flex flex-col gap-6">
        <section className="rounded-lg border border-line bg-white p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="bookingRequiresApproval" defaultChecked={requires} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-ink-strong">Clients request a time; I approve it</span>
              <span className="block text-xs text-slate">Off: a client who picks a time is booked at once. On: it becomes a request that holds the time for 48 hours; you approve or decline, and the client is told by email. Booking form buttons change to say “Request”.</span>
            </span>
          </label>
        </section>

        <section className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white">
          {ROWS.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-strong">{r.label} <span className="font-normal text-slate">· to {r.who}</span></span>
                {r.note && <span className="block text-xs text-slate">{r.note}</span>}
              </span>
              <select name={r.key} defaultValue={values[r.key]} className="rounded-md border border-line px-2 py-1 text-sm">
                <option value="both">Email + push</option>
                <option value="email">Email</option>
                <option value="push">Push</option>
                <option value="off">Off</option>
              </select>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="autoPayReminders" defaultChecked={autoPay} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-ink-strong">Automatic payment reminders</span>
              <span className="block text-xs text-slate">A gentle nudge when a session is unpaid, once more a week later, then stop. Only between 9am and 7pm your time; muted clients are skipped.</span>
            </span>
          </label>
        </section>

        <PendingButton className="self-start rounded-lg bg-ink-strong px-4 py-2 text-sm font-medium text-white">Save</PendingButton>
      </form>
      <Link href="/practitioner/settings" className="text-sm text-slate underline">Back to settings</Link>
    </main>
  );
}
