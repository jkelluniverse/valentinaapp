import Link from "next/link";
import { pickHint, gettingStarted, type Hint } from "@/lib/onboarding-discovery";
import { dismissHint } from "./actions";
import { PendingButton } from "@/components/PendingButton";

// CLIENT-ONBOARDING §6 — the two discovery surfaces-as-components. Both are
// server components that render NOTHING unless the client was onboarded
// through the intake engine, so pre-engine clients' screens are untouched.

// §6.2 — one small dismissible callout, anchored where it's placed. Never an
// overlay, never dims, never chains: one sentence and an ×.
export async function HintCallout({
  clientId,
  surface,
  path,
  className = "",
}: {
  clientId: string;
  surface: Hint["surface"];
  path: string;
  className?: string;
}) {
  const hint = await pickHint(clientId, surface);
  if (!hint) return null;
  return (
    <div className={`flex items-start gap-3 rounded-md border border-mocha/50 bg-blush px-4 py-2.5 ${className}`}>
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-wine">{hint.text}</p>
      <form action={dismissHint.bind(null, hint.key, path)}>
        <PendingButton title="Dismiss" className="text-[13px] font-semibold text-mocha hover:text-wine">
          ×
        </PendingButton>
      </form>
    </div>
  );
}

// §6.3 — the getting-started card: quiet, self-checking, dismissible as a
// whole, gone forever when complete.
export async function GettingStartedCard({
  clientId,
  path,
  className = "",
}: {
  clientId: string;
  path: string;
  className?: string;
}) {
  const items = await gettingStarted(clientId);
  if (!items) return null;
  const remaining = items.filter((i) => !i.done).length;
  return (
    <div className={`flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">
          Getting started · {items.length - remaining}/{items.length}
        </p>
        <form action={dismissHint.bind(null, "getting-started", path)}>
          <PendingButton title="Dismiss" className="text-[13px] font-semibold text-mocha hover:text-wine">
            ×
          </PendingButton>
        </form>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2.5 text-[14px]">
            <span aria-hidden className={i.done ? "text-mocha" : "text-line"}>
              {i.done ? "✓" : "○"}
            </span>
            {i.done ? (
              <span className="text-whisper line-through decoration-line">{i.label}</span>
            ) : (
              <Link href={i.href} className="text-ink underline-offset-4 hover:text-wine hover:underline">
                {i.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
