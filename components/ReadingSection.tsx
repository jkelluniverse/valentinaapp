"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReadingProse } from "@/components/ReadingProse";

// C12r §7 — the client's "What it all means to you" section. A stored reading
// loads instantly; a first generation reveals line-by-line ("Drawing your
// reading together…"), ceremonial rather than a spinner. Reduced motion shows
// the finished reading at once.

type Props = {
  initialContent: string | null;
  pendingReviewForClient: boolean;
  chartsComplete: boolean;
  generate: () => Promise<{ ok: boolean; content?: string; status?: string; error?: string }>;
};

function RevealPanel({ content, reveal }: { content: string; reveal: boolean }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const [shown, setShown] = useState(reveal ? 0 : lines.length);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!reveal) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(lines.length);
      return;
    }
    const step = Math.max(1, Math.ceil(lines.length / 40)); // ~3.6s total
    timer.current = setInterval(() => {
      setShown((n) => {
        const next = n + step;
        if (next >= lines.length && timer.current) clearInterval(timer.current);
        return next;
      });
    }, 90);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reveal, lines.length]);

  const revealing = shown < lines.length;
  return (
    <div className="rounded-card border border-line bg-surface p-7 shadow-soft sm:p-9">
      <ReadingProse content={lines.slice(0, shown).join("\n")} />
      {revealing && (
        <span className="mt-3 inline-block h-4 w-2 animate-pulse bg-mocha align-middle" aria-hidden />
      )}
    </div>
  );
}

export function ReadingSection({
  initialContent,
  pendingReviewForClient,
  chartsComplete,
  generate,
}: Props) {
  const [content, setContent] = useState<string | null>(initialContent);
  const [phase, setPhase] = useState<"idle" | "drawing" | "revealed" | "error" | "pending">(
    initialContent ? "revealed" : pendingReviewForClient ? "pending" : chartsComplete ? "drawing" : "idle",
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (initialContent || pendingReviewForClient || !chartsComplete) return;
    started.current = true;
    setPhase("drawing");
    generate().then((res) => {
      if (!res.ok) {
        setPhase(res.error === "config" ? "idle" : "error");
        return;
      }
      if (res.status === "PENDING_REVIEW") {
        setPhase("pending");
        return;
      }
      setContent(res.content ?? null);
      setPhase("revealed");
    });
  }, [initialContent, pendingReviewForClient, chartsComplete, generate]);

  if (!chartsComplete && phase === "idle") {
    return (
      <div className="rounded-card border border-line bg-surface p-7 shadow-soft">
        <p className="max-w-prose text-ink">
          Your reading opens once your values snapshot is complete — the woven picture deserves all
          three maps. Fill in the values assessment Valentina sends, and it&apos;ll draw itself
          together here.
        </p>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="rounded-card border border-line bg-surface p-7 shadow-soft">
        <p className="max-w-prose text-ink">
          Your reading is written — Valentina is adding her finishing touch before it&apos;s yours.
          It&apos;ll appear here shortly.
        </p>
      </div>
    );
  }

  if (phase === "drawing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-10 text-center shadow-soft">
        <p className="gentle-rise font-headline text-xl italic text-mocha">
          Drawing your reading together…
        </p>
        <p className="text-[13px] text-whisper">Weaving your three maps into one — a moment.</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-card border border-line bg-surface p-7 shadow-soft">
        <p className="text-ink">
          Your reading couldn&apos;t be drawn together just now — please try again in a little
          while.
        </p>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="flex flex-col gap-4">
      <RevealPanel content={content} reveal={!initialContent} />
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/space/design/reading"
          target="_blank"
          className="text-sm font-medium text-wine underline-offset-4 hover:underline"
        >
          Save as PDF ↗
        </Link>
        <p className="text-[13px] text-whisper">
          A generated reflection drawn from your chart — a mirror to explore, kept for you.
        </p>
      </div>
    </div>
  );
}
