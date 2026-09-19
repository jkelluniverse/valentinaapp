"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvite } from "./actions";
import { CopyField } from "@/components/CopyField";

// EMAIL-SPEC §4 — name + email (+ her optional personal line, + language), and
// the email sends itself. Copy-link remains as the fallback, not the workflow.
export function InviteClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [locale, setLocale] = useState("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ link: string; emailed: boolean; email: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await createInvite({ name, email, personalNote: note, locale });
    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ link: res.link ?? "", emailed: Boolean(res.emailed), email });
    setName("");
    setEmail("");
    setNote("");
    router.refresh();
  }

  const fieldClass =
    "rounded-md border border-line bg-white px-3 py-2 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20";

  // Collapsed by default — inviting is occasional; the roster is the page.
  if (!open && !result) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          + Invite a client
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
      {result ? (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {result.emailed ? "Invitation sent" : "Invite ready — but the email didn't send"}
            </h2>
            <p className="mt-1 text-sm text-ink">
              {result.emailed
                ? `The invitation email is on its way to ${result.email}. If it doesn't arrive, the link below is the fallback.`
                : `The email couldn't be sent right now — share this link with them directly, or try Resend from the list below.`}
            </p>
          </div>
          <CopyField value={result.link} label="Invite link (fallback)" />
          <span className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
            >
              Invite another client
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setOpen(false);
              }}
              className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
            >
              Done
            </button>
          </span>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Invite a client</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-pill px-2 py-1 text-slate hover:text-wine"
            >
              ✕
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Their name"
                className={`${fieldClass} font-normal normal-case tracking-normal`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className={`${fieldClass} font-normal normal-case tracking-normal`}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
            A personal line (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder={`"María — so glad we're beginning. See you Thursday. — V"`}
              className={`${fieldClass} resize-none font-normal normal-case tracking-normal`}
            />
            <span className="text-xs font-normal normal-case tracking-normal text-slate">
              Lands inside the invitation email, in your voice.
            </span>
          </label>
          <label className="flex max-w-[220px] flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
            Email language
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className={`${fieldClass} font-normal normal-case tracking-normal`}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          {error && <p className="text-sm text-rose">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:cursor-wait disabled:opacity-70"
          >
            {loading && (
              <span
                aria-hidden
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            )}
            {loading ? "Sending…" : "Send invitation"}
          </button>
        </form>
      )}
    </div>
  );
}
