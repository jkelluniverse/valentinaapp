import Link from "next/link";
import type { EntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { EntryCard, groupByDay, formatDay } from "@/components/entries";
import { ENTRY_TYPES } from "@/lib/entry-meta";
import { promptKindLabel } from "@/lib/prompt-meta";
import { AiConsentCard } from "./AiConsentCard";

export const dynamic = "force-dynamic";

const BANNERS: Record<string, string> = {
  saved: "Entry saved.",
  deleted: "Entry deleted.",
  responded: "Response saved — thank you for taking the time.",
};

export default async function SpaceHome({
  searchParams,
}: {
  searchParams: { type?: string; saved?: string; deleted?: string; responded?: string; error?: string };
}) {
  const user = await requireClient();

  const typeFilter = ENTRY_TYPES.some((t) => t.value === searchParams.type)
    ? (searchParams.type as EntryType)
    : null;

  const [entries, pendingItems, pendingWorksheets, doneCount, profile] = await Promise.all([
    prisma.logEntry.findMany({
      where: { clientId: user.id, ...(typeFilter ? { type: typeFilter } : {}) },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
    prisma.assignment.findMany({
      where: { clientId: user.id, status: "PENDING" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { prompt: { select: { title: true, kind: true } } },
    }),
    prisma.worksheetAssignment.findMany({
      where: { clientId: user.id, status: "PENDING" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { worksheet: { select: { title: true } } },
    }),
    prisma.assignment.count({ where: { clientId: user.id, status: "COMPLETED" } }),
    prisma.clientProfile.findUnique({
      where: { userId: user.id },
      select: { birthDate: true },
    }),
  ]);

  const pendingCount = pendingItems.length + pendingWorksheets.length;

  const banner = searchParams.saved
    ? BANNERS.saved
    : searchParams.deleted
      ? BANNERS.deleted
      : searchParams.responded
        ? BANNERS.responded
        : null;
  const groups = groupByDay(entries);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your space</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Moments of awareness</h1>
        <SignatureRule />
      </div>

      {banner && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{banner}</p>
      )}
      {searchParams.error === "consent" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Your consent isn&apos;t on record yet, so entries can&apos;t be saved. Please reach out
          to Valentina.
        </p>
      )}

      {!user.aiConsentAt && <AiConsentCard granted={false} />}

      {!profile?.birthDate && (
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <p className="text-ink">
            When you&apos;re ready, add your birth details to your profile — your Human Design
            chart generates from them, as another lens for our work together.
          </p>
          <Link
            href="/space/profile"
            className="mt-3 inline-block rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
          >
            Complete your profile
          </Link>
        </div>
      )}

      {(pendingCount > 0 || doneCount > 0) && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">From Valentina</h2>
            {pendingCount > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-wine px-2 text-xs font-semibold text-white">
                {pendingCount}
              </span>
            )}
            {doneCount > 0 && (
              <Link
                href="/space/prompts"
                className="ml-auto text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                Past responses
              </Link>
            )}
          </div>
          {pendingCount === 0 ? (
            <p className="text-sm text-ink">Nothing waiting right now.</p>
          ) : (
            <>
              {pendingWorksheets.map((w) => (
                <Link
                  key={`ws-${w.id}`}
                  href={`/space/worksheets/${w.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-5 shadow-soft transition-colors hover:bg-blush"
                >
                  <span className="inline-flex items-center rounded-full bg-blush-deep px-2.5 py-0.5 text-xs font-medium text-wine">
                    Worksheet
                  </span>
                  <p className="font-medium text-ink-strong">{w.worksheet.title}</p>
                  <span className="ml-auto text-xs text-slate">
                    {w.dueAt ? `by ${formatDay(w.dueAt)}` : "whenever you're ready"}
                  </span>
                </Link>
              ))}
              {pendingItems.map((a) => (
                <Link
                  key={a.id}
                  href={`/space/prompts/${a.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-5 shadow-soft transition-colors hover:bg-blush"
                >
                  <span className="inline-flex items-center rounded-full border border-mocha px-2.5 py-0.5 text-xs font-medium text-mocha">
                    {promptKindLabel(a.prompt.kind)}
                  </span>
                  <p className="font-medium text-ink-strong">{a.prompt.title}</p>
                  <span className="ml-auto text-xs text-slate">
                    {a.dueAt ? `by ${formatDay(a.dueAt)}` : "whenever you're ready"}
                  </span>
                </Link>
              ))}
            </>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/space/new"
          className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
        >
          New entry
        </Link>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Link
            href="/space"
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              !typeFilter ? "bg-wine text-white" : "border border-line bg-white text-ink hover:bg-blush"
            }`}
          >
            All
          </Link>
          {ENTRY_TYPES.map((t) => (
            <Link
              key={t.value}
              href={`/space?type=${t.value}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === t.value
                  ? "bg-wine text-white"
                  : "border border-line bg-white text-ink hover:bg-blush"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {user.aiConsentAt && <AiConsentCard granted />}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <h2 className="text-xl font-semibold">
            {typeFilter ? "Nothing here yet" : "Log your first moment of awareness"}
          </h2>
          <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink">
            {typeFilter
              ? "No entries of this kind yet — they'll gather here as you log them."
              : "A trigger, an insight, a win, a passing reflection — capture it in a few taps and watch your own patterns come into view."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-mocha">{group.day}</h2>
              {group.items.map((entry) => (
                <EntryCard key={entry.id} entry={entry} href={`/space/entries/${entry.id}`} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
