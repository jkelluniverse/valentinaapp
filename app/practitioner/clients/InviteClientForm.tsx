"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvite } from "./actions";
import { CopyField } from "@/components/CopyField";

export function InviteClientForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await createInvite({ name, email });
    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLink(res.link ?? null);
    setName("");
    setEmail("");
    router.refresh();
  }

  const fieldClass =
    "rounded-md border border-line bg-white px-3 py-2 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
      {link ? (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold">Invite ready</h2>
            <p className="mt-1 text-sm text-ink">
              Copy this link and send it to your client however you like. It works once and
              expires in 7 days.
            </p>
          </div>
          <CopyField value={link} label="Invite link" />
          <button
            type="button"
            onClick={() => setLink(null)}
            className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            Invite another client
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Invite a client</h2>
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
          {error && <p className="text-sm text-rose">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
          >
            {loading ? "Creating…" : "Invite client"}
          </button>
        </form>
      )}
    </div>
  );
}
