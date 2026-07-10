"use client";

import { useEffect, useRef, useState } from "react";
import type { EntryType } from "@prisma/client";

// A2 + D — the Reflection Portal and the Settling Stone. A conversation, not a
// form: one question per view, everything optional except the words. When the
// reflection is kept, it condenses into a luminous stone and settles into a
// river at the foot of the page — data submission becomes a closure ritual.

type Door = { type: EntryType; label: string; primary: boolean };

// The two doors map to the C2 taxonomy without jargon (they rename via config).
const DOORS: Door[] = [
  { type: "TRIGGER", label: "Something stirred me", primary: true },
  { type: "INSIGHT", label: "Something shifted in me", primary: true },
  { type: "REFLECTION", label: "a passing reflection", primary: false },
  { type: "PROGRESS", label: "a small win", primary: false },
];

const DRAFT_KEY = "veritas-reflection-draft";

function stoneColor(moodOrNull: number | null): string {
  // barely (mocha) → fully (wine); themes with Dusk via CSS variables.
  const pct = moodOrNull ? ((moodOrNull - 1) / 4) * 100 : 0;
  return `color-mix(in srgb, rgb(var(--c-wine)) ${pct}%, rgb(var(--c-mocha)))`;
}

export function ReflectionPortal({
  action,
  recentMoods,
}: {
  action: (formData: FormData) => Promise<void>;
  recentMoods: (number | null)[];
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<EntryType>("REFLECTION");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [whisper, setWhisper] = useState(false);
  const [phase, setPhase] = useState<"compose" | "settling">("compose");
  const [trigger, setTrigger] = useState("");
  const [tags, setTags] = useState("");

  const textRef = useRef<HTMLTextAreaElement>(null);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore an unfinished draft wordlessly.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { body?: string; type?: EntryType; mood?: number | null };
        if (d.body) {
          setBody(d.body);
          if (d.type) setType(d.type);
          if (typeof d.mood === "number") setMood(d.mood);
          setStep(2);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Autosave whisper: "kept as you write" after a pause. No save anxiety.
  useEffect(() => {
    if (!body) return;
    if (whisperTimer.current) clearTimeout(whisperTimer.current);
    whisperTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ body, type, mood }));
      } catch {
        /* ignore */
      }
      setWhisper(true);
      setTimeout(() => setWhisper(false), 1600);
    }, 900);
    return () => {
      if (whisperTimer.current) clearTimeout(whisperTimer.current);
    };
  }, [body, type, mood]);

  function chooseDoor(t: EntryType) {
    setType(t);
    setStep(2);
    setTimeout(() => textRef.current?.focus(), 60);
  }

  async function keep() {
    if (!body.trim()) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    setPhase("settling");

    const fd = new FormData();
    fd.set("body", body.trim());
    fd.set("type", type);
    fd.set("mood", mood ? String(mood) : "");
    if (trigger.trim()) fd.set("trigger", trigger.trim());
    if (tags.trim()) fd.set("tags", tags.trim());

    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }

    // Let the ceremony breathe, then commit (createEntry redirects home).
    window.setTimeout(
      () => {
        void action(fd);
      },
      reduced ? 260 : 1250,
    );
  }

  // ---- The settling ceremony ----
  if (phase === "settling") {
    const river = [...recentMoods].slice(0, 7);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-10 py-8 text-center">
        <div className="flex flex-col items-center gap-3 gentle-rise">
          <p className="font-headline text-3xl font-medium text-wine">Kept.</p>
          <p className="text-[15px] text-whisper">It&apos;s part of your journey now.</p>
        </div>
        <div className="flex items-end justify-center gap-3">
          {river.map((m, i) => (
            <span
              key={i}
              className="stone-ripple inline-block h-4 w-4 rounded-full"
              style={{ background: stoneColor(m), animationDelay: `${i * 40}ms` }}
            />
          ))}
          <span
            className="stone-arrive inline-block h-6 w-6 rounded-full shadow-stone"
            style={{ background: stoneColor(mood) }}
          />
        </div>
      </div>
    );
  }

  // ---- Step 1: arrival ----
  if (step === 1) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-[520px] flex-col justify-center gap-8">
        <h1 className="font-headline text-[2rem] font-medium leading-tight text-ink-strong">
          What&apos;s present right now?
        </h1>
        <div className="flex flex-col gap-3">
          {DOORS.filter((d) => d.primary).map((d) => (
            <button
              key={d.type}
              type="button"
              onClick={() => chooseDoor(d.type)}
              className="rounded-card border border-line bg-surface px-6 py-6 text-left font-headline text-xl text-wine shadow-soft transition-all ease-settle duration-300 hover:-translate-y-0.5 hover:shadow-card"
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[13px] text-whisper">
          <span>or</span>
          {DOORS.filter((d) => !d.primary).map((d) => (
            <button
              key={d.type}
              type="button"
              onClick={() => chooseDoor(d.type)}
              className="underline-offset-4 hover:text-wine hover:underline"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Step 2: the page ----
  if (step === 2) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-[600px] flex-col gap-6">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="self-start text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
        >
          ←
        </button>
        <textarea
          ref={textRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          autoFocus
          rows={9}
          placeholder="Say it the way it feels…"
          className="w-full resize-none border-0 bg-transparent font-headline text-xl leading-relaxed text-ink outline-none placeholder:text-whisper/70"
        />
        <div className="flex items-center justify-between">
          <span
            className={`text-[13px] text-whisper transition-opacity duration-500 ${
              whisper ? "opacity-100" : "opacity-0"
            }`}
          >
            kept as you write
          </span>
          <button
            type="button"
            disabled={!body.trim()}
            onClick={() => setStep(3)}
            className="rounded-lg border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush disabled:opacity-40"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ---- Step 3: one touch (skippable) + keep ----
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-[520px] flex-col justify-center gap-8">
      <button
        type="button"
        onClick={() => setStep(2)}
        className="self-start text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
      >
        ← back to your words
      </button>

      <div className="flex flex-col gap-4">
        <p className="font-headline text-xl text-ink-strong">
          How strongly is it sitting with you?
        </p>
        <div className="flex flex-col gap-2">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={mood ?? 3}
            onChange={(e) => setMood(Number(e.target.value))}
            aria-label="Intensity, barely to fully"
            className="intensity-band h-3 w-full cursor-pointer appearance-none rounded-full bg-intensity"
          />
          <div className="flex justify-between text-[13px] text-whisper">
            <span>barely</span>
            <span>{mood ? "" : "slide if it helps — or just keep it"}</span>
            <span>fully</span>
          </div>
        </div>
      </div>

      {showMore ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-whisper">What prompted this? (optional)</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="A conversation, a thought, a place…"
              className="rounded-md border border-line bg-surface px-3 py-2.5 text-ink outline-none placeholder:text-whisper/70 focus:border-wine"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-whisper">Tags (optional, comma-separated)</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="work, family, sleep"
              className="rounded-md border border-line bg-surface px-3 py-2.5 text-ink outline-none placeholder:text-whisper/70 focus:border-wine"
            />
          </label>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="self-start text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
        >
          Add a little more
        </button>
      )}

      <button
        type="button"
        onClick={keep}
        className="self-start rounded-lg bg-wine px-8 py-4 text-base font-medium text-white shadow-soft transition-all ease-settle duration-300 hover:bg-wine-dark hover:shadow-card"
      >
        Keep this
      </button>
    </div>
  );
}
