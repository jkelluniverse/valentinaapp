import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { InlineField } from "@/components/InlineField";
import { parseVideoUrl, lessonTypeLabel, lessonContentText } from "@/lib/course-meta";
import { promptKindLabel } from "@/lib/prompt-meta";
import { saveLessonField } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function LessonEditorPage({
  params,
}: {
  params: { courseId: string; lessonId: string };
}) {
  await requirePractitioner();

  const lesson = await prisma.lesson.findFirst({
    where: { id: params.lessonId, chapter: { courseId: params.courseId } },
    include: { chapter: { select: { title: true } } },
  });
  if (!lesson) notFound();

  const save = saveLessonField.bind(null, lesson.id);
  const embed = lesson.videoUrl ? parseVideoUrl(lesson.videoUrl) : null;
  const prompts =
    lesson.type === "EXERCISE"
      ? await prisma.prompt.findMany({
          where: { active: true },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, kind: true },
        })
      : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>
          {lesson.chapter.title} · {lessonTypeLabel(lesson.type)} lesson
        </Eyebrow>
        <InlineField
          action={save}
          name="title"
          defaultValue={lesson.title}
          placeholder="Lesson title"
          className="font-headline text-2xl font-semibold text-wine"
        />
        <SignatureRule />
      </div>

      {lesson.type === "VIDEO" && (
        <section className="flex flex-col gap-3">
          <InlineField
            action={save}
            name="videoUrl"
            defaultValue={lesson.videoUrl ?? ""}
            label="Paste a YouTube or Vimeo link"
            placeholder="https://youtu.be/… or https://vimeo.com/…"
          />
          {lesson.videoUrl &&
            (embed ? (
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-line shadow-soft">
                <iframe
                  src={embed.embedUrl}
                  title={lesson.title}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <p className="text-sm text-rose">
                That link doesn&apos;t look like YouTube or Vimeo — double-check and paste again.
              </p>
            ))}
          <p className="text-xs text-slate">
            Tip: set the video to &quot;unlisted&quot; on YouTube/Vimeo so only people with the
            link (your clients) can see it. Direct upload is a planned upgrade.
          </p>
        </section>
      )}

      {lesson.type === "TEXT" && (
        <section className="flex flex-col gap-2">
          <InlineField
            action={save}
            name="text"
            defaultValue={lessonContentText(lesson.content)}
            label="The writing"
            placeholder="Write here — blank lines become paragraphs. It saves as you go."
            textarea
            rows={14}
          />
        </section>
      )}

      {lesson.type === "EXERCISE" && (
        <section className="flex flex-col gap-3">
          <p className="max-w-prose text-ink">
            Attach something from your library — the client answers it right inside the lesson,
            and their response lands on their record like any other.
          </p>
          {prompts.length === 0 ? (
            <p className="text-sm text-ink">
              Your library is empty — add a prompt in{" "}
              <Link href="/practitioner/library" className="font-medium text-wine underline-offset-4 hover:underline">
                Library
              </Link>{" "}
              first.
            </p>
          ) : (
            <form action={save} className="flex flex-wrap items-center gap-2">
              <select
                name="promptId"
                defaultValue={lesson.promptId ?? ""}
                className="min-w-64 rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-wine"
              >
                <option value="">— choose from your library —</option>
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {promptKindLabel(p.kind)} — {p.title}
                  </option>
                ))}
              </select>
              <button className="rounded-md bg-wine px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                Attach
              </button>
            </form>
          )}
          {lesson.promptId && <p className="text-sm text-slate">Attached ✓</p>}
        </section>
      )}

      <Link
        href={`/practitioner/courses/${params.courseId}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the outline
      </Link>
    </div>
  );
}
