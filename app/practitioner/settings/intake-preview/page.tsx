import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { concreteSchemaFor, estimateMinutes } from "@/lib/intake/engine";
import { COPY } from "@/lib/copy/en";

// CLIENT-ONBOARDING §4.5 — "See it as your client will." Renders the EXACT
// generated intake (same schema builder, same copy) against nothing — no
// IntakeFlow, no IntakeAnswer, no readings. Persistence-free by construction:
// this page has no form actions and writes zero rows, so the "preview is
// never real" rule (Rule 0.9) holds mechanically. Reflects the tenant's
// current module config, so toggling a module changes the preview.

export const dynamic = "force-dynamic";

export default async function IntakePreview({ searchParams }: { searchParams: { step?: string } }) {
  await requirePractitioner();
  const tenant = await getTenant();
  const schema = await concreteSchemaFor(tenant.id);
  const branding = (tenant.branding ?? {}) as { welcomeCopy?: string };

  const seq = ["welcome", ...schema.steps.map((s) => s.key), "review"];
  const cur = seq.includes(searchParams.step ?? "") ? searchParams.step! : "welcome";
  const idx = seq.indexOf(cur);
  const step = schema.steps.find((s) => s.key === cur);
  const link = (s: string) => `/practitioner/settings/intake-preview?step=${s}`;

  const inputCls = "pointer-events-none w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-base text-whisper";

  // ONBOARDING Stage 6 ◆ — the drop-off view: where clients are in intake,
  // counted from ActivityEvents. Read-only; the page still writes zero rows.
  const events = await prisma.activityEvent.findMany({
    where: { eventKey: { in: ["intake.started", "intake.step_completed", "intake.completed"] } },
    select: { eventKey: true, meta: true },
  });
  const started = events.filter((e) => e.eventKey === "intake.started").length;
  const finished = events.filter((e) => e.eventKey === "intake.completed").length;
  const stepCounts = new Map<string, number>();
  for (const e of events) {
    if (e.eventKey !== "intake.step_completed") continue;
    const s = (e.meta as { step?: string } | null)?.step ?? "?";
    stepCounts.set(s, (stepCounts.get(s) ?? 0) + 1);
  }
  const dropoff: { label: string; n: number }[] = [
    { label: "Started", n: started },
    ...schema.steps.map((s) => ({ label: s.title, n: stepCounts.get(s.key) ?? 0 })),
    { label: "Completed", n: finished },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Unmistakable preview banner (Rule 0.9). */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-mocha px-4 py-2.5 text-sm font-medium text-cream md:-mx-6">
        <span aria-hidden>👁</span>
        <span>PREVIEW — this is exactly what your client fills in. Nothing here is saved.</span>
      </div>

      <div className="flex items-center justify-between">
        <Link href="/practitioner/settings" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
          ← settings
        </Link>
        <span className="text-[13px] text-whisper">
          {idx + 1} / {seq.length}
        </span>
      </div>

      {/* Distinct-tint frame so preview is visually unmistakable. */}
      <div className="rounded-card border-2 border-dashed border-mocha bg-surface-2/40 p-5 md:p-8">
        {cur === "welcome" && (
          <div className="mx-auto flex max-w-[520px] flex-col gap-5">
            <h1 className="font-headline text-[1.75rem] font-medium text-ink-strong">{COPY.intake.welcomeTitle}</h1>
            <p className="text-ink">{branding.welcomeCopy || COPY.intake.welcomeLede}</p>
            <p className="text-[14px] text-whisper">{COPY.intake.welcomeMinutes(estimateMinutes(schema))}</p>
            <span className="self-start rounded-lg bg-wine px-6 py-3 text-sm font-medium text-cream opacity-70">{COPY.intake.begin}</span>
          </div>
        )}

        {step && (
          <div className="mx-auto flex max-w-[520px] flex-col gap-6">
            <h1 className="font-headline text-[1.5rem] font-medium text-ink-strong">{step.title}</h1>
            {step.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-2">
                <span className="text-[15px] font-medium text-ink-strong">{f.label}</span>
                {f.help && <span className="-mt-1 text-[13px] text-whisper">{f.help}</span>}
                {f.kind === "scale" ? (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className="flex h-11 flex-1 items-center justify-center rounded-lg border border-line text-base text-whisper">
                        {n}
                      </span>
                    ))}
                  </div>
                ) : f.kind === "textarea" ? (
                  <div className={`${inputCls} min-h-[72px]`} />
                ) : (
                  <div className={inputCls}>{f.kind === "date" ? "MM / DD / YYYY" : f.kind === "time" ? "— : —" : ""}</div>
                )}
              </label>
            ))}
          </div>
        )}

        {cur === "review" && (
          <div className="mx-auto flex max-w-[520px] flex-col gap-4">
            <h1 className="font-headline text-[1.5rem] font-medium text-ink-strong">{COPY.intake.stepReview}</h1>
            <p className="text-[14px] text-whisper">{COPY.intake.reviewLede}</p>
            <div className="rounded-card border border-line bg-surface p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{COPY.intake.dataAckTitle}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink">{COPY.intake.dataAck}</p>
            </div>
            <span className="self-start rounded-lg bg-wine px-6 py-3 text-sm font-medium text-cream opacity-70">{COPY.intake.finish}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        {idx > 0 ? (
          <Link href={link(seq[idx - 1])} className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-slate hover:border-mocha hover:text-wine">
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {idx < seq.length - 1 && (
          <Link href={link(seq[idx + 1])} className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white hover:bg-wine-dark">
            Next screen →
          </Link>
        )}
      </div>

      {/* Drop-off, quietly, below the preview. */}
      <section className="mt-4 flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Where clients are</h2>
        {started === 0 ? (
          <p className="text-[14px] text-whisper">No intake activity yet — counts appear as invited clients begin.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-line">
            <table className="w-full text-[14px]">
              <tbody>
                {dropoff.map((r) => (
                  <tr key={r.label} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink">{r.label}</td>
                    <td className="px-4 py-2 text-right font-medium text-ink-strong">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
