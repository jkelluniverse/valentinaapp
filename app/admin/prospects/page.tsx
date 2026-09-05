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
  searchParams: { status?: string; source?: string; q?: string };
}) {
  const user = await requirePractitioner();
  if (!isPlatformAdmin(user.email)) notFound();

  const filter = normalizeFilter(searchParams);
  const [rows, counts, sources] = await Promise.all([
    listProspects(filter),
    prospectCounts(filter),
    prospectSources(),
  ]);

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
              <th className={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className={`${td} text-slate`} colSpan={11}>
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
                <td className={`${td} whitespace-nowrap text-slate`}>
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
