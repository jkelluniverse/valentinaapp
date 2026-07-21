"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PendingButton } from "@/components/PendingButton";
import {
  adminSendResetLink,
  setTempPassword,
  assistedEmailChange,
  recordAssistedPurchase,
  reopenWorksheet,
  enterAssist,
} from "./help-actions";

// AMD-06 §1 — the quiet "Help with their account" sheet on the Portrait.
// Every tool is one tap + one audit line; the temp password renders exactly
// once, right here, and nowhere else.

type Sku = { id: string; name: string; amount: string; kind: string };
type Jam = { id: string; title: string; status: string; hasAnswers: boolean };
type AuditLine = { when: string; text: string };

const NOTICES: Record<string, string> = {
  "reset-sent": "Reset link sent to their inbox.",
  "email-done": "Email updated — the old address got the notice.",
  "email-format": "That new email doesn't look right.",
  "email-note": "A short verification note is required (how you verified it's them).",
  "email-same": "That's already their address.",
  "email-taken": "That address belongs to another account.",
  "purchase-note": "The authorization note is required (e.g. “authorized by phone, Jul 20”).",
  "purchase-bad": "Pick a package or rate first.",
  "purchase-paid": "Recorded and marked paid — the package is active.",
  "purchase-charged": "Charged their card on file — receipt sent.",
  "purchase-declined": "The card was declined — nothing recorded as paid.",
  "purchase-noconsent": "No card authorization on file — the card path isn't available.",
  "purchase-nocard": "No saved card found on their Square profile.",
  "reopen-done": "Item unjammed.",
  "assist-reason": "Pick a reason to enter assist.",
  "assist-note": "Say a word about why (reason “Other”).",
  "assist-inactive": "Their account isn't active.",
};

const REASONS: Record<string, string> = {
  "phone-support": "Walking them through it by phone",
  "intake-together": "Completing an intake together",
  "seeing-their-view": "Troubleshooting — seeing what they see",
  "low-tech-help": "Hands-on help (low-tech client)",
  other: "Other (say why in the note)",
};

function TempPasswordTool({ clientId }: { clientId: string }) {
  // React 18 — no useActionState (that's React 19; it crashed the page at
  // request time). Plain state + transition around the returned-value action:
  // the temp password must render once, never travel through a redirect.
  const [state, setState] = useState<Awaited<ReturnType<typeof setTempPassword>> | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-slate">
        For a client on the phone right now: a spoken temporary password. It works once — they
        choose their own at next sign-in. You never see the one they pick.
      </p>
      {state?.ok && state.temp && (
        <p className="rounded-md bg-blush-deep px-3 py-2 font-mono text-sm text-wine">
          {state.temp}
          <span className="ml-2 font-sans text-xs text-slate">
            — shown only now; it won&apos;t appear again anywhere.
          </span>
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await setTempPassword(clientId)))}
        className="inline-flex items-center gap-2 self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush disabled:cursor-wait disabled:opacity-70"
      >
        {pending && (
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {state?.ok ? "Set another temporary password" : "Set temporary password"}
      </button>
    </div>
  );
}

export function HelpSheet({
  clientId,
  skus,
  jams,
  cardPathAvailable,
  auditLines,
  notice,
}: {
  clientId: string;
  skus: Sku[];
  jams: Jam[];
  cardPathAvailable: boolean;
  auditLines: AuditLine[];
  notice?: string;
}) {
  return (
    <details id="help" className="rounded-lg border border-line bg-white shadow-soft" open={Boolean(notice)}>
      <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-wine">
        Help with their account
      </summary>
      <div className="flex flex-col gap-6 border-t border-line px-6 py-5">
        {notice && NOTICES[notice] && (
          <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{NOTICES[notice]}</p>
        )}

        {/* Locked out */}
        <section className="flex flex-col gap-3">
          <h3 className="text-label font-semibold uppercase tracking-wide text-mocha">
            Locked out
          </h3>
          <form action={adminSendResetLink.bind(null, clientId)}>
            <PendingButton
              className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              pendingLabel="Sending…"
            >
              Send them a reset link
            </PendingButton>
          </form>
          <TempPasswordTool clientId={clientId} />
        </section>

        {/* Email change */}
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-label font-semibold uppercase tracking-wide text-mocha">
            Lost access to their old email
          </h3>
          <form action={assistedEmailChange.bind(null, clientId)} className="flex flex-col gap-2">
            <input
              type="email"
              name="newEmail"
              required
              placeholder="their new address"
              className="max-w-sm rounded-md border border-line px-3 py-2 text-sm text-ink"
            />
            <input
              type="text"
              name="note"
              required
              placeholder="how you verified it's them (required — e.g. “on the phone, confirmed birth date”)"
              className="max-w-lg rounded-md border border-line px-3 py-2 text-sm text-ink"
            />
            <p className="text-xs text-slate">
              The old address still gets a notice — the takeover tripwire stays.
            </p>
            <PendingButton
              className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              pendingLabel="Updating…"
            >
              Change their email
            </PendingButton>
          </form>
        </section>

        {/* Phone purchase */}
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-label font-semibold uppercase tracking-wide text-mocha">
            Phone / in-person purchase
          </h3>
          <form action={recordAssistedPurchase.bind(null, clientId)} className="flex flex-col gap-2">
            <select name="priceBookId" required className="max-w-sm rounded-md border border-line px-3 py-2 text-sm text-ink">
              <option value="">What did they buy?</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.amount}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="note"
              required
              placeholder="authorization note (required — e.g. “authorized by phone, Jul 20”)"
              className="max-w-lg rounded-md border border-line px-3 py-2 text-sm text-ink"
            />
            <div className="flex flex-col gap-1.5 text-sm text-ink">
              <label className="flex items-center gap-2">
                <input type="radio" name="settlement" value="invoice" defaultChecked /> Send the
                invoice — they pay online
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="settlement" value="markpaid" /> Mark paid — settled in
                person (cash / Zelle)
              </label>
              {cardPathAvailable ? (
                <label className="flex items-center gap-2">
                  <input type="radio" name="settlement" value="card" /> Charge their card on file
                  (they&apos;ve authorized this)
                </label>
              ) : (
                <p className="text-xs text-slate">
                  Card on file: not available — they haven&apos;t authorized standing charges.
                </p>
              )}
            </div>
            <PendingButton
              className="self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
              pendingLabel="Recording…"
            >
              Record the purchase
            </PendingButton>
          </form>
        </section>

        {/* Stuck items */}
        {jams.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-label font-semibold uppercase tracking-wide text-mocha">
              Stuck items
            </h3>
            {jams.map((j) => (
              <form key={j.id} action={reopenWorksheet.bind(null, clientId, j.id)} className="flex items-center gap-3 text-sm">
                <span className="text-ink">
                  {j.title} <span className="text-xs text-slate">· {j.status.toLowerCase()}{j.hasAnswers ? " · has answers" : ""}</span>
                </span>
                <PendingButton className="text-[13px] font-medium text-wine underline-offset-4 hover:underline">
                  Unjam
                </PendingButton>
              </form>
            ))}
          </section>
        )}

        {/* Quick links */}
        <section className="flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
          <Link href={`/practitioner/clients/${clientId}/book`} className="font-medium text-wine underline-offset-4 hover:underline">
            Book for them →
          </Link>
          <Link href={`/practitioner/clients/${clientId}?tab=billing`} className="font-medium text-wine underline-offset-4 hover:underline">
            Their billing →
          </Link>
        </section>

        {/* Assist mode */}
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-label font-semibold uppercase tracking-wide text-mocha">
            Assist in their portal
          </h3>
          <p className="text-[13px] text-slate">
            See their space exactly as they do, for 30 minutes, with a banner on every screen.
            Actions are recorded as yours; consent, payments, security, export and resonance
            marks stay theirs alone.
          </p>
          <form action={enterAssist.bind(null, clientId)} className="flex flex-col gap-2">
            <select name="reason" required className="max-w-sm rounded-md border border-line px-3 py-2 text-sm text-ink">
              <option value="">Why are you entering?</option>
              {Object.entries(REASONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="text"
              name="note"
              placeholder="a word more, if useful"
              className="max-w-lg rounded-md border border-line px-3 py-2 text-sm text-ink"
            />
            <PendingButton
              className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              pendingLabel="Entering…"
            >
              Assist in their portal
            </PendingButton>
          </form>
        </section>

        {/* Audit trail */}
        {auditLines.length > 0 && (
          <section className="flex flex-col gap-1.5 border-t border-line pt-4">
            <h3 className="text-label font-semibold uppercase tracking-wide text-mocha">
              Recent support actions
            </h3>
            {auditLines.map((a, i) => (
              <p key={i} className="text-[12.5px] text-slate">
                {a.when} · {a.text}
              </p>
            ))}
          </section>
        )}
      </div>
    </details>
  );
}
