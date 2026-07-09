import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow, StatusPill } from "@/components/brand";
import { EntryCard, groupByDay } from "@/components/entries";

export const dynamic = "force-dynamic";

// Thin read-only practitioner view (C2 spec §6): one client's entries for
// session prep. No editing, no AI, no cross-client search — that's C8.
export default async function ClientEntriesPage({ params }: { params: { clientId: string } }) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!client) notFound();

  const entries = await prisma.logEntry.findMany({
    where: { clientId: client.id },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  const groups = groupByDay(entries);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Client record</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[2.25rem] font-semibold">{client.name || client.email}</h1>
          <StatusPill status={client.active ? "Active" : "Inactive"} />
        </div>
        <p className="text-sm text-slate">{client.email} · read-only</p>
        <SignatureRule />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <h2 className="text-xl font-semibold">No entries yet</h2>
          <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink">
            When {client.name || "this client"} starts logging moments of awareness, they&apos;ll
            appear here for session prep.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-mocha">{group.day}</h2>
              {group.items.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </section>
          ))}
        </div>
      )}

      <Link
        href="/practitioner/clients"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your clients
      </Link>
    </div>
  );
}
