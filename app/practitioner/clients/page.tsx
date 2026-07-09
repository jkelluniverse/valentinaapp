import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPracticeOverview, type ClientRow } from "@/lib/attention";
import { SignatureRule, Eyebrow, StatusPill } from "@/components/brand";
import { formatDay } from "@/components/entries";
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

// Enriched roster (C8.2): name, last active, status, and a small signal.
// Stage column awaits Valentina's worksheet vocabulary (spec §4b).
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requirePractitioner();

  const [overview, invites] = await Promise.all([
    getPracticeOverview(),
    prisma.invite.findMany({
      where: { status: { in: ["PENDING", "REVOKED"] } },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const attentionOnly = searchParams.filter === "attention";
  const clients = [...overview.clients]
    .sort((a, b) => (b.signal.lastActive?.getTime() ?? 0) - (a.signal.lastActive?.getTime() ?? 0))
    .filter((r) => (attentionOnly ? needsAttention(r) : true));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your practice</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your clients</h1>
        <SignatureRule />
      </div>

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
      </div>

      {clients.length === 0 && invites.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-ink">
            {attentionOnly ? "Nothing needs your eyes right now." : "No clients yet. Invite your first client above."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {clients.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/practitioner/clients/${row.id}`}
                    className="truncate font-medium text-ink-strong underline-offset-4 hover:text-wine hover:underline"
                  >
                    {row.name || "Unnamed"}
                  </Link>
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
                className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between"
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
