import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow, StatusPill } from "@/components/brand";
import { EntryCard, MoodDots, groupByDay, formatDay } from "@/components/entries";
import { promptKindLabel } from "@/lib/prompt-meta";
import { AssignForm } from "./AssignForm";
import { assignPrompt } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Waiting",
  COMPLETED: "Answered",
  DISMISSED: "Set aside",
};

// Read-only client record for session prep (C2), plus between-session
// assignment + responses (C3). Rich cross-client views stay in C8.
export default async function ClientRecordPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { sent?: string; error?: string };
}) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!client) notFound();

  const [entries, assignments, library] = await Promise.all([
    prisma.logEntry.findMany({
      where: { clientId: client.id },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
    prisma.assignment.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      include: { prompt: true, response: true },
      take: 100,
    }),
    prisma.prompt.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, kind: true },
    }),
  ]);

  const groups = groupByDay(entries);
  const boundAssign = assignPrompt.bind(null, client.id);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Eyebrow>Client record</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[2.25rem] font-semibold">{client.name || client.email}</h1>
          <StatusPill status={client.active ? "Active" : "Inactive"} />
        </div>
        <p className="text-sm text-slate">{client.email} · read-only</p>
        <SignatureRule />
        <div className="mt-1 flex flex-wrap gap-4">
          <Link
            href={`/practitioner/clients/${client.id}/record`}
            className="text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            Full record &amp; rollups →
          </Link>
          <Link
            href={`/practitioner/clients/${client.id}/prep`}
            className="text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            Session prep →
          </Link>
        </div>
      </div>

      {searchParams.sent && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — it&apos;s waiting in their space.
        </p>
      )}
      {searchParams.error === "prompt" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That library item isn&apos;t available — pick another.
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Send something for between sessions</h2>
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <AssignForm action={boundAssign} library={library} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Between sessions</h2>
        {assignments.length === 0 ? (
          <p className="text-ink">Nothing sent yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-mocha px-2.5 py-0.5 text-xs font-medium text-mocha">
                    {promptKindLabel(a.prompt.kind)}
                  </span>
                  <p className="font-medium text-ink-strong">{a.prompt.title}</p>
                  <span
                    className={`ml-auto text-xs font-medium ${
                      a.status === "COMPLETED" ? "text-wine" : "text-slate"
                    }`}
                  >
                    {STATUS_LABEL[a.status]}
                    {a.dueAt && a.status === "PENDING" ? ` · due ${formatDay(a.dueAt)}` : ""}
                  </span>
                </div>
                {a.response && (
                  <div className="flex flex-col gap-2 rounded-md bg-cream p-4">
                    <div className="flex items-center gap-3">
                      <MoodDots mood={a.response.mood} />
                      <span className="ml-auto text-xs text-slate">
                        {formatDay(a.response.completedAt)}
                      </span>
                    </div>
                    {a.response.body && (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                        {a.response.body}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Moments of awareness</h2>
        {groups.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
            <p className="max-w-prose text-lg leading-relaxed text-ink">
              When {client.name || "this client"} starts logging moments of awareness,
              they&apos;ll appear here for session prep.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.day} className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-mocha">{group.day}</h3>
                {group.items.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <Link
        href="/practitioner/clients"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your clients
      </Link>
    </div>
  );
}
