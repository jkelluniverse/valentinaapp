"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReadingProse } from "@/components/ReadingProse";

// C12r §7 + C12X §2 — the client's "What it all means to you". A stored
// reading loads instantly; a first generation reveals line-by-line. The C12X
// evolution: below the woven narrative, each significant placement opens as
// a gentle block — what it describes, flowing vs under pressure, how it may
// show up, questions, an experiment — closing with "Does this feel true?"
// (the resonance control: an invitation that can be declined).

type Block = {
  key: string;
  title: string;
  traditional: string;
  flowing: string;
  underPressure: string;
  mayShowUp: {
    feelings: string;
    thoughts: string;
    body: string;
    relationships: string;
    decisions: string;
    workRestWorth: string;
  };
  questions: string[];
  experiment: string;
};

type Props = {
  initialContent: string | null;
  initialBlocks: Block[];
  initialMarks: Record<string, string>;
  locale: "en" | "es";
  pendingReviewForClient: boolean;
  chartsComplete: boolean;
  generate: () => Promise<{
    ok: boolean;
    content?: string;
    blocks?: Block[];
    status?: string;
    error?: string;
  }>;
  mark: (blockKey: string, value: string) => Promise<{ ok: boolean }>;
};

const T = {
  en: {
    explore: "To explore more closely",
    exploreSub: "Each of these opens gently — take only what rings true.",
    flowing: "When it's flowing",
    pressure: "Under pressure",
    mayShow: "How it may show up",
    questions: "Questions to sit with",
    experiment: "A small experiment",
    feelsTrue: "Does this feel true?",
    arenas: {
      feelings: "Feelings",
      thoughts: "Thoughts",
      body: "Body",
      relationships: "Relationships",
      decisions: "Decisions",
      workRestWorth: "Work, rest & worth",
    },
    marks: {
      FEELS_TRUE: "Feels true",
      PARTLY: "Partly",
      DOESNT_FIT: "Doesn't fit",
      NOT_YET: "Not yet explored",
    },
    marked: "Noted — thank you for saying so.",
  },
  es: {
    explore: "Para explorar más de cerca",
    exploreSub: "Cada una se abre con calma — quédate solo con lo que resuene.",
    flowing: "Cuando fluye",
    pressure: "Bajo presión",
    mayShow: "Cómo puede aparecer",
    questions: "Preguntas para acompañarte",
    experiment: "Un pequeño experimento",
    feelsTrue: "¿Esto se siente verdadero?",
    arenas: {
      feelings: "Sentimientos",
      thoughts: "Pensamientos",
      body: "Cuerpo",
      relationships: "Relaciones",
      decisions: "Decisiones",
      workRestWorth: "Trabajo, descanso y valor propio",
    },
    marks: {
      FEELS_TRUE: "Se siente verdadero",
      PARTLY: "En parte",
      DOESNT_FIT: "No encaja",
      NOT_YET: "Aún por explorar",
    },
    marked: "Anotado — gracias por decirlo.",
  },
} as const;

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

function PlacementBlock({
  block,
  t,
  markValue,
  onMark,
}: {
  block: Block;
  t: (typeof T)["en"] | (typeof T)["es"];
  markValue: string | null;
  onMark: (value: string) => void;
}) {
  const [justMarked, setJustMarked] = useState(false);
  return (
    <details className="group rounded-card border border-line bg-surface shadow-soft">
      <summary className="cursor-pointer list-none px-6 py-4">
        <span className="font-headline text-[17px] font-semibold text-ink-strong group-open:text-wine">
          {block.title}
        </span>
        <span className="ml-2 text-mocha transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-6 py-5 text-[15px] leading-relaxed text-ink">
        <p>{block.traditional}</p>
        <p>
          <span className="font-semibold text-ink-strong">{t.flowing}</span> — {block.flowing}
        </p>
        <p>
          <span className="font-semibold text-ink-strong">{t.pressure}</span> —{" "}
          {block.underPressure}
        </p>
        <div>
          <p className="mb-1.5 font-semibold text-ink-strong">{t.mayShow}</p>
          <ul className="flex flex-col gap-1 text-[14px]">
            {(Object.keys(t.arenas) as (keyof typeof t.arenas)[]).map((k) => (
              <li key={k}>
                <span className="font-medium text-mocha">{t.arenas[k]}</span> —{" "}
                {block.mayShowUp[k]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 font-semibold text-ink-strong">{t.questions}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px]">
            {block.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
        <p>
          <span className="font-semibold text-ink-strong">{t.experiment}</span> —{" "}
          {block.experiment}
        </p>

        {/* §5 — the resonance control. Quiet, declinable, remembered. */}
        <div className="mt-1 rounded-md bg-blush/40 px-4 py-3">
          <p className="mb-2 text-[13.5px] font-medium text-wine">{t.feelsTrue}</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(t.marks) as (keyof typeof t.marks)[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onMark(v);
                  setJustMarked(true);
                }}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  markValue === v
                    ? "bg-wine text-cream"
                    : "border border-mocha/60 text-ink hover:bg-blush"
                }`}
              >
                {t.marks[v]}
              </button>
            ))}
          </div>
          {justMarked && <p className="mt-2 text-[12px] text-slate">{t.marked}</p>}
        </div>
      </div>
    </details>
  );
}

export function ReadingSection({
  initialContent,
  initialBlocks,
  initialMarks,
  locale,
  pendingReviewForClient,
  chartsComplete,
  generate,
  mark,
}: Props) {
  const [content, setContent] = useState<string | null>(initialContent);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [marks, setMarks] = useState<Record<string, string>>(initialMarks);
  const [phase, setPhase] = useState<"idle" | "drawing" | "revealed" | "error" | "pending">(
    initialContent ? "revealed" : pendingReviewForClient ? "pending" : chartsComplete ? "drawing" : "idle",
  );
  const started = useRef(false);
  const t = T[locale];

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
      setBlocks(res.blocks ?? []);
      setPhase("revealed");
    });
  }, [initialContent, pendingReviewForClient, chartsComplete, generate]);

  function handleMark(blockKey: string, value: string) {
    setMarks((m) => ({ ...m, [blockKey]: value }));
    void mark(blockKey, value);
  }

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

      {blocks.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5 pt-2">
            <h3 className="font-headline text-lg font-semibold text-ink-strong">{t.explore}</h3>
            <p className="text-[13px] text-slate">{t.exploreSub}</p>
          </div>
          {blocks.map((b) => (
            <PlacementBlock
              key={b.key}
              block={b}
              t={t}
              markValue={marks[b.key] ?? null}
              onMark={(v) => handleMark(b.key, v)}
            />
          ))}
        </div>
      )}

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
