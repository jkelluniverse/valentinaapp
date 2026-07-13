import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPracticeOverview, type ClientRow } from "@/lib/attention";
import { StatusPill } from "@/components/brand";
import { PageHeader } from "@/components/PageHeader";
import { formatDay } from "@/components/entries";
import { PROGRAM_STAGES, programStageLabel } from "@/lib/program-config";
import { InviteClientForm } from "./InviteClientForm";
import { InviteRowActions } from "./InviteRowActions";
import { ClientRowActions } from "./ClientRowActions";

export const dynamic = "force-dynamic";

function needsAttention(r: ClientRow) {
  return r.signal.referralFlagged || r.signal.inactive || r.signal.moodDip;
}

function MoodArrow({ row }: { row: ClientRow }) {
  const { recentMood, baselineMood } = row.signal;
  if (recentMood == null || baselineMood == null) return null;
  const delta = recentMood - baselineMood;
  const glyph = delta >= 0.5 ? "↑" : delta <= -0.5 ? "↓" : "→";
  return (
    <span
      className={`text-xs font-medium ${delta <= -0.5 ? "text-rose" : "text-mocha"}`}
      title={`Mood recently ${recentMood} vs ${baselineMood} overall`}
    >
      mood {glyph}
    </span>
  );
}

// Enriched roster (C8.2): name, last active, status, stage (C13.1), and a
// small signal. Filterable by attention or program stage.
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requirePractitioner();

  const [overview, invites, profiles] = await Promise.all([
    getPracticeOverview(),
    prisma.invite.findMany({
      where: { status: { in: ["PENDING", "REVOKED"] } },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.clientProfile.findMany({ select: { userId: true, stage: true } }),
  ]);
  const stageOf = new Map(profiles.map((p) => [p.userId, p.stage]));

  const attentionOnly = searchParams.filter === "attention";
  const stageFilter = PROGRAM_STAGES.some((s) => s.key === searchParams.filter)
    ? searchParams.filter
    : null;
  const clients = [...overview.clients]
    .sort((a, b) => (b.signal.lastActive?.getTime() ?? 0) - (a.signal.lastActive?.getTime() ?? 0))
    .filter((r) => (attentionOnly ? needsAttention(r) : true))
    .filter((r) => (stageFilter ? stageOf.get(r.id) === stageFilter : true));

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader title="Your clients" eyebrow="Your practice" />

      <InviteClientForm />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/practitioner/clients"
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            !attentionOnly ? "bg-wine text-white" : "border border-line bg-white text-ink hover:bg-blush"
          }`}
        >
          Everyone
        </Link>
        <Link
          href="/practitioner/clients?filter=attention"
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            attentionOnly ? "bg-wine text-white" : "border border-line bg-white text-ink hover:bg-blush"
          }`}
        >
          Worth a look
        </Link>
        {PROGRAM_STAGES.map((s) => (
          <Link
            key={s.key}
            href={`/practitioner/clients?filter=${s.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              stageFilter === s.key
                ? "bg-wine text-white"
                : "border border-line bg-white text-ink hover:bg-blush"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {clients.length === 0 && invites.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-ink">
            {attentionOnly ? "Nothing needs your eyes right now." : "No clients yet. Invite your first client above."}
          </p>
        </div>
      ) : (
        <ul className="-mx-4 flex flex-col divide-y divide-line md:mx-0">
          {clients.map((row) => (
            <li
              key={row.id}
              className="flex min-h-[52px] flex-col justify-center gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/practitioner/clients/${row.id}`}
                    className="truncate font-medium text-ink-strong underline-offset-4 hover:text-wine hover:underline"
                  >
                    {row.name || "Unnamed"}
                  </Link>
                  {stageOf.get(row.id) && (
                    <span className="rounded-full border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">
                      {programStageLabel(stageOf.get(row.id))}
                    </span>
                  )}
                  {row.signal.referralFlagged && (
                    <span className="rounded-full bg-blush-deep px-2 py-0.5 text-xs font-medium text-rose">
                      referral flagged
                    </span>
                  )}
                  <MoodArrow row={row} />
                </div>
                <p className="truncate text-sm text-slate">
                  {row.email}
                  {" · "}
                  {row.signal.lastActive
                    ? `last active ${formatDay(row.signal.lastActive)}`
                    : "no activity yet"}
                  {row.signal.inactive && " · quiet lately"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusPill status={row.active ? "Active" : "Inactive"} />
                <ClientRowActions userId={row.id} active={row.active} />
              </div>
            </li>
          ))}

          {!attentionOnly &&
            invites.map((row) => (
              <li
                key={`invite-${row.id}`}
                className="flex min-h-[52px] flex-col justify-center gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-strong">{row.name || "Unnamed"}</p>
                  <p className="truncate text-sm text-slate">
                    {row.email} · invited {formatDay(row.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusPill status={row.status === "PENDING" ? "Invited" : "Revoked"} />
                  <InviteRowActions inviteId={row.id} status={row.status as "PENDING" | "REVOKED"} />
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
