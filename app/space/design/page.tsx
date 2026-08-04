import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getTenant } from "@/lib/tenancy";
import { panelsFor } from "@/lib/modules/registry";
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
import { HintCallout } from "@/components/discovery/Discovery";
import { discoveryActive } from "@/lib/onboarding-discovery";
import { COPY } from "@/lib/copy/en";

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

  // PLATFORM Phase 2 — which panels this tenant shows, in their order, under
  // their labels. One data bag; each panel takes what it needs.
  const tenant = await getTenant();
  const [moduleRows, readingRows] = await Promise.all([
    prisma.tenantModule.findMany({
      where: { tenantId: tenant.id, enabled: true },
      orderBy: { position: "asc" },
    }),
    // Phase 3 — provider-computed readings for this client (COMPLETE only).
    prisma.reading.findMany({
      where: { clientId: user.id, status: "COMPLETE" },
      select: { kind: true, payload: true },
    }),
  ]);
  const panels = panelsFor(moduleRows);
  const panelData = {
    chart,
    spheres,
    spiralScore,
    spiralReviewed: Boolean(spiralLens?.practitionerReviewed),
    readings: Object.fromEntries(readingRows.map((r) => [r.kind, r.payload])),
  };

  // The integrative reading (C12r) — chart-only. Fresh published readings show
  // instantly; otherwise the client component draws it together (respecting the
  // hold-for-review setting).
  const [readingRow, assembled] = await Promise.all([
    prisma.integrativeReading.findUnique({ where: { userId: user.id } }),
    assembleCharts(user.id),
  ]);
  // PATCH-01 §1 — minimum viable input is birth data alone (both chart
  // lenses); the values snapshot deepens the reading when it joins.
  const readingComplete = Boolean(assembled?.payload.geneKeys);
  const valuesJoined = assembled?.hasSpiral ?? false;
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

  // §6.1 — only consulted for the no-chart empty state; false for everyone
  // pre-engine, so the existing empty state is untouched.
  const enginePending = !chart && (await discoveryActive(user.id));

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

      {/* CLIENT-ONBOARDING §6.2 — first-visit hint; null for pre-engine clients. */}
      <HintCallout clientId={user.id} surface="design" path="/space/design" />

      {searchParams.generated && chart && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Your chart is ready — generated just now from your birth details.
        </p>
      )}

      {chart || readingRows.length > 0 ? (
        <>
          {/* PLATFORM Phase 2 — the modality panels render through the module
              registry: the tenant's TenantModule rows decide which panels
              appear, in what order, under what words. Same data pipelines,
              same DOM — the registry is a frame, not a redesign (Rule 5.1).
              Phase 3: provider-computed panels render from Reading rows, so
              a tenant with no in-house chart still gets a map. */}
          {panels.map(({ key, Panel, displayLabel, copy }) => (
            <Panel key={key} displayLabel={displayLabel} copy={copy} data={panelData} />
          ))}

          {/* C12r — the woven reading, at the foot of the charts. In-house
              chart tenants only — exactly as before Phase 3. */}
          {chart && (
            <>
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
                  valuesJoined={valuesJoined}
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
          )}
        </>
      ) : enginePending ? (
        /* CLIENT-ONBOARDING §6.1 — teaching empty state. An engine-onboarded
           client already gave their birth details in intake; the fan-out is
           preparing their charts, so "add your details" would be wrong. */
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <p className="max-w-prose text-lg leading-relaxed text-ink">
            {COPY.discovery.mapPending(
              panels.find((p) => p.key === "values-spiral")?.displayLabel ?? "values snapshot"
            )}
          </p>
        </div>
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
