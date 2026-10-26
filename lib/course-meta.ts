import type { LessonType, VideoSource } from "@prisma/client";

export const LESSON_TYPES: { value: LessonType; label: string; pill: string; ask: string }[] = [
  { value: "VIDEO", label: "Video", pill: "bg-wine text-white", ask: "A video to watch" },
  { value: "TEXT", label: "Writing", pill: "bg-blush text-wine", ask: "Something to read" },
  { value: "EXERCISE", label: "Exercise", pill: "border border-mocha text-mocha", ask: "Something to do" },
];

export function lessonTypeLabel(type: LessonType) {
  return LESSON_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function lessonTypePill(type: LessonType) {
  return LESSON_TYPES.find((t) => t.value === type)?.pill ?? "bg-line/50 text-slate";
}

// Parse a pasted YouTube/Vimeo link into an embeddable URL (spec §5 default).
export function parseVideoUrl(
  raw: string,
): { source: VideoSource; embedUrl: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.searchParams.get("v") ?? url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1];
    if (id) return { source: "YOUTUBE", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (id) return { source: "YOUTUBE", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{6,})/)?.[1];
    if (id) return { source: "VIMEO", embedUrl: `https://player.vimeo.com/video/${id}` };
  }
  return null;
}

export function lessonContentText(content: unknown): string {
  if (content && typeof content === "object" && "text" in (content as Record<string, unknown>)) {
    return String((content as { text?: unknown }).text ?? "");
  }
  return "";
}
