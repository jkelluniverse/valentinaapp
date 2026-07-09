import Link from "next/link";
import { notFound } from "next/navigation";
import type { RecordKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getClientRecord } from "@/lib/client-record";
import { SignatureRule, Eyebrow, StatusPill } from "@/components/brand";
import { groupByDay, formatDay } from "@/components/entries";
import { RecordCard, StatCard, ThemeList, MoodTrend, CadenceLine } from "@/components/record";
import { RECORD_KINDS } from "@/lib/record-meta";

export const dynamic = "force-dynamic";

// The unified longitudinal record (C4 spec §7): one client, every stream,
// true chronological order, plus the derived rollups C5/C8 build on.
export default async function ClientFullRecordPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { kind?: string; tag?: string };
}) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!client) notFound();

  const kind = RECORD_KINDS.some((k) => k.value === searchParams.kind)
    ? (searchParams.kind as RecordKind)
    : undefined;
  const tag = searchParams.tag || undefined;

  const rec = await getClientRecord(client.id, { kind, tag });
  const groups = groupByDay(rec.timeline);
  const base = `/practitioner/clients/${client.id}/record`;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Eyebrow>Longitudinal record</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[2.25rem] font-semibold">{client.name || client.email}</h1>
          <StatusPill status={client.active ? "Active" : "Inactive"} />
        </div>
        <p className="text-sm text-slate">{client.email} · read-only</p>
        <SignatureRule />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Everything" value={String(rec.counts.total)} />
        <StatCard label="Moments" value={String(rec.counts.LOG_ENTRY ?? 0)} />
        <StatCard label="Responses" value={String(rec.counts.PROMPT_RESPONSE ?? 0)} />
        <StatCard
          label="Last active"
          value={rec.cadence.lastActive ? formatDay(rec.cadence.lastActive).split(",")[0] : "—"}
          hint={rec.cadence.lastActive ? formatDay(rec.cadence.lastActive) : undefined}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Recurring themes</h2>
        <ThemeList themes={rec.themes} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Mood over time</h2>
        <MoodTrend trend={rec.moodTrend} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Cadence</h2>
        <CadenceLine cadence={rec.cadence} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Timeline</h2>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Link
              href={base}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                !kind ? "bg-wine text-white" : "border border-line bg-white text-ink hover:bg-blush"
              }`}
            >
              All
            </Link>
            {RECORD_KINDS.filter((k) => ["LOG_ENTRY", "PROMPT_RESPONSE"].includes(k.value)).map(
              (k) => (
                <Link
                  key={k.value}
                  href={`${base}?kind=${k.value}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    kind === k.value
                      ? "bg-wine text-white"
                      : "border border-line bg-white text-ink hover:bg-blush"
                  }`}
                >
                  {k.label}
                </Link>
              ),
            )}
          </div>
        </div>
        {tag && (
          <p className="text-sm text-ink">
            Filtered by tag <span className="font-medium">{tag}</span> ·{" "}
            <Link href={base} className="text-wine underline-offset-4 hover:underline">
              clear
            </Link>
          </p>
        )}

        {groups.length === 0 ? (
          <p className="text-ink">Nothing here yet.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.day} className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-mocha">{group.day}</h3>
                {group.items.map((item) => (
                  <RecordCard key={item.id} item={item} />
                ))}
              </section>
            ))}
          </div>
        )}
      </section>

      <Link
        href={`/practitioner/clients/${client.id}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the client page
      </Link>
    </div>
  );
}
