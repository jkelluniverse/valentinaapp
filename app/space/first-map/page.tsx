import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { CRISIS_RESOURCES } from "@/lib/message-safety";
import { FirstMap } from "./FirstMap";

export const dynamic = "force-dynamic";

// C16.5 — "Your First Map". The client's own naming of their inner landscape:
// warm prompts one at a time, each named thing a star they place themselves.
// Theirs to see and revisit, always — they made it.
export default async function FirstMapPage() {
  const user = await requireClient();

  // Scoped hard: ONLY their own self-reported stars (from the First Map AND
  // from answered deepening doors, C17). The AI constellation has no client
  // route — these queries cannot reach it by construction.
  const [profile, stars] = await Promise.all([
    prisma.clientProfile.findUnique({
      where: { userId: user.id },
      select: { firstMapCompletedAt: true },
    }),
    prisma.psycheNode.findMany({
      where: { clientId: user.id, source: "SELF_REPORTED", state: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, kind: true, promptKey: true, selfX: true, selfY: true },
    }),
  ]);
  const starIds = new Set(stars.map((s) => s.id));
  // Their own hand-drawn connections only.
  const connections = (
    await prisma.psycheEdge.findMany({
      where: { clientId: user.id, relation: "CONNECTED" },
      select: { id: true, fromId: true, toId: true },
    })
  ).filter((e) => starIds.has(e.fromId) && starIds.has(e.toId));

  const done = Boolean(profile?.firstMapCompletedAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your map</Eyebrow>
        <h1 className="font-headline text-[2.125rem] font-medium text-ink-strong">
          {done ? "Your inner landscape" : "What you already know"}
        </h1>
        <SignatureRule />
        <p className="max-w-prose text-[15px] text-slate">
          {done
            ? "This is your living map — every star is something you named. Add to it whenever something new asks to be seen, drag the stars as your sense of them shifts, and draw a line between any two that feel connected. It's yours."
            : "Before any chart or conversation, you already carry a map of yourself. This is a place to lay it out — a few gentle questions, and a sky to place your answers in. Nothing here is a test, and nothing is required to be ready."}
        </p>
      </div>

      <FirstMap
        initialStars={stars.map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          promptKey: s.promptKey,
          x: s.selfX ?? 0.5,
          y: s.selfY ?? 0.5,
        }))}
        initialConnections={connections.map((c) => ({ id: c.id, from: c.fromId, to: c.toId }))}
        completed={done}
        crisisResources={CRISIS_RESOURCES}
      />
    </div>
  );
}
