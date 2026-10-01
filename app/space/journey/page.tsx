import Link from "next/link";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { getClientRecord } from "@/lib/client-record";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { groupByDay } from "@/components/entries";
import { RecordCard, StatCard, ThemeList, MoodTrend, CadenceLine } from "@/components/record";
import { HintCallout } from "@/components/discovery/Discovery";

export const dynamic = "force-dynamic";

// "Your journey" (C4 spec §7): the client's own unified history — entries and
// responses woven together. Warm and encouraging; strictly their own data.
export default async function JourneyPage() {
  const user = await requireClient();

  const rec = await getClientRecord(user.id);
  const groups = groupByDay(rec.timeline);

  // Map prompt-response record items back to their assignment for linking.
  const responseIds = rec.timeline
    .filter((i) => i.sourceType === "PromptResponse")
    .map((i) => i.sourceId);
  const responses = responseIds.length
    ? await prisma.promptResponse.findMany({
        where: { id: { in: responseIds } },
        select: { id: true, assignmentId: true },
      })
    : [];
  const assignmentByResponse = new Map(responses.map((r) => [r.id, r.assignmentId]));

  const hrefFor = (item: (typeof rec.timeline)[number]) => {
    if (item.sourceType === "LogEntry") return `/space/entries/${item.sourceId}`;
    if (item.sourceType === "PromptResponse") {
      const assignmentId = assignmentByResponse.get(item.sourceId);
      return assignmentId ? `/space/prompts/${assignmentId}` : undefined;
    }
    return undefined;
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your journey</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Look how far you&apos;ve come</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Everything you&apos;ve noticed and worked through, woven into one story.
        </p>
      </div>

      {/* CLIENT-ONBOARDING §6.2 — first-visit hint; null for pre-engine clients. */}
      <HintCallout clientId={user.id} surface="journey" path="/space/journey" />

      {rec.counts.total === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <h2 className="text-xl font-semibold">Your story starts here</h2>
          <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink">
            As you log moments and respond to what Valentina sends, your journey takes shape on
            this page.
          </p>
          <Link
            href="/space/new"
            className="mt-4 inline-block rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
          >
            Log your first moment
          </Link>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Altogether" value={String(rec.counts.total)} />
            <StatCard label="Moments" value={String(rec.counts.LOG_ENTRY ?? 0)} />
            <StatCard label="Responses" value={String(rec.counts.PROMPT_RESPONSE ?? 0)} />
            <StatCard
              label="This week"
              value={String(rec.cadence.thisWeek)}
              hint={rec.cadence.weekStreak > 1 ? `${rec.cadence.weekStreak}-week streak` : undefined}
            />
          </section>

          {rec.themes.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">What keeps showing up</h2>
              <ThemeList themes={rec.themes} />
            </section>
          )}

          {rec.moodTrend.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">How it&apos;s been feeling</h2>
              <MoodTrend trend={rec.moodTrend} />
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Your rhythm</h2>
            <CadenceLine cadence={rec.cadence} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">The whole story</h2>
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <section key={group.day} className="flex flex-col gap-3">
                  <h3 className="text-base font-semibold text-mocha">{group.day}</h3>
                  {group.items.map((item) => (
                    <RecordCard key={item.id} item={item} href={hrefFor(item)} />
                  ))}
                </section>
              ))}
            </div>
          </section>
        </>
      )}

      <Link
        href="/space"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your space
      </Link>
    </div>
  );
}
