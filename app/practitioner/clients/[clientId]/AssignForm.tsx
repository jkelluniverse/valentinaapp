"use client";

import { useFormStatus } from "react-dom";
import { promptKindLabel } from "@/lib/prompt-meta";
import type { PromptKind } from "@prisma/client";

type LibraryItem = { id: string; title: string; kind: PromptKind };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send to client"}
    </button>
  );
}

export function AssignForm({
  action,
  library,
}: {
  action: (formData: FormData) => Promise<void>;
  library: LibraryItem[];
}) {
  if (library.length === 0) {
    return (
      <p className="text-sm text-ink">
        Your library is empty — add a prompt in <span className="font-medium">Library</span> first.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">
          From your library
        </span>
        <select
          name="promptId"
          required
          className="rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
        >
          {library.map((item) => (
            <option key={item.id} value={item.id}>
              {promptKindLabel(item.kind)} — {item.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">
          Due <span className="normal-case tracking-normal text-slate">(optional)</span>
        </span>
        <input
          type="date"
          name="dueAt"
          className="rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      </label>

      <SendButton />
    </form>
  );
}
