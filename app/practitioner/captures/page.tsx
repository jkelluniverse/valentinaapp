import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { startUploadCapture } from "@/lib/capture";
import { firstNameOf } from "@/lib/name";

// SESSION-PIPELINE Door B — upload a session recording, watch the draft
// write itself. This is the Pocket door too: Pocket, Plaud, Voice Memos,
// Zoom locals all export standard audio files; we integrate with every
// recorder by integrating with none of them specifically. Consent is
// checked server-side before anything moves (hard stop).

export const dynamic = "force-dynamic";

const STATUS_LINE: Record<string, string> = {
  TRANSCRIBING: "Transcribing — usually a few minutes.",
  EXTRACTING: "Drafting the session record…",
  REVIEW: "Ready for your review.",
  MERGED: "Merged into their record.",
  DISCARDED: "Discarded.",
  ERROR: "Something went wrong — retry below.",
};

export default async function CapturesPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await requirePractitioner();

  const [clients, captures] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.sessionCapture.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const nameOf = new Map(clients.map((c) => [c.id, c.name || c.email]));

  async function upload(formData: FormData) {
    "use server";
    const { requirePractitioner: guard } = await import("@/lib/auth-guards");
    const me = await guard();
    const file = formData.get("audio");
    const clientId = String(formData.get("clientId") ?? "");
    if (!(file instanceof File) || file.size === 0 || !clientId) redirect("/practitioner/captures?c=missing");
    const res = await startUploadCapture({ practitionerId: me.id, clientId, file: file as File });
    revalidatePath("/practitioner/captures");
    redirect(`/practitioner/captures?c=${res.ok ? "started" : res.error}`);
  }

  async function retry(formData: FormData) {
    "use server";
    await (await import("@/lib/auth-guards")).requirePractitioner();
    const id = String(formData.get("captureId") ?? "");
    const cap = await prisma.sessionCapture.findFirst({ where: { id } });
    if (cap?.status === "ERROR" && cap.providerJobId) {
      await prisma.sessionCapture.update({ where: { id }, data: { status: "TRANSCRIBING", errorMessage: null } });
      const { completeCapture } = await import("@/lib/capture");
      await completeCapture(id).catch(() => {});
    }
    revalidatePath("/practitioner/captures");
    redirect("/practitioner/captures");
  }

  const banner: Record<string, string> = {
    started: "Upload received — transcription is underway. The draft will appear in your inbox.",
    consent: "No recording consent on file for that client — the pipeline won't run without it.",
    format: "That file type isn't a supported audio format.",
    toobig: "That file is over the 500 MB limit.",
    provider: "The transcription service didn't accept the job — the audio is safe here; try again.",
    missing: "Pick a client and choose an audio file.",
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Session capture</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Record of the room</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Upload a session recording — from your phone, Pocket, or anywhere that exports audio —
          and a draft session record writes itself into your review inbox. Nothing touches a
          client&apos;s record until you approve it.
        </p>
      </div>

      {searchParams.c && banner[searchParams.c] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{banner[searchParams.c]}</p>
      )}

      <form action={upload} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-strong">Whose session is this?</span>
          <select name="clientId" required className="max-w-sm rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-strong">Audio file</span>
          <input
            type="file"
            name="audio"
            required
            accept="audio/*,video/mp4,.mp3,.m4a,.wav,.webm,.aac,.flac,.ogg"
            className="max-w-sm text-sm text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
        </label>
        <p className="text-[13px] text-whisper">
          Recording requires consent on file — uploads for clients without it are refused.
        </p>
        <PendingButton
          pendingLabel="Uploading…"
          className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
        >
          Upload & transcribe
        </PendingButton>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-headline text-lg font-medium text-ink-strong">Recent captures</h2>
        {captures.length === 0 ? (
          <p className="text-sm text-whisper">Nothing yet — your uploads will appear here with their progress.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {captures.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {firstNameOf(nameOf.get(c.clientId ?? "") ?? "—")} · {c.createdAt.toISOString().slice(0, 10)}
                </span>
                <span className="text-[13px] text-whisper">{STATUS_LINE[c.status] ?? c.status}</span>
                {c.status === "REVIEW" && c.draftId && (
                  <Link href={`/practitioner/notes/inbox/rec/${c.draftId}`} className="text-sm font-medium text-wine underline-offset-4 hover:underline">
                    Review →
                  </Link>
                )}
                {c.status === "ERROR" && (
                  <form action={retry}>
                    <input type="hidden" name="captureId" value={c.id} />
                    <PendingButton className="text-sm font-medium text-wine underline-offset-4 hover:underline">
                      Try again
                    </PendingButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
