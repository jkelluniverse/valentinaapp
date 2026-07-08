import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow, StatusPill } from "@/components/brand";
import { InviteClientForm } from "./InviteClientForm";
import { InviteRowActions } from "./InviteRowActions";
import { ClientRowActions } from "./ClientRowActions";

export const dynamic = "force-dynamic";

type Row =
  | { kind: "client"; id: string; name: string | null; email: string; active: boolean; sortAt: Date }
  | { kind: "invite"; id: string; name: string | null; email: string; status: "PENDING" | "REVOKED"; sortAt: Date };

export default async function ClientsPage() {
  await requirePractitioner();

  const [clients, invites] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // Only invites that aren't yet accounts — accepted invites are shown as their client row.
    prisma.invite.findMany({
      where: { status: { in: ["PENDING", "REVOKED"] } },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: Row[] = [
    ...clients.map((c): Row => ({ kind: "client", id: c.id, name: c.name, email: c.email, active: c.active, sortAt: c.createdAt })),
    ...invites.map((i): Row => ({ kind: "invite", id: i.id, name: i.name, email: i.email, status: i.status as "PENDING" | "REVOKED", sortAt: i.createdAt })),
  ].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your practice</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your clients</h1>
        <SignatureRule />
      </div>

      <InviteClientForm />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-ink">No clients yet. Invite your first client above.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.id}`}
              className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-strong">{row.name || "Unnamed"}</p>
                <p className="truncate text-sm text-slate">{row.email}</p>
              </div>
              <div className="flex items-center gap-4">
                {row.kind === "client" ? (
                  <>
                    <StatusPill status={row.active ? "Active" : "Inactive"} />
                    <ClientRowActions userId={row.id} active={row.active} />
                  </>
                ) : (
                  <>
                    <StatusPill status={row.status === "PENDING" ? "Invited" : "Revoked"} />
                    <InviteRowActions inviteId={row.id} status={row.status} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
