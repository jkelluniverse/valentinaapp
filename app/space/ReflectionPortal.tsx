"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntryType } from "@prisma/client";
import { keepReflection, answerDoor, dismissDoor } from "./actions";
import type { DoorOffer } from "@/lib/deepening";

// A2 + D + C17 — the Reflection Portal, the Settling Stone, and the Deepening.
// A conversation, not a form. When a reflection is kept it condenses into a
// luminous stone and settles; THEN, only after closure, the engine may offer a
// single gentle door to go a little further — always dismissible, never a gate.

type Door = { type: EntryType; label: string; primary: boolean };

const DOORS: Door[] = [
  { type: "TRIGGER", label: "Something stirred me", primary: true },
  { type: "INSIGHT", label: "Something shifted in me", primary: true },
  { type: "REFLECTION", label: "a passing reflection", primary: false },
  { type: "PROGRESS", label: "a small win", primary: false },
];

const DRAFT_KEY = "veritas-reflection-draft";

function stoneColor(moodOrNull: number | null): string {
  const pct = moodOrNull ? ((moodOrNull - 1) / 4) * 100 : 0;
  return `color-mix(in srgb, rgb(var(--c-wine)) ${pct}%, rgb(var(--c-mocha)))`;
}
function fmtWhen(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 30) return "recently";
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(d);
}

export function ReflectionPortal({
  recentMoods,
  crisisResources,
}: {
  recentMoods: (number | null)[];
  crisisResources: { label: string; detail: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<EntryType>("REFLECTION");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [whisper, setWhisper] = useState(false);
  const [phase, setPhase] = useState<"compose" | "settling" | "deepen">("compose");
  const [trigger, setTrigger] = useState("");
  const [tags, setTags] = useState("");

  const [offer, setOffer] = useState<DoorOffer | null>(null);
  const [answer, setAnswer] = useState("");
  const [answering, setAnswering] = useState(false);
  const [answered, setAnswered] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function goHome() {
    router.push("/space?saved=1");
    router.refresh();
  }

  async function keep() {
    if (!body.trim()) return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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

    // Run the keep + deepening in parallel with the ceremony breathing.
    const started = Date.now();
    const res = await keepReflection(fd);
    const wait = Math.max(0, (reduced ? 260 : 1250) - (Date.now() - started));
    window.setTimeout(() => {
      if (!res.ok) {
        goHome();
        return;
      }
      const d = res.deepening ?? null;
      // Nothing more to offer → complete the closure and go home.
      const hasSomething = d && (d.crisis || d.door || d.groundingNote || d.connection || d.routeToSession);
      if (hasSomething) {
        setOffer(d);
        setPhase("deepen");
      } else {
        goHome();
      }
    }, wait);
  }

  async function walkThrough() {
    if (!offer?.deepeningId || !answer.trim() || answering) return;
    setAnswering(true);
    try {
      await answerDoor(offer.deepeningId, answer.trim());
      setAnswered(true);
    } finally {
      setAnswering(false);
    }
  }
  function notNow() {
    if (offer?.deepeningId) void dismissDoor(offer.deepeningId);
    goHome();
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

  // ---- The Deepening — after closure, one gentle, optional door ----
  if (phase === "deepen" && offer) {
    // Crisis path: warmth + resources, never a probe.
    if (offer.crisis) {
      return (
        <div className="mx-auto flex min-h-[55vh] max-w-[560px] flex-col justify-center gap-5">
          <div className="flex flex-col gap-3 rounded-card border-2 border-rose bg-surface p-6 shadow-card">
            <p className="font-headline text-2xl font-medium text-rose">
              That sounds like a lot — you deserve support right now.
            </p>
            <p className="text-[15px] leading-relaxed text-ink">
              What you wrote is kept safely, and Valentina will see it. This isn&apos;t a place to
              be alone with something this heavy — please reach out to someone who can be with you
              now.
            </p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {crisisResources.map((r) => (
                <li key={r.label} className="text-[15px] text-ink">
                  <span className="font-semibold text-wine">{r.label}</span> — {r.detail}
                </li>
              ))}
            </ul>
          </div>
          <button onClick={goHome} className="self-center text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
            Return to my space
          </button>
        </div>
      );
    }

    // Answered → a quiet "a piece found its place", then home.
    if (answered) {
      return (
        <div className="mx-auto flex min-h-[55vh] max-w-[520px] flex-col items-center justify-center gap-6 text-center">
          <span className="text-3xl text-wine" aria-hidden>
            ✦
          </span>
          <p className="font-headline text-2xl font-medium text-ink-strong">A piece found its place.</p>
          <p className="max-w-prose text-[15px] text-slate">
            It&apos;s on your map now, in your own words. You can always revisit it.
          </p>
          <div className="flex items-center gap-4">
            <button onClick={goHome} className="rounded-lg bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
              Back to my space
            </button>
            <button onClick={() => router.push("/space/first-map")} className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
              see my map
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto flex min-h-[55vh] max-w-[560px] flex-col justify-center gap-6">
        <p className="text-center font-headline text-lg italic text-mocha">Kept. And if you&apos;d like…</p>

        {/* The connection reveal — the click, from their own words. */}
        {offer.connection && (
          <div className="flex flex-col gap-2 rounded-card border border-mocha/40 bg-blush/40 p-5">
            <p className="text-sm font-medium text-wine">{offer.connection.line}</p>
            <p className="border-l-2 border-mocha/50 pl-3 text-[14px] italic leading-relaxed text-slate">
              &ldquo;{offer.connection.snippet}&rdquo;
              <span className="mt-1 block text-[12px] not-italic text-whisper">
                — you, {fmtWhen(offer.connection.when)}
              </span>
            </p>
          </div>
        )}

        {/* Grounding when raw — validate, offer steadiness, no probe. */}
        {offer.groundingNote && !offer.door && (
          <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
            <p className="text-[15px] leading-relaxed text-ink">{offer.groundingNote}</p>
          </div>
        )}

        {/* The single door. */}
        {offer.door && offer.question && (
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-soft">
            <p className="font-headline text-xl leading-relaxed text-ink-strong">{offer.question}</p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Only if it comes easily…"
              className="resize-y rounded-md border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-wine"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={walkThrough}
                disabled={answering || !answer.trim()}
                className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-40"
              >
                {answering ? "Placing…" : "Share this too"}
              </button>
              <button onClick={notNow} className="text-sm text-whisper underline-offset-4 hover:text-wine hover:underline">
                Not right now
              </button>
            </div>
          </div>
        )}

        {/* Route to session — the app opens doors; Valentina walks through them. */}
        {offer.routeToSession && (
          <p className="max-w-prose text-center text-[14px] text-slate">
            This feels important — it might be worth bringing to Valentina.
          </p>
        )}

        {!offer.door && (
          <button onClick={goHome} className="self-center rounded-lg bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
            Back to my space
          </button>
        )}
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
            className={`text-[13px] text-whisper transition-opacity duration-500 ${whisper ? "opacity-100" : "opacity-0"}`}
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
        <p className="font-headline text-xl text-ink-strong">How strongly is it sitting with you?</p>
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
