import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { HdChartView } from "@/components/HdChartView";
import { GeneKeysView, SpiralView } from "@/components/LensViews";
import type { SpherePosition } from "@/lib/gene-keys";
import type { SpiralScore } from "@/lib/spiral";

export const dynamic = "force-dynamic";

export default async function DesignPage({
  searchParams,
}: {
  searchParams: { generated?: string };
}) {
  const user = await requireClient();
  const [chart, lenses] = await Promise.all([
    prisma.humanDesignChart.findUnique({ where: { userId: user.id } }),
    prisma.lensResult.findMany({ where: { userId: user.id } }),
  ]);
  const gkLens = lenses.find((l) => l.lens === "GENE_KEYS");
  const spiralLens = lenses.find((l) => l.lens === "SPIRAL");
  const spheres = ((gkLens?.result as { spheres?: SpherePosition[] } | null)?.spheres ?? []) as SpherePosition[];
  const spiralScore = spiralLens?.result as (SpiralScore & { practitionerCenter?: string }) | null;

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
