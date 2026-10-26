import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SPREADS, type Draw } from "@/lib/tools/tarot";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { performDraw } from "./actions";

// PLATFORM Phase 4 — the in-session draw tool (SESSION-class module).
// Every draw is a dated reading on the client's record; a session can be
// attached so the draw lives with that appointment.

export const dynamic = "force-dynamic";

export default async function DrawTool({
  searchParams,
}: {
  searchParams: { client?: string; drawn?: string; error?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const row = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, moduleKey: "tarot-draw", enabled: true },
  });
  if (!row) notFound();
  const label = ((row.settings ?? {}) as { displayLabel?: string }).displayLabel ?? "Card Draw";

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const selected = searchParams.client ?? "";
  const appointments = selected
    ? await prisma.appointment.findMany({
        where: { clientId: selected, kind: "SESSION" },
        orderBy: { startAt: "desc" },
        take: 5,
        select: { id: true, startAt: true },
      })
    : [];
  const draws = selected
    ? await prisma.reading.findMany({
        where: { clientId: selected, kind: "tarot-draw" },
        orderBy: { computedAt: "desc" },
        take: 10,
      })
    : [];
  const fieldCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <div className="flex flex-col gap-8">
      <Link href="/practitioner/tools" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← tools
      </Link>
      <div className="flex flex-col gap-2">
        <Eyebrow>Tools</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">{label}</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Draw in the moment, together. Each draw is kept as a dated reading on the client&apos;s
          record — optionally attached to a session.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Pick a client and a spread first.</p>
      )}

      <form action={performDraw} className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Client
          <select name="clientId" defaultValue={selected} required className={fieldCls}>
            <option value="">Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.email}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Spread
          <select name="spread" className={fieldCls}>
            {Object.entries(SPREADS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {appointments.length > 0 && (
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Attach to session
            <select name="sessionId" className={fieldCls}>
              <option value="">None</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.startAt.toISOString().slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
        )}
        <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
          Draw
        </PendingButton>
      </form>

      {draws.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Draws for this client</h2>
          {draws.map((d) => {
            const payload = d.payload as unknown as Draw;
            const isNew = d.id === searchParams.drawn;
            return (
              <div
                key={d.id}
                className={`flex flex-col gap-2 rounded-card border p-5 shadow-card ${isNew ? "border-mocha bg-blush" : "border-line bg-surface"}`}
              >
                <p className="text-[13px] text-slate">
                  {d.computedAt.toISOString().slice(0, 10)} · {SPREADS[payload.spread]?.label ?? payload.spread}
                  {d.sessionId ? " · attached to a session" : ""}
                  {isNew ? " · just drawn" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {payload.cards?.map((c) => (
                    <span key={c.position} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink">
                      <span className="text-[11px] uppercase tracking-wide text-mocha">{c.position}: </span>
                      {c.card}
                      {c.reversed ? " (reversed)" : ""}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
