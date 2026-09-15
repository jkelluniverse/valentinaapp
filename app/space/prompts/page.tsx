import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { MoodDots, formatDay } from "@/components/entries";
import { promptKindLabel } from "@/lib/prompt-meta";

export const dynamic = "force-dynamic";

// The client's past responses ("Done" list, C3 spec §5).
export default async function DonePromptsPage() {
  const user = await requireClient();

  const completed = await prisma.assignment.findMany({
    where: { clientId: user.id, status: "COMPLETED" },
    orderBy: { updatedAt: "desc" },
    include: { prompt: true, response: true },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>From Valentina</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your responses</h1>
        <SignatureRule />
      </div>

      {completed.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <p className="max-w-prose text-lg leading-relaxed text-ink">
            Nothing answered yet. When Valentina sends you a prompt and you respond, it lives
            here so you can look back on it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {completed.map((a) => (
            <Link
              key={a.id}
              href={`/space/prompts/${a.id}`}
              className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft transition-colors hover:bg-blush"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-mocha px-2.5 py-0.5 text-xs font-medium text-mocha">
                  {promptKindLabel(a.prompt.kind)}
                </span>
                <p className="font-medium text-ink-strong">{a.prompt.title}</p>
                <span className="ml-auto text-xs text-slate">
                  {a.response ? formatDay(a.response.completedAt) : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <MoodDots mood={a.response?.mood ?? null} />
                {a.response?.body && (
                  <p className="truncate text-sm text-ink">{a.response.body}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/space"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your space
      </Link>
    </div>
  );
}
