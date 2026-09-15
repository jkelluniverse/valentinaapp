import { rawPrisma } from "@/lib/prisma-internal";
import type { PrismaClient } from "@prisma/client";
import { sealIfComplete } from "./seal";

// C20 — the tick's agreements sweep. Cross-tenant by nature (every
// tenant's agreements age at once), so this file uses the raw client
// deliberately (allowlisted): the gentle reminder cadence + a seal sweep
// for anything signed-and-complete that missed sealing inline.

export async function agreementsTick(now = new Date()): Promise<{ reminded: number; sealed: number }> {
  const cutoff = new Date(now.getTime() - 3 * 86400_000);
  const stale = await rawPrisma.agreement.findMany({
    where: { status: { in: ["SENT", "VIEWED"] }, sentAt: { lt: cutoff }, remindedAt: null },
    take: 20,
  });
  for (const a of stale) {
    await rawPrisma.agreement.update({ where: { id: a.id }, data: { remindedAt: now } });
    await rawPrisma.agreementEvent
      .create({ data: { tenantId: a.tenantId, agreementId: a.id, kind: "reminded", actor: "system" } })
      .catch(() => undefined);
  }

  const unsealed = await rawPrisma.agreement.findMany({
    where: { status: "SIGNED", sealedKey: null },
    select: { id: true },
    take: 10,
  });
  let sealed = 0;
  for (const u of unsealed) {
    const s = await sealIfComplete(u.id, rawPrisma as unknown as PrismaClient).catch(() => null);
    if (s?.sealed) sealed++;
  }
  return { reminded: stale.length, sealed };
}
