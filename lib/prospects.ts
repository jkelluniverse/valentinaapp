import { prisma } from "@/lib/prisma";
import type { ProspectStatus } from "@prisma/client";

// C23-CAPTURE §3 — the query layer behind /admin/prospects. The page and the
// CSV route share it so the export is ALWAYS the current filter and cannot
// drift from what is on screen.
//
// `PractitionerProspect` is platform-level (outside SCOPED_MODEL_SET), so the
// scoped client passes these calls through; the surface is gated by the
// PLATFORM_ADMIN_EMAILS allowlist instead.

// The schema's enum, in full — no status is invented here.
export const PROSPECT_STATUSES: readonly ProspectStatus[] = ["LEAD", "SIGNED_UP", "DECLINED"];

export type ProspectFilter = { status?: string; source?: string; q?: string };

export type ProspectRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  practiceName: string | null;
  note: string | null;
  status: ProspectStatus;
  source: string | null;
  referredByCode: string | null;
  referralCode: string;
  tenantId: string | null;
  tenantSlug: string | null;
  createdAt: Date;
};

export function normalizeFilter(raw: ProspectFilter): ProspectFilter {
  const status = (raw.status ?? "").trim();
  return {
    status: PROSPECT_STATUSES.includes(status as ProspectStatus) ? status : undefined,
    source: (raw.source ?? "").trim().slice(0, 120) || undefined,
    q: (raw.q ?? "").trim().slice(0, 200) || undefined,
  };
}

function where(f: ProspectFilter) {
  return {
    ...(f.status ? { status: f.status as ProspectStatus } : {}),
    ...(f.source ? { source: f.source } : {}),
    // Searchable by email (§3). Case-insensitive because nobody at an event
    // types the capitals they signed up with.
    ...(f.q ? { email: { contains: f.q.toLowerCase(), mode: "insensitive" as const } } : {}),
  };
}

export async function listProspects(f: ProspectFilter): Promise<ProspectRow[]> {
  const rows = await prisma.practitionerProspect.findMany({
    where: where(f),
    orderBy: { createdAt: "desc" }, // newest first (§3)
  });
  const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((v): v is string => Boolean(v)))];
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, slug: true } })
    : [];
  const slugOf = new Map(tenants.map((t) => [t.id, t.slug]));
  return rows.map((r) => ({ ...r, tenantSlug: r.tenantId ? slugOf.get(r.tenantId) ?? null : null }));
}

/** Counts over the CURRENT filter, so the page answers "how many did we get"
 *  without arithmetic — by status and by source. */
export async function prospectCounts(f: ProspectFilter): Promise<{
  total: number;
  byStatus: { key: string; count: number }[];
  bySource: { key: string; count: number }[];
}> {
  const [byStatus, bySource, total] = await Promise.all([
    prisma.practitionerProspect.groupBy({ by: ["status"], where: where(f), _count: { _all: true } }),
    prisma.practitionerProspect.groupBy({ by: ["source"], where: where(f), _count: { _all: true } }),
    prisma.practitionerProspect.count({ where: where(f) }),
  ]);
  return {
    total,
    byStatus: byStatus
      .map((r) => ({ key: String(r.status), count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    bySource: bySource
      .map((r) => ({ key: r.source ?? "(none)", count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Every distinct source currently in the ledger — the filter's own options,
 *  so a new `?src=` from the floor shows up without a code change. */
export async function prospectSources(): Promise<string[]> {
  const rows = await prisma.practitionerProspect.groupBy({ by: ["source"] });
  return rows
    .map((r) => r.source)
    .filter((v): v is string => Boolean(v))
    .sort();
}

export const CSV_HEADERS = [
  "name",
  "email",
  "phone",
  "practiceName",
  "note",
  "status",
  "source",
  "referredByCode",
  "referralCode",
  "tenantSlug",
  "createdAt",
] as const;

// RFC 4180 quoting: every field is quoted and inner quotes doubled, so commas,
// quotes, newlines and non-ASCII names survive the round trip unharmed.
function cell(v: string | null | undefined): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function prospectsCsv(rows: ProspectRow[]): string {
  const lines = [CSV_HEADERS.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        cell(r.name),
        cell(r.email),
        cell(r.phone),
        cell(r.practiceName),
        cell(r.note),
        cell(r.status),
        cell(r.source),
        cell(r.referredByCode),
        cell(r.referralCode),
        cell(r.tenantSlug),
        cell(r.createdAt.toISOString()),
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
