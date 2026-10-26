import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { SignatureRule, Eyebrow } from "@/components/brand";
import {
  listProspects,
  normalizeFilter,
  prospectCounts,
  prospectSources,
  PROSPECT_STATUSES,
} from "@/lib/prospects";
import { topReferrers } from "@/lib/referrals";
import { engageQueue, engageTick, messageHistory } from "@/lib/engage";
import { ENGAGE_ENABLED_KEY, ENGAGE_PAUSED_KEY } from "@/lib/engage-config";

// C23-CAPTURE §3 — the list Jacob works the week after the event. Gated on the
// PLATFORM_ADMIN_EMAILS allowlist exactly as /admin/tenants/new is: renders for
// the allowlist, 404 for everyone else, no new role invented.
//
// Deliberately plain: a table, three filters, the counts, and a CSV link.
// Internal admin surface — not Valentina's chrome, not a client surface.
export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: { status?: string; source?: string; q?: string; dryRun?: string };
}) {
  const user = await requirePractitioner();
  if (!isPlatformAdmin(user.email)) notFound();

  const filter = normalizeFilter(searchParams);
  const [rows, counts, sources, referrers] = await Promise.all([
    listProspects(filter),
    prospectCounts(filter),
    prospectSources(),
    // C23-REFERRAL §4 — deliberately NOT filter-scoped (unlike the counts,
    // ruling 10): "which founding partner is carrying the network" is a
    // question about the whole ledger, and the heading says so.
    topReferrers(),
  ]);

  // C23-ENGAGE §5 — follow-up, read-only. Jacob should be able to read the
  // sequence before it reaches forty people, so this page shows the queue, the
  // per-prospect ledger, the switch state, and a DRY RUN that writes nothing.
  const wantDryRun = searchParams.dryRun === "1";
  const [queue, history, dryRun] = await Promise.all([
    engageQueue({ limit: 200 }),
    messageHistory(rows.map((r) => r.id)),
    // dryRun: true short-circuits before the ledger is touched at all — no
    // claim, no update, no audit row, no send. Verify item 13 asserts the
    // ledger count is identical before and after loading this page.
    wantDryRun ? engageTick({ dryRun: true, limit: 200 }) : Promise.resolve(null),
  ]);
  const dueNext = queue.steps.filter((s) => !s.due).slice(0, 40);
  const dueNow = queue.steps.filter((s) => s.due).slice(0, 40);

  const exportQs = new URLSearchParams();
  if (filter.status) exportQs.set("status", filter.status);
  if (filter.source) exportQs.set("source", filter.source);
  if (filter.q) exportQs.set("q", filter.q);

  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-mocha";
  const td = "px-3 py-2 align-top text-[13px] text-ink";
  const input =
    "rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-wine";

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 md:px-8">
      <Eyebrow>Platform admin</Eyebrow>
      <h1 className="mt-2 font-headline text-3xl font-semibold text-ink-strong">Practitioner prospects</h1>
      <SignatureRule className="mt-4" />

      <section className="mt-8 flex flex-wrap gap-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Total</p>
          <p className="mt-1 font-headline text-3xl font-semibold text-wine">{counts.total}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">By status</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[14px] text-ink">
            {counts.byStatus.length === 0 && <li className="text-whisper">—</li>}
            {counts.byStatus.map((c) => (
              <li key={c.key}>
                <span className="font-semibold text-ink-strong">{c.count}</span> {c.key}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">By source</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[14px] text-ink">
            {counts.bySource.length === 0 && <li className="text-whisper">—</li>}
            {counts.bySource.map((c) => (
              <li key={c.key}>
                <span className="font-semibold text-ink-strong">{c.count}</span> {c.key}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <form method="GET" className="mt-8 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-mocha">
          Status
          <select name="status" defaultValue={filter.status ?? ""} className={input}>
            <option value="">All</option>
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-mocha">
          Source
          <select name="source" defaultValue={filter.source ?? ""} className={input}>
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-mocha">
          Email contains
          <input name="q" defaultValue={filter.q ?? ""} placeholder="@" className={input} />
        </label>
        <button
          type="submit"
          className="rounded-pill bg-wine px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-wine-dark"
        >
          Apply
        </button>
        <Link href="/admin/prospects" className="px-2 py-2.5 text-[14px] text-slate underline">
          Clear
        </Link>
        <a
          href={`/admin/prospects/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`}
          className="rounded-pill border border-mocha px-5 py-2.5 text-[14px] font-semibold text-wine transition-colors hover:bg-blush"
        >
          Export CSV
        </a>
        <Link
          href="/admin/prospects/qr"
          className="rounded-pill border border-line px-5 py-2.5 text-[14px] font-semibold text-slate transition-colors hover:bg-blush"
        >
          Event QR
        </Link>
      </form>

      <div className="mt-8 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="min-w-full border-collapse">
          <thead className="border-b border-line bg-blush/40">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Phone</th>
              <th className={th}>Practice</th>
              <th className={th}>Note</th>
              <th className={th}>Status</th>
              <th className={th}>Source</th>
              <th className={th}>Referred by</th>
              <th className={th}>Their code</th>
              <th className={th}>Tenant</th>
              {/* C23-ENGAGE §5 — this prospect's own send ledger. */}
              <th className={th}>Follow-up</th>
              <th className={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className={`${td} text-slate`} colSpan={12}>
                  No prospects match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 last:border-0">
                <td className={`${td} font-medium text-ink-strong`}>{r.name}</td>
                <td className={td}>{r.email}</td>
                <td className={td}>{r.phone ?? "—"}</td>
                <td className={td}>{r.practiceName ?? "—"}</td>
                <td className={`${td} max-w-[22rem] whitespace-pre-wrap`}>{r.note ?? "—"}</td>
                <td className={td}>{r.status}</td>
                <td className={td}>{r.source ?? "—"}</td>
                <td className={`${td} font-mono`}>{r.referredByCode ?? "—"}</td>
                <td className={`${td} font-mono`}>{r.referralCode}</td>
                <td className={td}>{r.tenantSlug ?? "—"}</td>
                <td className={`${td} min-w-[16rem]`}>
                  {(history.get(r.id) ?? []).length === 0 ? (
                    <span className="text-whisper">—</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {(history.get(r.id) ?? []).map((m) => (
                        <li key={m.id} className="whitespace-nowrap text-[12px]">
                          <span className="font-mono text-mocha">
                            {m.sequenceKey}/{m.stepKey}
                          </span>{" "}
                          <span className="font-semibold text-ink-strong">{m.status}</span>
                          {m.reason ? <span className="text-slate"> · {m.reason}</span> : null}
                          <span className="text-whisper"> · {m.locale}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-slate`}>
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* C23-ENGAGE §5 — follow-up. READ-ONLY on purpose: this screen shows
          what the engine will do and what it has done. Opening the gate or
          pulling the pause is a deliberate act on the switch rows (see the
          ops notes), not a button next to a table of forty people. */}
      <section className="mt-12">
        <h2 className="font-headline text-2xl font-semibold text-ink-strong">Follow-up sequences</h2>
        <p className="mt-1 text-[13px] text-slate">
          Two sequences: <span className="font-mono">event-lead</span> (3 steps) and{" "}
          <span className="font-mono">founding-welcome</span> (2 steps). Driven by{" "}
          <span className="font-mono">/api/jobs/tick</span>.
        </p>

        <div className="mt-4 flex flex-wrap gap-8 rounded-card border border-line bg-surface px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Feature gate</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-strong">
              {queue.switches.gateOpen ? "OPEN — sending allowed" : "CLOSED — nothing sends"}
            </p>
            <p className="text-[12px] text-whisper">
              <span className="font-mono">{ENGAGE_ENABLED_KEY}</span>
              {queue.switches.envEnabled ? " · opened by ENGAGE_ENABLED" : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Global pause</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-strong">
              {queue.switches.paused ? "PAUSED — nothing sends" : "not paused"}
            </p>
            <p className="text-[12px] text-whisper">
              <span className="font-mono">{ENGAGE_PAUSED_KEY}</span>
              {queue.switches.envPaused ? " · paused by ENGAGE_PAUSED" : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Email transport</p>
            <p className="mt-1 text-[15px] font-semibold text-ink-strong">
              {queue.configured ? "configured" : "NOT configured"}
            </p>
            <p className="text-[12px] text-whisper">
              {queue.configured ? "sends will be attempted" : "due steps record UNCONFIGURED and stay re-sendable"}
            </p>
          </div>
          <div className="flex items-end">
            <a
              href={`/admin/prospects?${new URLSearchParams({ ...(filter.status ? { status: filter.status } : {}), ...(filter.source ? { source: filter.source } : {}), ...(filter.q ? { q: filter.q } : {}), dryRun: "1" }).toString()}`}
              className="rounded-pill border border-mocha px-5 py-2.5 text-[14px] font-semibold text-wine transition-colors hover:bg-blush"
            >
              Dry run the next tick
            </a>
          </div>
        </div>

        {dryRun && (
          <div className="mt-6">
            <h3 className="font-headline text-lg font-semibold text-ink-strong">
              Dry run — what the next tick would do
            </h3>
            <p className="mt-1 text-[13px] text-slate">
              Nothing was written: no ledger row, no audit row, no send. As of{" "}
              <span className="font-mono">{dryRun.asOf}</span> · considered {dryRun.considered} ·{" "}
              sent {dryRun.counts.SENT} · skipped {dryRun.counts.SKIPPED} · suppressed{" "}
              {dryRun.counts.SUPPRESSED} · unconfigured {dryRun.counts.UNCONFIGURED}
            </p>
            <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
              <table className="min-w-full border-collapse">
                <thead className="border-b border-line bg-blush/40">
                  <tr>
                    <th className={th}>Prospect</th>
                    <th className={th}>Sequence / step</th>
                    <th className={th}>Locale</th>
                    <th className={th}>Scheduled</th>
                    <th className={th}>Would record</th>
                    <th className={th}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRun.steps.length === 0 && (
                    <tr>
                      <td className={`${td} text-slate`} colSpan={6}>
                        Nothing is due right now.
                      </td>
                    </tr>
                  )}
                  {dryRun.steps.map((s) => (
                    <tr key={`${s.prospectId}-${s.sequenceKey}-${s.stepKey}`} className="border-b border-line/60 last:border-0">
                      <td className={td}>{s.email}</td>
                      <td className={`${td} font-mono`}>
                        {s.sequenceKey}/{s.stepKey}
                      </td>
                      <td className={td}>{s.locale}</td>
                      <td className={`${td} whitespace-nowrap text-slate`}>
                        {s.scheduledFor.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className={`${td} font-semibold`}>{s.plannedStatus}</td>
                      <td className={td}>{s.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="min-w-full border-collapse">
            <thead className="border-b border-line bg-blush/40">
              <tr>
                <th className={th}>Queue</th>
                <th className={th}>Prospect</th>
                <th className={th}>Sequence / step</th>
                <th className={th}>Locale</th>
                <th className={th}>Scheduled</th>
                <th className={th}>Ledger says</th>
              </tr>
            </thead>
            <tbody>
              {dueNow.length === 0 && dueNext.length === 0 && (
                <tr>
                  <td className={`${td} text-slate`} colSpan={6}>
                    Nothing queued — no prospect is in either audience yet.
                  </td>
                </tr>
              )}
              {[
                ...dueNow.map((s) => ["due now", s] as const),
                ...dueNext.map((s) => ["upcoming", s] as const),
              ].map(([kind, s]) => (
                <tr key={`${kind}-${s.prospectId}-${s.sequenceKey}-${s.stepKey}`} className="border-b border-line/60 last:border-0">
                  <td className={`${td} font-semibold ${kind === "due now" ? "text-wine" : "text-slate"}`}>{kind}</td>
                  <td className={td}>{s.email}</td>
                  <td className={`${td} font-mono`}>
                    {s.sequenceKey}/{s.stepKey}
                  </td>
                  <td className={td}>{s.locale}</td>
                  <td className={`${td} whitespace-nowrap text-slate`}>
                    {s.scheduledFor.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className={td}>{s.existingStatus ?? "nothing yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* C23-REFERRAL §4 — top referrers: who is actually carrying the network.
          Same PLATFORM_ADMIN_EMAILS gate as the rest of this page (404 for
          everyone else, no new role). This is the ONE surface that pairs a code
          with its owner's name — Jacob's own screen, never a practitioner's. */}
      <section className="mt-12">
        <h2 className="font-headline text-2xl font-semibold text-ink-strong">Top referrers</h2>
        <p className="mt-1 text-[13px] text-slate">
          Across the whole ledger, not the filter above. Ordered by conversions, then by prospects
          referred.
        </p>
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="min-w-full border-collapse">
            <thead className="border-b border-line bg-blush/40">
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Owner</th>
                <th className={th}>Owner email</th>
                <th className={th}>Prospects referred</th>
                <th className={th}>Conversions</th>
              </tr>
            </thead>
            <tbody>
              {referrers.length === 0 && (
                <tr>
                  <td className={`${td} text-slate`} colSpan={5}>
                    No code has brought anyone in yet.
                  </td>
                </tr>
              )}
              {referrers.map((r) => (
                <tr key={r.code} className="border-b border-line/60 last:border-0">
                  <td className={`${td} font-mono`}>{r.code}</td>
                  <td className={`${td} font-medium text-ink-strong`}>{r.ownerName ?? "—"}</td>
                  <td className={td}>{r.ownerEmail ?? "—"}</td>
                  <td className={td}>{r.referred}</td>
                  <td className={td}>{r.conversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
