import { prisma } from "@/lib/prisma";

// CLIENT-ONBOARDING §6 — the quiet discovery layer. Philosophy: the
// interface teaches at the moment of relevance, once, and then shuts up.
// Three mechanisms, strictly bounded: teaching empty states (in the
// surfaces), one-at-a-time contextual hints, one getting-started card.
// (Not to be confused with lib/discovery.ts — the C18 discovery-CALL funnel.)
//
// ACTIVATION GATE: only clients onboarded through the intake ENGINE (a
// COMPLETE INITIAL IntakeFlow exists). Existing clients — everyone invited
// before the engine shipped, including every fixture client — never see any
// of it, so the baselined screens are untouched by construction (Rule 0.1).

export async function discoveryActive(clientId: string): Promise<boolean> {
  const flow = await prisma.intakeFlow
    .findFirst({ where: { clientId, purpose: "INITIAL", status: "COMPLETE" }, select: { id: true } })
    .catch(() => null);
  return Boolean(flow);
}

// §6.2 — the hint catalog. HARD RULES enforced by shape: ≤ 6 per layout, one
// anchor each, no "Next" (a chain is a tour wearing a disguise), plain
// sentences. Copy is platform-neutral; modality words come from tenant data.
// (Messages needs no hint: the thread's permanent topNote — away note /
// response rhythm — already teaches in place, §6.1 style, and the thread is a
// full-screen overlay on mobile where a callout above it would never be seen.)
export type Hint = { key: string; surface: "home" | "design" | "journey"; text: string };

export const HINTS: readonly Hint[] = [
  { key: "home-reflect", surface: "home", text: "The star in the middle of the bottom bar is yours — a private reflection, any time, any length." },
  { key: "home-you", surface: "home", text: "Everything about you — your map, your settings, your story so far — lives under the You tab." },
  { key: "design-panels", surface: "design", text: "These panels grow richer over time — worth returning to after sessions." },
  { key: "journey-thread", surface: "journey", text: "This is your story so far — everything you and your practitioner have kept, in one thread." },
] as const;

// Pick the ONE hint for this surface: the first not-yet-DISMISSED candidate.
// It appears from the first visit and stays until its × is tapped — dismiss
// sets DISMISSED, never again (a hint that vanished because a render the
// client never looked at "consumed" it would make the × meaningless). SEEN
// records the first render, so "has this surface been visited" is knowable.
// Max one visible at a time holds because each surface asks once per view
// and only the first candidate is returned.
export async function pickHint(clientId: string, surface: Hint["surface"]): Promise<Hint | null> {
  if (!(await discoveryActive(clientId))) return null;
  const candidates = HINTS.filter((h) => h.surface === surface);
  if (candidates.length === 0) return null;
  const states = await prisma.clientHintState.findMany({
    where: { clientId, hintKey: { in: candidates.map((h) => h.key) } },
    select: { hintKey: true, status: true },
  });
  const byKey = new Map(states.map((s) => [s.hintKey, s.status]));
  const hint = candidates.find((h) => byKey.get(h.key) !== "DISMISSED");
  if (!hint) return null;
  if (!byKey.has(hint.key)) {
    await prisma.clientHintState
      .upsert({
        where: { clientId_hintKey: { clientId, hintKey: hint.key } },
        create: { clientId, hintKey: hint.key, status: "SEEN" },
        update: {},
      })
      .catch(() => undefined);
  }
  return hint;
}

// §6.3 — the getting-started card: 3–5 items that check themselves off from
// real behavior. Dismissible as a whole; auto-disappears forever once every
// item is done. State rides one ClientHintState row (key "getting-started").
const CARD_KEY = "getting-started";

export type StartItem = { key: string; label: string; href: string; done: boolean };

export async function gettingStarted(clientId: string): Promise<StartItem[] | null> {
  if (!(await discoveryActive(clientId))) return null;
  const state = await prisma.clientHintState
    .findFirst({ where: { clientId, hintKey: CARD_KEY }, select: { status: true } })
    .catch(() => null);
  if (state?.status === "DISMISSED") return null;

  const [reflections, firstMap, messages, appointments, designVisited] = await Promise.all([
    prisma.logEntry.count({ where: { clientId } }),
    prisma.clientProfile.findUnique({ where: { userId: clientId }, select: { firstMapCompletedAt: true } }),
    prisma.message.count({ where: { conversation: { clientId }, senderRole: "CLIENT" } }),
    prisma.appointment.count({ where: { clientId, kind: "SESSION" } }),
    // "Look at your map" checks off once the design surface has been visited
    // (its hint row exists — SEEN or DISMISSED both count as a visit).
    prisma.clientHintState.findFirst({ where: { clientId, hintKey: "design-panels" }, select: { id: true } }),
  ]);
  const items: StartItem[] = [
    { key: "reflect", label: "Keep your first reflection", href: "/space/new", done: reflections > 0 },
    { key: "first-map", label: "Make Your First Map", href: "/space/first-map", done: Boolean(firstMap?.firstMapCompletedAt) },
    { key: "design", label: "Look at your map", href: "/space/design", done: Boolean(designVisited) },
    { key: "message", label: "Say hello in the Open Line", href: "/space/messages", done: messages > 0 },
    { key: "session", label: "Have your first session", href: "/space/schedule", done: appointments > 0 },
  ];

  // Complete → disappear forever (never reappears, never nags).
  if (items.every((i) => i.done)) {
    await prisma.clientHintState
      .upsert({
        where: { clientId_hintKey: { clientId, hintKey: CARD_KEY } },
        create: { clientId, hintKey: CARD_KEY, status: "DISMISSED" },
        update: { status: "DISMISSED" },
      })
      .catch(() => undefined);
    return null;
  }
  return items;
}

export async function dismissHintFor(clientId: string, hintKey: string): Promise<void> {
  await prisma.clientHintState.upsert({
    where: { clientId_hintKey: { clientId, hintKey } },
    create: { clientId, hintKey, status: "DISMISSED" },
    update: { status: "DISMISSED" },
  });
}
