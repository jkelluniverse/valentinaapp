import { prisma } from "@/lib/prisma";

// Site-wide practitioner search (C8 §5, widened): one query sweeps every
// store in the app and returns grouped, linkable hits. The most privileged
// surface here — practitioner-only, server-side, snippets not full dumps, and
// the search term or any matched content is NEVER logged.
//
// Full fidelity matters: record snapshots truncate at 280 chars, so client
// words are searched in their SOURCE rows (LogEntry, PromptResponse) — the
// snapshot query only covers kinds whose sources aren't directly searchable.

const SNIPPET = 180;

export function searchSnippet(text: string | null, term: string): string | null {
  if (!text) return null;
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return text.length > SNIPPET ? `${text.slice(0, SNIPPET).trimEnd()}…` : text;
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + term.length + 120);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export type SearchHit = {
  href: string;
  label: string; // main line
  kind?: string; // small pill text
  meta?: string; // right-side context (client, date)
  snippet?: string | null;
};

export type SearchGroup = { title: string; hits: SearchHit[] };

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function searchEverything(q: string): Promise<SearchGroup[]> {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const tag = term.toLowerCase();

  const [
    clients,
    entries,
    responses,
    recordItems,
    notes,
    prompts,
    worksheets,
    courses,
    lessons,
    preps,
    appointments,
    charges,
    invites,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT", OR: [{ name: ci(term) }, { email: ci(term) }] },
      select: { id: true, name: true, email: true, active: true },
      take: 10,
    }),
    // Client words, full fidelity (C2).
    prisma.logEntry.findMany({
      where: { OR: [{ body: ci(term) }, { trigger: ci(term) }, { tags: { has: tag } }] },
      orderBy: { occurredAt: "desc" },
      take: 25,
    }),
    // Prompt responses, full fidelity (C3).
    prisma.promptResponse.findMany({
      where: { body: ci(term) },
      orderBy: { completedAt: "desc" },
      include: { assignment: { select: { clientId: true, prompt: { select: { title: true } } } } },
      take: 20,
    }),
    // Snapshot record kinds whose sources aren't directly text-searchable
    // (worksheet digests, course activity, stage/journey notes).
    prisma.recordItem.findMany({
      where: {
        kind: { in: ["WORKSHEET_RESPONSE", "COURSE_ACTIVITY", "NOTE"] },
        OR: [{ summary: ci(term) }, { title: ci(term) }, { tags: { has: tag } }],
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
    // Her private margins (C14) — practitioner-only surface, so safe to include.
    prisma.note.findMany({
      where: { OR: [{ title: ci(term) }, { body: ci(term) }, { tags: { has: tag } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // Library (C3): prompts / exercises / check-ins, active or archived.
    prisma.prompt.findMany({
      where: { OR: [{ title: ci(term) }, { body: ci(term) }] },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    // Worksheets (C9).
    prisma.worksheet.findMany({
      where: { OR: [{ title: ci(term) }, { intro: ci(term) }, { sourceNote: ci(term) }] },
      orderBy: { updatedAt: "desc" },
      take: 15,
    }),
    // Courses (C6).
    prisma.course.findMany({
      where: { OR: [{ title: ci(term) }, { description: ci(term) }] },
      select: { id: true, title: true, description: true, status: true },
      take: 10,
    }),
    // Lessons by title, linked into their course builder.
    prisma.lesson.findMany({
      where: { title: ci(term) },
      include: { chapter: { select: { courseId: true, course: { select: { title: true } } } } },
      take: 15,
    }),
    // Session preps — her annotations only (the AI output stays unsearched).
    prisma.sessionPrep.findMany({
      where: { practitionerNotes: ci(term) },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientId: true, createdAt: true, practitionerNotes: true },
      take: 10,
    }),
    // Sessions — the client's stated topic (C10).
    prisma.appointment.findMany({
      where: { clientNote: ci(term) },
      orderBy: { startAt: "desc" },
      take: 10,
    }),
    // Billing — charge descriptions (C13).
    prisma.charge.findMany({
      where: { description: ci(term) },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Waiting invites (C1).
    prisma.invite.findMany({
      where: { status: "PENDING", OR: [{ name: ci(term) }, { email: ci(term) }] },
      select: { id: true, name: true, email: true, createdAt: true },
      take: 10,
    }),
  ]);

  // One name lookup for every client id any hit references.
  const clientIds = new Set<string>();
  for (const e of entries) clientIds.add(e.clientId);
  for (const r of responses) clientIds.add(r.assignment.clientId);
  for (const i of recordItems) clientIds.add(i.clientId);
  for (const n of notes) if (n.clientId) clientIds.add(n.clientId);
  for (const p of preps) clientIds.add(p.clientId);
  for (const a of appointments) clientIds.add(a.clientId);
  for (const c of charges) clientIds.add(c.clientId);
  const names = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...clientIds] } },
        select: { id: true, name: true, email: true },
      })
    ).map((c) => [c.id, c.name || c.email]),
  );
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "Client" : "unfiled");
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);

  const groups: SearchGroup[] = [
    {
      title: "Clients",
      hits: clients.map((c) => ({
        href: `/practitioner/clients/${c.id}`,
        label: c.name || c.email,
        meta: `${c.email}${c.active ? "" : " · inactive"}`,
      })),
    },
    {
      title: "In their words",
      hits: [
        ...entries.map((e) => ({
          href: `/practitioner/clients/${e.clientId}?tab=record`,
          label: nameOf(e.clientId),
          kind: "reflection",
          meta: day(e.occurredAt),
          snippet: searchSnippet(e.body, term) ?? searchSnippet(e.trigger, term),
        })),
        ...responses.map((r) => ({
          href: `/practitioner/clients/${r.assignment.clientId}?tab=between`,
          label: nameOf(r.assignment.clientId),
          kind: "response",
          meta: `${r.assignment.prompt.title} · ${day(r.completedAt)}`,
          snippet: searchSnippet(r.body, term),
        })),
        ...recordItems.map((i) => ({
          href: `/practitioner/clients/${i.clientId}?tab=record`,
          label: nameOf(i.clientId),
          kind: i.kind === "WORKSHEET_RESPONSE" ? "worksheet" : i.kind === "COURSE_ACTIVITY" ? "course" : "journey note",
          meta: `${i.title ?? ""} · ${day(i.occurredAt)}`,
          snippet: searchSnippet(i.summary, term),
        })),
      ],
    },
    {
      title: "Your notes (the Margins)",
      hits: notes.map((n) => ({
        href: `/practitioner/notes/${n.id}`,
        label: n.title || searchSnippet(n.body, term) || "Untitled",
        kind: n.depth === "JOT" ? "jot" : "note",
        meta: `${nameOf(n.clientId)} · ${day(n.createdAt)}${n.status === "ARCHIVED" ? " · archived" : ""}`,
        snippet: n.title ? searchSnippet(n.body, term) : null,
      })),
    },
    {
      title: "Library",
      hits: prompts.map((p) => ({
        href: `/practitioner/library/${p.id}`,
        label: p.title,
        kind: p.kind.toLowerCase().replace("_", "-"),
        meta: p.active ? undefined : "archived",
        snippet: searchSnippet(p.body, term),
      })),
    },
    {
      title: "Worksheets",
      hits: worksheets.map((w) => ({
        href: `/practitioner/worksheets/${w.id}`,
        label: w.title,
        kind: "worksheet",
        meta: w.active ? undefined : "archived",
        snippet: searchSnippet(w.intro, term),
      })),
    },
    {
      title: "Courses & lessons",
      hits: [
        ...courses.map((c) => ({
          href: `/practitioner/courses/${c.id}`,
          label: c.title,
          kind: "course",
          meta: c.status === "PUBLISHED" ? "published" : "draft",
          snippet: searchSnippet(c.description, term),
        })),
        ...lessons.map((l) => ({
          href: `/practitioner/courses/${l.chapter.courseId}/lessons/${l.id}`,
          label: l.title,
          kind: "lesson",
          meta: `in ${l.chapter.course.title}`,
        })),
      ],
    },
    {
      title: "Session preps (your annotations)",
      hits: preps.map((p) => ({
        href: `/practitioner/clients/${p.clientId}/prep?prep=${p.id}`,
        label: nameOf(p.clientId),
        kind: "prep",
        meta: day(p.createdAt),
        snippet: searchSnippet(p.practitionerNotes, term),
      })),
    },
    {
      title: "Sessions",
      hits: appointments.map((a) => ({
        href: `/practitioner/clients/${a.clientId}`,
        label: nameOf(a.clientId),
        kind: "session topic",
        meta: day(a.startAt),
        snippet: searchSnippet(a.clientNote, term),
      })),
    },
    {
      title: "Billing",
      hits: charges.map((c) => ({
        href: `/practitioner/clients/${c.clientId}?tab=billing`,
        label: nameOf(c.clientId),
        kind: "charge",
        meta: `${c.description} · ${c.status.toLowerCase()} · ${day(c.createdAt)}`,
      })),
    },
    {
      title: "Waiting invites",
      hits: invites.map((i) => ({
        href: "/practitioner/clients",
        label: i.name || i.email,
        kind: "invite",
        meta: `invited ${day(i.createdAt)}`,
      })),
    },
  ];

  return groups.filter((g) => g.hits.length > 0);
}
