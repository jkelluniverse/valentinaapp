import { prisma } from "@/lib/prisma";
import { getModule } from "@/lib/modules/registry";
import { getReadingProvider } from "./index";
import { hashInputs, astrologyConfigured } from "./astrology-api";
import type { Prisma } from "@prisma/client";

// PLATFORM Phase 3 — the computed-module orchestrator. At intake completion
// (and on tick retry) it collects reading requests from the tenant's enabled
// COMPUTED modules, consults the cache (the Reading table keyed by
// inputsHash — Rule 0.6, the free tier is 50 calls/month), computes only
// misses, and parks failures as PENDING_RETRY. It never throws into its
// caller: intake completion must not block on a provider (spec §6).

export type ComputeResult = { computed: number; cached: number; failed: number; skipped: number };

type BirthProfileRow = {
  birthDate: Date | null;
  birthTime: string | null;
  birthTimeUnknown: boolean;
  birthLat: number | null;
  birthLng: number | null;
};

// Which reading kinds each computed module requests. Valentina's three
// structured-content panels deliberately request NOTHING (spec §5.1 — their
// computation is a separate decision with its own guardrails).
const MODULE_REQUESTS: Record<string, (p: BirthProfileRow) => { kind: string; needsTime: boolean }[]> = {
  "western-natal": () => [
    { kind: "natal-positions", needsTime: false }, // degrades to solar noon
    { kind: "natal-houses", needsTime: true }, // hidden without a real time
  ],
  "vedic-natal": () => [{ kind: "vedic-positions", needsTime: false }],
  numerology: () => [{ kind: "numerology-core", needsTime: false }],
};

function birthInputs(name: string, p: BirthProfileRow) {
  return {
    name,
    birthDate: p.birthDate!.toISOString().slice(0, 10),
    birthTime: p.birthTimeUnknown ? null : p.birthTime,
    lat: p.birthLat!,
    lng: p.birthLng!,
  };
}

export async function computeReadingsFor(tenantId: string, clientId: string): Promise<ComputeResult> {
  const result: ComputeResult = { computed: 0, cached: 0, failed: 0, skipped: 0 };

  const [rows, client, profile] = await Promise.all([
    prisma.tenantModule.findMany({ where: { tenantId, enabled: true }, select: { moduleKey: true } }),
    prisma.user.findFirst({ where: { id: clientId }, select: { name: true } }),
    prisma.clientProfile.findUnique({
      where: { userId: clientId },
      select: { birthDate: true, birthTime: true, birthTimeUnknown: true, birthLat: true, birthLng: true },
    }),
  ]);
  if (!profile?.birthDate || profile.birthLat == null || profile.birthLng == null) {
    result.skipped++;
    return result;
  }

  const provider = getReadingProvider();
  const hasTime = Boolean(profile.birthTime) && !profile.birthTimeUnknown;

  for (const row of rows) {
    const requests = MODULE_REQUESTS[row.moduleKey]?.(profile) ?? [];
    const def = getModule(row.moduleKey);
    if (!def || requests.length === 0) continue;

    for (const req of requests) {
      // Birth-time-unknown path: time-dependent kinds are not computed at
      // all — their panels hide (spec §5 intake builder).
      if (req.needsTime && !hasTime) {
        result.skipped++;
        continue;
      }
      if (!provider.supports(req.kind)) {
        result.skipped++;
        continue;
      }
      const inputs = birthInputs(client?.name ?? "Client", profile);
      const inputsHash = hashInputs(req.kind, inputs);

      const existing = await prisma.reading.findFirst({
        where: { clientId, kind: req.kind, inputsHash, status: "COMPLETE" },
        select: { id: true },
      });
      if (existing) {
        result.cached++;
        continue;
      }

      // No key and no mock override → park WITHOUT touching the network.
      // The tick recovers these the day the credential lands (env only —
      // nothing blocks on paperwork).
      if (!astrologyConfigured() && !process.env.ASTROLOGY_API_BASE_URL) {
        await prisma.reading
          .upsert({
            where: { tenantId_clientId_kind_inputsHash: { tenantId, clientId, kind: req.kind, inputsHash } },
            create: { tenantId, clientId, moduleKey: row.moduleKey, kind: req.kind, inputsHash, payload: {}, status: "PENDING_RETRY", computedAt: new Date() },
            update: {},
          })
          .catch(() => undefined);
        result.skipped++;
        continue;
      }

      try {
        const reading = await provider.compute({ kind: req.kind, inputs });
        await prisma.reading.upsert({
          where: { tenantId_clientId_kind_inputsHash: { tenantId, clientId, kind: req.kind, inputsHash } },
          create: {
            tenantId,
            clientId,
            moduleKey: row.moduleKey,
            kind: req.kind,
            inputsHash,
            payload: reading.payload as Prisma.InputJsonValue,
            raw: reading.raw as Prisma.InputJsonValue,
            status: "COMPLETE",
            computedAt: new Date(reading.computedAt),
          },
          update: {
            payload: reading.payload as Prisma.InputJsonValue,
            raw: reading.raw as Prisma.InputJsonValue,
            status: "COMPLETE",
            computedAt: new Date(reading.computedAt),
          },
        });
        result.computed++;
      } catch (e) {
        // Park it; the tick retries. Never block the caller (spec §6).
        await prisma.reading
          .upsert({
            where: { tenantId_clientId_kind_inputsHash: { tenantId, clientId, kind: req.kind, inputsHash } },
            create: {
              tenantId,
              clientId,
              moduleKey: row.moduleKey,
              kind: req.kind,
              inputsHash,
              payload: {},
              status: "PENDING_RETRY",
              computedAt: new Date(),
            },
            update: {}, // an existing COMPLETE row must never be downgraded
          })
          .catch(() => undefined);
        result.failed++;
        console.error(`[readings] ${req.kind} failed for client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  }
  return result;
}

// Tick retry — bounded sweep of parked readings; recompute wipes the park
// row on success (same upsert key).
export async function retryPendingReadings(limit = 10): Promise<{ retried: number; recovered: number }> {
  const pending = await prisma.reading.findMany({
    where: { status: "PENDING_RETRY" },
    take: limit,
    select: { tenantId: true, clientId: true },
    distinct: ["clientId"],
  });
  let recovered = 0;
  for (const p of pending) {
    if (!p.tenantId) continue;
    const r = await computeReadingsFor(p.tenantId, p.clientId).catch(() => null);
    if (r && r.computed > 0) recovered += r.computed;
  }
  return { retried: pending.length, recovered };
}
