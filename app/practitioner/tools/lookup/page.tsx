import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getReadingProvider } from "@/lib/readings";
import { parseLookupParams, lookupInputs, LOOKUP_KINDS } from "@/lib/tools/lookup";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { saveLookupToClient } from "./actions";

// PLATFORM Phase 4 — the research console (MANUAL_TOOL module): query
// positions for any date/place without leaving the app. GET-driven so the
// query lives in the URL; results render transiently — nothing persists
// unless "save to client" is used. (A refresh recomputes: this is an
// explicit practitioner research action, not an intake pipeline.)

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  "natal-positions": "Positions (tropical)",
  "natal-houses": "House cusps",
  "vedic-positions": "Positions (sidereal)",
  "numerology-core": "Core numbers",
};

export default async function LookupConsole({
  searchParams,
}: {
  searchParams: { kind?: string; date?: string; time?: string; lat?: string; lng?: string; saved?: string; error?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const row = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, moduleKey: "lookup-console", enabled: true },
  });
  if (!row) notFound();
  const label = ((row.settings ?? {}) as { displayLabel?: string }).displayLabel ?? "Lookup Console";

  const params = parseLookupParams(searchParams);
  let result: unknown = null;
  let failed = false;
  if (params) {
    result = await getReadingProvider()
      .compute({ kind: params.kind, inputs: lookupInputs(params) })
      .then((r) => r.payload)
      .catch(() => {
        failed = true;
        return null;
      });
  }
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
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
          Positions for any moment and place — research without leaving the app. Nothing is
          saved unless you save it to a client.
        </p>
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Saved to the client&apos;s record.</p>
      )}
      {(searchParams.error || failed) && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {failed ? "The provider didn't answer — try again in a moment." : "Check the inputs — date and coordinates are required."}
        </p>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          What
          <select name="kind" defaultValue={params?.kind ?? "natal-positions"} className={fieldCls}>
            {LOOKUP_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Date
          <input name="date" type="date" defaultValue={params?.date ?? ""} required className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Time
          <input name="time" type="time" defaultValue={params?.time ?? ""} className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Latitude
          <input name="lat" type="number" step="0.0001" defaultValue={params?.lat ?? ""} required className={`${fieldCls} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Longitude
          <input name="lng" type="number" step="0.0001" defaultValue={params?.lng ?? ""} required className={`${fieldCls} w-28`} />
        </label>
        <button className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
          Look up
        </button>
      </form>

      {result != null && (
        <div className="flex flex-col gap-4">
          <pre className="max-h-96 overflow-auto rounded-card border border-line bg-surface p-5 text-[13px] leading-relaxed text-ink shadow-card">
            {JSON.stringify(result, null, 2)}
          </pre>
          <form action={saveLookupToClient} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="kind" value={params!.kind} />
            <input type="hidden" name="date" value={params!.date} />
            <input type="hidden" name="time" value={params!.time ?? ""} />
            <input type="hidden" name="lat" value={String(params!.lat)} />
            <input type="hidden" name="lng" value={String(params!.lng)} />
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Save to client
              <select name="clientId" required className={fieldCls}>
                <option value="">Choose…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email}
                  </option>
                ))}
              </select>
            </label>
            <PendingButton className="rounded-md border border-line px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
              Save to record
            </PendingButton>
          </form>
        </div>
      )}
    </div>
  );
}
