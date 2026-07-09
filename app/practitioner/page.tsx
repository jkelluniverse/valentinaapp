import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPracticeOverview, ATTENTION, type ClientRow } from "@/lib/attention";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { StatCard } from "@/components/record";
import { formatDay, formatTime } from "@/components/entries";
import { recordKindLabel, recordKindPill } from "@/lib/record-meta";

export const dynamic = "force-dynamic";

function ClientLine({ row, note }: { row: ClientRow; note: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2 text-sm">
      <Link
        href={`/practitioner/clients/${row.id}`}
        className="font-medium text-wine underline-offset-4 hover:underline"
      >
        {row.name || row.email}
      </Link>
      <span className="text-slate">{note}</span>
    </li>
  );
}

// Valentina's home base (C8): the practice at a glance. Warm command center,
// composition-only — everything links into surfaces earlier components built.
export default async function PractitionerHome() {
  const practitioner = await requirePractitioner();
  const o = await getPracticeOverview();

  const attentionCount =
    o.attention.referralFlagged.length +
    o.attention.inactive.length +
    o.attention.moodDips.length +
    o.attention.staleInvites.length;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your practice</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">
          Welcome back{practitioner.name ? `, ${practitioner.name.split(" ")[0]}` : ""}
        </h1>
        <SignatureRule />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active clients" value={String(o.counts.activeClients)} />
        <StatCard label="Pending invites" value={String(o.counts.pendingInvites)} />
        <StatCard
          label="This week"
          value={String(o.counts.recentItems)}
          hint={`moments & responses, last ${ATTENTION.recentActivityDays} days`}
        />
        <StatCard
          label="Needs your eyes"
          value={String(attentionCount)}
          hint={attentionCount === 0 ? "all quiet" : undefined}
        />
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/practitioner/clients"
          className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
        >
          Invite a client
        </Link>
        <Link
          href="/practitioner/library"
          className="rounded-md border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          Send something
        </Link>
        <Link
          href="/practitioner/search"
          className="rounded-md border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          Search everything
        </Link>
      </section>

      {attentionCount > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Worth a look</h2>
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 shadow-soft">
            {o.attention.referralFlagged.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-label font-semibold uppercase tracking-wide text-rose">
                  Referral flagged on last prep
                </p>
                <ul className="flex flex-col gap-1">
                  {o.attention.referralFlagged.map((r) => (
                    <li key={r.id} className="text-sm">
                      <Link
                        href={`/practitioner/clients/${r.id}/prep`}
                        className="font-medium text-wine underline-offset-4 hover:underline"
                      >
                        {r.name || r.email}
                      </Link>{" "}
                      <span className="text-slate">— review before anything else</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {o.attention.moodDips.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-label font-semibold uppercase tracking-wide text-mocha">
                  Mood softer than usual
                </p>
                <ul className="flex flex-col gap-1">
                  {o.attention.moodDips.map((r) => (
                    <ClientLine
                      key={r.id}
                      row={r}
                      note={`recently ${r.signal.recentMood} vs ${r.signal.baselineMood} overall`}
                    />
                  ))}
                </ul>
              </div>
            )}
            {o.attention.inactive.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-label font-semibold uppercase tracking-wide text-mocha">
                  Hasn&apos;t logged in a while
                </p>
                <ul className="flex flex-col gap-1">
                  {o.attention.inactive.map((r) => (
                    <ClientLine
                      key={r.id}
                      row={r}
                      note={
                        r.signal.lastActive
                          ? `last active ${formatDay(r.signal.lastActive)}`
                          : "no activity yet"
                      }
                    />
                  ))}
                </ul>
              </div>
            )}
            {o.attention.staleInvites.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-label font-semibold uppercase tracking-wide text-mocha">
                  Invites still waiting
                </p>
                <ul className="flex flex-col gap-1">
                  {o.attention.staleInvites.map((i) => (
                    <li key={i.id} className="text-sm text-ink">
                      {i.name || i.email}{" "}
                      <span className="text-slate">
                        — invited {formatDay(i.createdAt)}; a nudge or a{" "}
                        <Link href="/practitioner/clients" className="text-wine underline-offset-4 hover:underline">
                          fresh link
                        </Link>{" "}
                        might help
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {o.recentPreps.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Recent session preps</h2>
          <ul className="flex flex-col gap-1.5">
            {o.recentPreps.map((p) => (
              <li key={p.id} className="text-sm">
                <Link
                  href={`/practitioner/clients/${p.clientId}/prep?prep=${p.id}`}
                  className="font-medium text-wine underline-offset-4 hover:underline"
                >
                  {p.clientName}
                </Link>{" "}
                <span className="text-slate">
                  · {formatDay(p.createdAt)} {formatTime(p.createdAt)}
                </span>
                {p.referralFlag && <span className="ml-2 font-medium text-rose">referral flagged</span>}
                {p.practitionerNotes && <span className="ml-2 text-slate">annotated</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Across your practice</h2>
        {o.feed.length === 0 ? (
          <p className="text-ink">
            Nothing yet — activity appears here as clients log moments and respond.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {o.feed.map((item) => (
              <Link
                key={item.id}
                href={`/practitioner/clients/${item.clientId}`}
                className="flex flex-wrap items-baseline gap-2 rounded-lg border border-line bg-white px-4 py-3 shadow-soft transition-colors hover:bg-blush"
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${recordKindPill(item.kind)}`}
                >
                  {recordKindLabel(item.kind)}
                </span>
                <span className="text-sm font-medium text-ink-strong">{item.clientName}</span>
                {item.title && <span className="text-sm text-ink">{item.title}</span>}
                <span className="ml-auto text-xs text-slate">{formatDay(item.occurredAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
