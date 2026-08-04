import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { getActiveFlow, loadFlowSchema, getAnswers } from "@/lib/intake/engine";
import { COPY } from "@/lib/copy/en";
import { IntakeStepForm, type UIField } from "./IntakeStepForm";
import { advanceIntake, jumpIntake, completeIntakeAction } from "./actions";

// CLIENT-ONBOARDING — the intake host. Sequences Welcome → generated steps →
// Review → Done. A client with no active flow (existing clients, or those who
// finished) is sent home — intake is never forced on anyone without an
// IN_PROGRESS flow, so Rule 0.1 holds and the pixel gate is safe.

export const dynamic = "force-dynamic";

export default async function IntakePage({ searchParams }: { searchParams: { done?: string } }) {
  const user = await requireClient();
  const flow = await getActiveFlow(user.id);

  // Done screen (flow just completed) — or no flow at all → home.
  if (searchParams.done) {
    // ONBOARDING §6.4 — the practitioner's voice: an optional welcome video,
    // pure tenant config. Beats any product tour; absent unless the tenant
    // sets branding.welcomeVideoUrl.
    const doneBranding = ((await getTenant()).branding ?? {}) as { welcomeVideoUrl?: string };
    return (
      <Shell>
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <h1 className="font-headline text-[1.75rem] font-medium text-ink-strong">{COPY.intake.doneTitle}</h1>
          <p className="max-w-sm text-ink">{COPY.intake.doneLede}</p>
          {doneBranding.welcomeVideoUrl && (
            <video
              controls
              preload="metadata"
              src={doneBranding.welcomeVideoUrl}
              className="w-full max-w-sm rounded-card border border-line shadow-soft"
            />
          )}
          <p className="max-w-sm text-[14px] text-whisper">{COPY.intake.donePreparing}</p>
          <a href="/space" className="mt-2 rounded-lg bg-wine px-6 py-3 text-sm font-medium text-white shadow-soft hover:bg-wine-dark">
            {COPY.intake.goHome}
          </a>
        </div>
      </Shell>
    );
  }
  if (!flow) redirect("/space");

  const tenant = await getTenant();
  const { schema } = await loadFlowSchema(flow.id);
  const answers = await getAnswers(flow.id);

  // The full navigable sequence.
  const seq = ["welcome", ...schema.steps.map((s) => s.key), "review"];
  const cur = seq.includes(flow.currentStep) ? flow.currentStep : "welcome";
  const idx = seq.indexOf(cur);
  const nextKey = seq[Math.min(idx + 1, seq.length - 1)];
  const prevKey = idx > 0 ? seq[idx - 1] : null;

  // ---- Welcome ----
  if (cur === "welcome") {
    const branding = (tenant.branding ?? {}) as { welcomeCopy?: string; portalTitle?: string };
    const totalFields = schema.steps.reduce((n, s) => n + s.fields.length, 0);
    const minutes = Math.max(3, Math.round(totalFields / 6));
    return (
      <Shell>
        <div className="flex flex-col gap-6 py-6">
          <h1 className="font-headline text-[1.75rem] font-medium text-ink-strong">{COPY.intake.welcomeTitle}</h1>
          <p className="max-w-prose text-ink">{branding.welcomeCopy || COPY.intake.welcomeLede}</p>
          <p className="text-[14px] text-whisper">{COPY.intake.welcomeMinutes(minutes)}</p>
          <form action={advanceIntake.bind(null, flow.id, schema.steps[0]?.key ?? "review")}>
            <button className="rounded-lg bg-wine px-6 py-3 text-sm font-medium text-white shadow-soft hover:bg-wine-dark">
              {COPY.intake.begin}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  // ---- Review ----
  if (cur === "review") {
    const flags = (tenant.featureFlags ?? {}) as Record<string, boolean>;
    const sessionPipeline = flags.sessionPipeline === true;
    return (
      <Shell>
        <div className="flex flex-col gap-6 py-4">
          <div>
            <h1 className="font-headline text-[1.5rem] font-medium text-ink-strong">{COPY.intake.stepReview}</h1>
            <p className="mt-1 max-w-prose text-[14px] text-whisper">{COPY.intake.reviewLede}</p>
          </div>

          <div className="flex flex-col gap-4">
            {schema.steps.map((s) => (
              <div key={s.key} className="rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{s.title}</p>
                  <form action={jumpIntake.bind(null, flow.id, s.key)}>
                    <button className="text-[13px] font-medium text-wine underline-offset-4 hover:underline">{COPY.intake.edit}</button>
                  </form>
                </div>
                <dl className="flex flex-col gap-1.5">
                  {s.fields.map((f) => {
                    const v = answers[f.key];
                    return (
                      <div key={f.key} className="flex justify-between gap-4 text-[14px]">
                        <dt className="text-slate">{f.label}</dt>
                        <dd className="text-right text-ink">{formatVal(v)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>

          <form action={completeIntakeAction.bind(null, flow.id)} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{COPY.intake.dataAckTitle}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink">{COPY.intake.dataAck}</p>
            </div>
            {sessionPipeline && (
              <label className="flex items-start gap-3 border-t border-line pt-4 text-[14px] text-ink">
                <input type="checkbox" name="recordingConsent" value="true" className="mt-1" />
                <span>{COPY.intake.recordingConsentAgree}</span>
              </label>
            )}
            <button className="self-start rounded-lg bg-wine px-6 py-3 text-sm font-medium text-white shadow-soft hover:bg-wine-dark">
              {COPY.intake.finish}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  // ---- A generated step ----
  const step = schema.steps.find((s) => s.key === cur);
  if (!step) redirect("/space/intake");
  const uiFields: UIField[] = step!.fields.map((f) => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    required: f.required,
    options: f.options,
    help: f.help,
    timeUnknown: f.timeUnknown,
  }));

  return (
    <Shell>
      <IntakeStepForm
        flowId={flow.id}
        stepKey={step!.key}
        title={step!.title}
        fields={uiFields}
        initial={answers}
        prevStep={prevKey}
        nextStep={nextKey}
        labels={{
          next: COPY.intake.next,
          back: COPY.intake.back,
          saved: COPY.intake.saved,
          birthTimeUnknown: COPY.intake.birthTimeUnknown,
          birthTimeUnknownReassure: COPY.intake.birthTimeUnknownReassure,
        }}
      />
    </Shell>
  );
}

// The intake takeover frame — deliberately minimal (no nav): the client has
// one job here. Wordmark only, centered, mobile-first.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex max-w-[560px] flex-col px-5 pt-safe">
        <div className="py-5 font-headline text-lg font-semibold text-wine">
          veritas <span className="text-mocha">✧</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (v === "unknown") return "Not known";
  if (typeof v === "object") {
    const o = v as { display?: string };
    return o.display ?? JSON.stringify(v);
  }
  return String(v);
}
