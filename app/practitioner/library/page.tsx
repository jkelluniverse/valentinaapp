import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { promptKindLabel } from "@/lib/prompt-meta";
import { PromptForm } from "./PromptForm";
import { ArchiveToggle } from "./ArchiveToggle";
import { SendToClient } from "./SendToClient";
import { createPrompt, sendPromptToClient } from "./actions";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { saved?: string; sent?: string; error?: string };
}) {
  await requirePractitioner();

  const [prompts, clients] = await Promise.all([
    prisma.prompt.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const active = prompts.filter((p) => p.active);
  const archived = prompts.filter((p) => !p.active);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Between sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your library</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Prompts, exercises, and check-ins you can send to a client from their record page.
        </p>
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Saved to library.</p>
      )}
      {searchParams.sent && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — it&apos;s waiting in their space.
        </p>
      )}
      {searchParams.error === "send" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That couldn&apos;t be sent — check the item and client and try again.
        </p>
      )}

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-semibold">Add to the library</h2>
        <PromptForm
          action={createPrompt}
          clients={clients}
          error={searchParams.error === "missing" ? "A title and the text are both needed." : null}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">In use</h2>
        {active.length === 0 ? (
          <p className="text-ink">Nothing here yet — add your first prompt above.</p>
        ) : (
          active.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-mocha px-2.5 py-0.5 text-xs font-medium text-mocha">
                  {promptKindLabel(p.kind)}
                </span>
                <p className="font-medium text-ink-strong">{p.title}</p>
                <span className="ml-auto flex items-center gap-4">
                  <SendToClient action={sendPromptToClient.bind(null, p.id)} clients={clients} />
                  <Link
                    href={`/practitioner/library/${p.id}`}
                    className="text-sm font-medium text-wine underline-offset-4 hover:underline"
                  >
                    Edit
                  </Link>
                  <ArchiveToggle promptId={p.id} active={p.active} />
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{p.body}</p>
            </div>
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-slate">Archived</h2>
          {archived.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white/60 p-4"
            >
              <span className="inline-flex items-center rounded-full bg-line/50 px-2.5 py-0.5 text-xs font-medium text-slate">
                {promptKindLabel(p.kind)}
              </span>
              <p className="text-sm text-slate">{p.title}</p>
              <span className="ml-auto">
                <ArchiveToggle promptId={p.id} active={p.active} />
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
