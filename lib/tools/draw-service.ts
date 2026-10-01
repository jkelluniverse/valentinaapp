import { prisma } from "@/lib/prisma";
import { drawCards, SPREADS } from "./tarot";
import type { Prisma } from "@prisma/client";

// Phase 4 — the draw, as a service (the server action is a thin shell).
// Every draw is a NEW dated reading: inputsHash carries the unique draw id,
// so draws are never cache-deduped (they are events, not derivations).

export async function recordDraw(args: {
  tenantId: string;
  clientId: string;
  spread: string;
  sessionId?: string | null;
}): Promise<{ ok: true; readingId: string } | { ok: false; error: "module" | "input" }> {
  const enabled = await prisma.tenantModule.findFirst({
    where: { tenantId: args.tenantId, moduleKey: "tarot-draw", enabled: true },
    select: { id: true },
  });
  if (!enabled) return { ok: false, error: "module" };
  const client = await prisma.user.findFirst({ where: { id: args.clientId, role: "CLIENT" }, select: { id: true } });
  if (!client || !(args.spread in SPREADS)) return { ok: false, error: "input" };

  const draw = drawCards(args.spread);
  const reading = await prisma.reading.create({
    data: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      sessionId: args.sessionId ?? null,
      moduleKey: "tarot-draw",
      kind: "tarot-draw",
      inputsHash: draw.drawId,
      payload: draw as unknown as Prisma.InputJsonValue,
      status: "COMPLETE",
      computedAt: new Date(),
    },
  });
  return { ok: true, readingId: reading.id };
}
