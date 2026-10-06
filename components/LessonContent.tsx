import type { Lesson } from "@prisma/client";
import { parseVideoUrl, lessonContentText } from "@/lib/course-meta";

// Server-safe rendering of a lesson's video/text body. Exercises are rendered
// by the caller (preview shows the prompt; the player adds the respond form).
export function LessonBody({ lesson }: { lesson: Lesson }) {
  if (lesson.type === "VIDEO") {
    const embed = lesson.videoUrl ? parseVideoUrl(lesson.videoUrl) : null;
    if (!embed) {
      return <p className="text-ink">This video isn&apos;t ready yet.</p>;
    }
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-line shadow-soft">
        <iframe
          src={embed.embedUrl}
          title={lesson.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (lesson.type === "TEXT") {
    const text = lessonContentText(lesson.content);
    if (!text) return <p className="text-ink">Nothing written here yet.</p>;
    return (
      <div className="flex max-w-prose flex-col gap-4">
        {text
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((para, i) => (
            <p key={i} className="whitespace-pre-wrap text-lg leading-relaxed text-ink">
              {para}
            </p>
          ))}
      </div>
    );
  }

  return null;
}
