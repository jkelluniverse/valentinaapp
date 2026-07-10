import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { saveProfile } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  date: "That birth date doesn't look right.",
  time: "Add your birth time, or tick “I don't know my exact time.”",
  place: "Add the place you were born so the chart can be located.",
  geocode:
    "That place couldn't be found — try the nearest town or city, like “Medellín” or “Miami”.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const user = await requireClient();
  const profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });

  const birthDateValue = profile?.birthDate
    ? profile.birthDate.toISOString().slice(0, 10)
    : "";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your profile</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">About you</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          A few personal details, and — if you&apos;d like your Human Design chart — where and when
          you arrived. Your birth details stay private here and are never shared.
        </p>
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Saved.</p>
      )}
      {searchParams.error && ERRORS[searchParams.error] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {ERRORS[searchParams.error]}
        </p>
      )}

      <form action={saveProfile} className="flex flex-col gap-8">
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="mb-5 text-xl font-semibold">Personal</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Preferred name</span>
              <input
                type="text"
                name="preferredName"
                defaultValue={profile?.preferredName ?? ""}
                className="rounded-md border border-line px-3 py-2 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Pronouns</span>
              <input
                type="text"
                name="pronouns"
                defaultValue={profile?.pronouns ?? ""}
                placeholder="e.g. she/her"
                className="rounded-md border border-line px-3 py-2 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Phone</span>
              <input
                type="tel"
                name="phone"
                defaultValue={profile?.phone ?? ""}
                className="rounded-md border border-line px-3 py-2 text-ink"
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="mb-1 text-xl font-semibold">Your arrival</h2>
          <p className="mb-5 max-w-prose text-sm text-slate">
            These three details generate your Human Design chart. The exact time matters — small
            differences can shift the finer layers — and it&apos;s often on a birth certificate or
            hospital record.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Birth date</span>
              <input
                type="date"
                name="birthDate"
                defaultValue={birthDateValue}
                className="rounded-md border border-line px-3 py-2 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Birth time (local)</span>
              <input
                type="time"
                name="birthTime"
                defaultValue={profile?.birthTime ?? ""}
                className="rounded-md border border-line px-3 py-2 text-ink"
              />
              <label className="mt-1 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="birthTimeUnknown"
                  defaultChecked={profile?.birthTimeUnknown ?? false}
                  className="h-4 w-4 accent-wine"
                />
                I don&apos;t know my exact time
              </label>
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-ink-strong">Place of birth</span>
              <input
                type="text"
                name="birthPlace"
                defaultValue={profile?.birthPlace ?? ""}
                placeholder="City, country — e.g. Medellín, Colombia"
                className="rounded-md border border-line px-3 py-2 text-ink"
              />
              {profile?.birthTz && (
                <span className="text-xs text-slate">
                  Located · timezone {profile.birthTz.replace(/_/g, " ")}
                </span>
              )}
            </label>
          </div>
          <p className="mt-4 max-w-prose text-xs text-slate">
            Privacy: your birth details never leave this app — the chart is calculated here, and
            only the place name is looked up on a map (with nothing else attached).
          </p>
        </section>

        <div className="flex items-center gap-4">
          <button className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
            Save profile
          </button>
          <Link
            href="/space/design"
            className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            See your chart
          </Link>
        </div>
      </form>
    </div>
  );
}
