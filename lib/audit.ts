import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// AMD-06 §3 — the audit spine. Append-only, attributable, metadata ONLY:
// action slugs, ids, and short reasons — never content (note bodies, answers,
// passwords, tokens, card data). Failures never break the action being
// audited; they log and move on.

export async function audit(args: {
  actorId: string;
  onBehalfOfId?: string | null;
  action: string;
  reason?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: args.actorId,
        onBehalfOfId: args.onBehalfOfId ?? null,
        action: args.action,
        reason: args.reason?.slice(0, 300) ?? null,
        meta: (args.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    console.info(
      `[audit] ${args.action} actor=${args.actorId}${args.onBehalfOfId ? ` for=${args.onBehalfOfId}` : ""}`,
    );
  } catch (e) {
    console.error(`[audit] write failed action=${args.action}`, e instanceof Error ? e.message : "");
  }
}
