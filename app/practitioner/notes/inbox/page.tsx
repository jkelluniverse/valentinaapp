import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";

// C14-REMARKABLE R.5 — the Margins inbox: handwritten pages and processed
// recordings waiting for the 10-second review. Two taps + ten seconds.

export const dynamic = "force-dynamic";

export default async function MarginsInbox({
  searchParams,
}: {
  searchParams: { applied?: string; crisis?: string };
}) {
  await requirePractitioner();
  const [handwritten, recordings, clients] = await Promise.all([
    prisma.handwrittenNote.findMany({
      where: { status: "DRAFT" },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.recordingDraft.findMany({
      where: { status: "DRAFT" },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "CLIENT" }, select: { id: true, name: true, email: true } }),
  ]);
  const nameOf = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "—") : null;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Margins inbox"
        eyebrow="The Margins"
        lede="Session notes from your reMarkable and processed recordings — a glance, a fix if needed, one Apply."
      />
      <p className="text-[13px] text-whisper">
        Have a session recording on your phone or Pocket?{" "}
        <Link href="/practitioner/captures" className="font-medium text-wine underline-offset-4 hover:underline">
          Upload it here
        </Link>{" "}
        — the draft lands in this inbox.
      </p>

      {searchParams.applied === "note" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Applied — it&apos;s in the Margins, and the map is reading it now.
        </p>
      )}
      {searchParams.applied === "recording" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Applied — the session record is kept, and the map is reading their words now.
        </p>
      )}
      {searchParams.crisis === "1" && (
        <p className="rounded-md border-2 border-rose bg-white px-4 py-3 text-sm text-ink">
          The transcript held something heavy — please review it directly and consider whether more
          than coaching is needed.
        </p>
      )}

      {handwritten.length === 0 && recordings.length === 0 && (
        <div className="rounded-card border border-line bg-surface p-7 shadow-soft">
          <p className="max-w-prose text-ink">Nothing waiting — beautifully.</p>
          <p className="mt-2 max-w-prose text-[13px] text-slate">
            From your reMarkable: Share → Email to your private notes address (two taps). It lands
            here transcribed, matched, and ready. Applying a note also lets the map read your
            session notes as evidence — your hand, tappable from any node.
          </p>
        </div>
      )}

      {handwritten.map((h) => (
        <Link
          key={h.id}
          href={`/practitioner/notes/inbox/${h.id}`}
          className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-5 py-4 shadow-soft transition-colors hover:border-mocha"
        >
          <span className="rounded-full bg-blush-deep px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-wine">
            handwritten
          </span>
          <span className="font-medium text-ink-strong">
            {h.subject || "Session note"}
          </span>
          <span className="text-[13px] text-slate">
            {h.transcript ? `${h.transcript.slice(0, 80)}…` : "transcribing…"}
          </span>
          <span className="ml-auto text-[12.5px] text-whisper">
            {nameOf(h.matchedClientId) ? `→ ${nameOf(h.matchedClientId)}` : "unmatched"} · {fmt(h.receivedAt)}
          </span>
        </Link>
      ))}

      {recordings.map((r) => (
        <Link
          key={r.id}
          href={`/practitioner/notes/inbox/rec/${r.id}`}
          className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-5 py-4 shadow-soft transition-colors hover:border-mocha"
        >
          <span className="rounded-full border border-mocha px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-mocha">
            recording
          </span>
          <span className="font-medium text-ink-strong">Session recording</span>
          <span className="ml-auto text-[12.5px] text-whisper">
            {nameOf(r.matchedClientId) ? `→ ${nameOf(r.matchedClientId)}` : "unmatched"} · {fmt(r.receivedAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}
