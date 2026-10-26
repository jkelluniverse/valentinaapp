import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { tenantDb } from "@/lib/tenancy/db";
import { getPractitioner, getOrCreateConfig, formatInZone, zonedParts, zonedWallToUtc, DAY_MS } from "@/lib/schedule";
import { stageByKey } from "@/lib/program-config";
import { firstNameOf } from "@/lib/name";

// PLATFORM Layer 1 — dashboard-v1's home: Today. Ops-first — the schedule,
// the roster with statuses, the numbers — where journey-v1's home is a quiet
// feed. Composes existing feature data through the tenant-scoped DAL; no new
// behavior, only a new arrangement.

export const dynamic = "force-dynamic";

function relDay(d: Date | null): string {
  if (!d) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

export async function DashboardHome() {
  const practitioner = await requirePractitioner();
  const tenant = await getTenant();
  const db = tenantDb(tenant.id);

  const p = await getPractitioner();
  const config = p ? await getOrCreateConfig(p.id) : null;
  const tz = config?.timezone ?? "America/New_York";

  const now = new Date();
  const parts = zonedParts(now, tz);
  const dayStart = zonedWallToUtc(parts.year, parts.month0, parts.day, 0, tz);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const [todays, clients, profiles, upcoming, unread, pendingInvites, lastTouch] = await Promise.all([
    db.appointment.findMany({
      where: { status: "SCHEDULED", startAt: { gte: dayStart, lt: dayEnd } },
      include: {
        client: { select: { id: true, name: true, email: true } },
        lead: { select: { name: true, email: true } },
      },
      orderBy: { startAt: "asc" },
    }) as Promise<
      { id: string; kind: string; startAt: Date; clientId: string | null; client: { id: string; name: string | null; email: string } | null; lead: { name: string | null; email: string } | null }[]
    >,
    db.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }) as Promise<{ id: string; name: string | null; email: string }[]>,
    db.clientProfile.findMany({ select: { userId: true, stage: true } }) as Promise<
      { userId: string; stage: string | null }[]
    >,
    db.appointment.findMany({
      where: { status: "SCHEDULED", startAt: { gte: dayEnd } },
      select: { clientId: true, startAt: true },
      orderBy: { startAt: "asc" },
    }) as Promise<{ clientId: string | null; startAt: Date }[]>,
    db.message.count({ where: { senderRole: "CLIENT", readAt: null, deletedAt: null } }),
    db.invite.count({ where: { status: "PENDING" } }),
    db.recordItem.findMany({
      where: { kind: { not: "NOTE" } },
      select: { clientId: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
      take: 400,
    }) as Promise<{ clientId: string; occurredAt: Date }[]>,
  ]);

  const stageOf = new Map(profiles.map((pr) => [pr.userId, pr.stage]));
  const nextOf = new Map<string, Date>();
  for (const a of upcoming) {
    if (a.clientId && !nextOf.has(a.clientId)) nextOf.set(a.clientId, a.startAt);
  }
  for (const a of todays) {
    if (a.clientId && !nextOf.has(a.clientId)) nextOf.set(a.clientId, a.startAt);
  }
  const lastOf = new Map<string, Date>();
  for (const r of lastTouch) {
    if (!lastOf.has(r.clientId)) lastOf.set(r.clientId, r.occurredAt);
  }

  const stats: { label: string; value: number; href: string }[] = [
    { label: "Sessions today", value: todays.length, href: "/practitioner/schedule" },
    { label: "Active clients", value: clients.length, href: "/practitioner/clients" },
    { label: "Unread messages", value: unread, href: "/practitioner/messages" },
    { label: "Invites pending", value: pendingInvites, href: "/practitioner/clients" },
  ];

  const first = practitioner.name?.trim().split(/\s+/)[0] || "there";
  const todayLabel = formatInZone(now, tz, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-headline text-[1.5rem] font-medium text-ink-strong md:text-[1.875rem]">Today</h1>
        <p className="text-sm text-whisper">
          {todayLabel} · {first}&apos;s practice
        </p>
      </div>

      {/* Statuses — the numbers, each one click from its surface. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-mocha"
          >
            <span className="block font-headline text-[1.75rem] font-medium text-ink-strong">{s.value}</span>
            <span className="text-[13px] text-whisper">{s.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        {/* Schedule — today, in order. */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-headline text-lg font-medium text-ink-strong">Schedule</h2>
            <Link href="/practitioner/schedule" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
              full calendar →
            </Link>
          </div>
          {todays.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-4 text-sm text-whisper shadow-card">
              Nothing scheduled today.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {todays.map((a) => {
                const who = a.client?.name || a.client?.email || a.lead?.name || a.lead?.email || "Discovery call";
                const row = (
                  <span className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-[13px] tabular-nums text-whisper">
                      {formatInZone(a.startAt, tz, { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{who}</span>
                    <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] text-whisper">
                      {a.kind === "DISCOVERY" ? "discovery" : "session"}
                    </span>
                  </span>
                );
                return (
                  <li key={a.id} className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
                    {a.client ? (
                      <Link href={`/practitioner/clients/${a.client.id}`} className="block hover:text-wine">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Roster — every active client, status at a glance. */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-headline text-lg font-medium text-ink-strong">Roster</h2>
            <Link href="/practitioner/clients" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
              all clients →
            </Link>
          </div>
          <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-wide text-whisper">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Last activity</th>
                  <th className="px-4 py-2.5 font-medium">Next session</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-whisper">
                      No active clients yet.
                    </td>
                  </tr>
                )}
                {clients.map((c) => {
                  const stage = stageByKey(stageOf.get(c.id) ?? "");
                  const next = nextOf.get(c.id);
                  return (
                    <tr key={c.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/practitioner/clients/${c.id}`} className="text-ink underline-offset-4 hover:text-wine hover:underline">
                          {firstNameOf(c.name || c.email)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {stage ? (
                          <span className="rounded-pill border border-mocha px-2 py-0.5 text-[11px] text-mocha">{stage.label}</span>
                        ) : (
                          <span className="text-whisper">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-whisper">{relDay(lastOf.get(c.id) ?? null)}</td>
                      <td className="px-4 py-2.5 text-whisper">
                        {next ? formatInZone(next, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
