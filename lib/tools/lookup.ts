// Phase 4 — shared vocabulary for the research console (page + action).

export const LOOKUP_KINDS = ["natal-positions", "natal-houses", "vedic-positions", "numerology-core"] as const;

export type LookupParams = { kind: string; date: string; time: string | null; lat: number; lng: number };

export function parseLookupParams(p: { kind?: string; date?: string; time?: string; lat?: string; lng?: string }): LookupParams | null {
  const kind = p.kind ?? "";
  const date = p.date ?? "";
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!(LOOKUP_KINDS as readonly string[]).includes(kind)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { kind, date, time: p.time || null, lat, lng };
}

export const lookupInputs = (p: LookupParams) => ({
  name: "Lookup",
  birthDate: p.date,
  birthTime: p.time,
  lat: p.lat,
  lng: p.lng,
});

// "Save to client" as a service (the action is a thin shell). Deduped by
// inputsHash against the Reading cache — an already-saved identical lookup
// costs zero provider calls.
export async function saveLookup(args: {
  tenantId: string;
  clientId: string;
  params: LookupParams;
}): Promise<{ ok: true; cached: boolean } | { ok: false; error: "module" | "input" | "provider" }> {
  const { prisma } = await import("@/lib/prisma");
  const enabled = await prisma.tenantModule.findFirst({
    where: { tenantId: args.tenantId, moduleKey: "lookup-console", enabled: true },
    select: { id: true },
  });
  if (!enabled) return { ok: false, error: "module" };
  const client = await prisma.user.findFirst({ where: { id: args.clientId, role: "CLIENT" }, select: { id: true } });
  if (!client) return { ok: false, error: "input" };

  const { hashInputs } = await import("@/lib/readings/astrology-api");
  const { getReadingProvider } = await import("@/lib/readings");
  const inputs = lookupInputs(args.params);
  const inputsHash = hashInputs(args.params.kind, inputs);
  const existing = await prisma.reading.findFirst({
    where: { clientId: args.clientId, kind: args.params.kind, inputsHash, status: "COMPLETE" },
    select: { id: true },
  });
  if (existing) return { ok: true, cached: true };

  const result = await getReadingProvider()
    .compute({ kind: args.params.kind, inputs })
    .catch(() => null);
  if (!result) return { ok: false, error: "provider" };
  await prisma.reading.upsert({
    where: { tenantId_clientId_kind_inputsHash: { tenantId: args.tenantId, clientId: args.clientId, kind: args.params.kind, inputsHash } },
    create: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      moduleKey: "lookup-console",
      kind: args.params.kind,
      inputsHash,
      payload: result.payload as never,
      raw: result.raw as never,
      status: "COMPLETE",
      computedAt: new Date(),
    },
    update: {},
  });
  return { ok: true, cached: false };
}
