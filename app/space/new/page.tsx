import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { CRISIS_RESOURCES } from "@/lib/message-safety";
import { ReflectionPortal } from "../ReflectionPortal";

export const dynamic = "force-dynamic";

// A2 + C17 — the Reflection Portal. Recent reflections seed the "river of
// stones" the new one settles into (D); after closure, the Deepening may offer
// one gentle door (the crisis resources ride along for the safety path).
export default async function NewReflection() {
  const user = await requireClient();

  const recent = await prisma.logEntry.findMany({
    where: { clientId: user.id },
    orderBy: { occurredAt: "desc" },
    take: 7,
    select: { mood: true },
  });

  return (
    <ReflectionPortal recentMoods={recent.map((r) => r.mood)} crisisResources={CRISIS_RESOURCES} />
  );
}
