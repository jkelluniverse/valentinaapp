import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { HdChartView } from "@/components/HdChartView";
import { GeneKeysView, SpiralView } from "@/components/LensViews";
import { ensureChart } from "@/lib/human-design";
import { assembleCharts, chartInputHash } from "@/lib/integrative-reading";
import { ReadingSection } from "@/components/ReadingSection";
import { generateMyReading, markReadingBlock } from "./reading-actions";
import { latestMarks } from "@/lib/resonance";
import {
  narrativeMarkdown,
  type StructuredReading,
} from "@/ai/integrativeReadingPrompt";
import type { SpherePosition } from "@/lib/gene-keys";
import type { SpiralScore } from "@/lib/spiral";

export const dynamic = "force-dynamic";

export default async function DesignPage({
  searchParams,
}: {
  searchParams: { generated?: string };
}) {
  const user = await requireClient();

  // Self-heal: charts generated before the integrative engine (C12) lack the
  // Gene Keys spheres — ensureChart is idempotent and backfills them (a cheap
  // two-lookup no-op once everything exists).
  const profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
  if (profile) await ensureChart(profile);

  const [chart, lenses] = await Promise.all([
    prisma.humanDesignChart.findUnique({ where: { userId: user.id } }),
    prisma.lensResult.findMany({ where: { userId: user.id } }),
  ]);
  const gkLens = lenses.find((l) => l.lens === "GENE_KEYS");
  const spiralLens = lenses.find((l) => l.lens === "SPIRAL");
  const spheres = ((gkLens?.result as { spheres?: SpherePosition[] } | null)?.spheres ?? []) as SpherePosition[];
  const spiralScore = spiralLens?.result as (SpiralScore & { practitionerCenter?: string }) | null;

  // The integrative reading (C12r) — chart-only. Fresh published readings show
  // instantly; otherwise the client component draws it together (respecting the
  // hold-for-review setting).
  const [readingRow, assembled] = await Promise.all([
    prisma.integrativeReading.findUnique({ where: { userId: user.id } }),
    assembleCharts(user.id),
  ]);
  const readingComplete = assembled?.complete ?? false;
  const readingLocale: "en" | "es" = user.locale === "es" ? "es" : "en";
  const currentHash = assembled ? chartInputHash(assembled.payload, readingLocale) : null;
  const fresh = Boolean(readingRow && currentHash && readingRow.inputHash === currentHash);
  const structured =
    fresh && readingRow?.status === "PUBLISHED"
      ? ((readingRow.structured as StructuredReading | null) ?? null)
      : null;
  const readingInitial =
    fresh && readingRow?.status === "PUBLISHED"
      ? structured
        ? narrativeMarkdown(structured, readingLocale)
        : readingRow!.content
      : null;
  const readingBlocks = structured?.placements ?? [];
  const readingMarks = Object.fromEntries(await latestMarks(user.id, "READING_BLOCK"));
  const readingPending = readingRow?.status === "PENDING_REVIEW";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your design</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your Human Design</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          A reflective map drawn from the moment you arrived — something to explore with curiosity,
          together in session or on your own.
        </p>
      </div>

      {searchParams.generated && chart && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Your chart is ready — generated just now from your birth details.
        </p>
      )}

      {chart ? (
        <>
          <HdChartView chart={chart} />

          {spheres.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Your Gene Keys</h2>
                <p className="max-w-prose text-sm text-slate">
                  Read from the same birth moment — eleven spheres to contemplate slowly, one at a
                  time, rather than all at once.
                </p>
              </div>
              <GeneKeysView spheres={spheres} />
            </section>
          )}

          {spiralScore && spiralLens?.practitionerReviewed && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Your values snapshot</h2>
                <p className="max-w-prose text-sm text-slate">
                  From your own reflections — where your energy tends to live these days.
                </p>
              </div>
              <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
                <SpiralView
                  score={spiralScore}
                  practitionerCenter={spiralScore.practitionerCenter}
                />
              </div>
            </section>
          )}
          {spiralScore && !spiralLens?.practitionerReviewed && (
            <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-slate">
              Your values reflection is in — Valentina is looking at it, and it&apos;ll appear here
              once she has.
            </p>
          )}

          {/* C12r — the woven reading, at the foot of the charts. */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">What it all means to you</h2>
              <p className="max-w-prose text-sm text-slate">
                A reading woven from all three maps — read slowly, keep what rings true.
              </p>
            </div>
            <ReadingSection
              initialContent={readingInitial}
              initialBlocks={readingBlocks}
              initialMarks={readingMarks}
              locale={readingLocale}
              pendingReviewForClient={readingPending}
              chartsComplete={readingComplete}
              generate={generateMyReading}
              mark={markReadingBlock}
            />
          </section>

          <p className="text-sm text-slate">
            Birth details changed or refined?{" "}
            <Link
              href="/space/profile"
              className="font-medium text-wine underline-offset-4 hover:underline"
            >
              Update your profile
            </Link>{" "}
            and the chart regenerates.
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <p className="max-w-prose text-lg leading-relaxed text-ink">
            Your chart appears once your birth details are in — the date, the exact time if you
            know it, and the place you were born.
          </p>
          <Link
            href="/space/profile"
            className="mt-5 inline-block rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
          >
            Add your birth details
          </Link>
        </div>
      )}
    </div>
  );
}
