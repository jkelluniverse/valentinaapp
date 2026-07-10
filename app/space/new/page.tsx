import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { ReflectionPortal } from "../ReflectionPortal";
import { createEntry } from "../actions";

export const dynamic = "force-dynamic";

// A2 — the Reflection Portal. Recent reflections seed the "river of stones" the
// new one settles into (D).
export default async function NewReflection() {
  const user = await requireClient();

  const recent = await prisma.logEntry.findMany({
    where: { clientId: user.id },
    orderBy: { occurredAt: "desc" },
    take: 7,
    select: { mood: true },
  });

  return <ReflectionPortal action={createEntry} recentMoods={recent.map((r) => r.mood)} />;
}
