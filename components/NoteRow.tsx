import Link from "next/link";
import type { Note } from "@prisma/client";
import { noteSnippet } from "@/lib/notes";
import { formatTime } from "@/components/entries";

// A hairline note row (UI-PRACTITIONER-DESIGN). Jots and notes interleave; a
// session-linked note wears a small ring; the depth shows as a quiet mark.
export function NoteRow({
  note,
  clientName,
  showClient = false,
}: {
  note: Note;
  clientName?: string | null;
  showClient?: boolean;
}) {
  return (
    <Link
      href={`/practitioner/notes/${note.id}`}
      className="flex flex-col gap-1 border-b border-line py-3 transition-colors hover:text-wine"
    >
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-whisper">
        <span aria-hidden title={note.depth === "JOT" ? "jot" : "note"}>
          {note.depth === "JOT" ? "·" : "◆"}
        </span>
        {note.appointmentId && (
          <span aria-hidden title="linked to a session" className="text-mocha">
            ◦
          </span>
        )}
        <span>{formatTime(note.createdAt)}</span>
        {showClient && (
          <span className="text-mocha">{clientName ?? "unfiled"}</span>
        )}
        {note.status === "ELABORATED" && <span>· became an assignment</span>}
      </div>
      <p className="text-[15px] text-ink">
        {note.title && <span className="font-medium text-ink-strong">{note.title} — </span>}
        {noteSnippet(note.title ? { title: null, body: note.body } : note)}
      </p>
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((t) => (
            <span key={t} className="rounded-pill bg-cream px-2 py-0.5 text-xs text-slate">
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
