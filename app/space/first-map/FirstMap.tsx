"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addStar, placeStar, finishFirstMap } from "./actions";

// C16.5 — the guided self-mapping exercise. One warm prompt at a time (the
// Reflection Portal grammar), every prompt with a gentle "not yet", then a sky
// where they place their stars — the ones that feel connected, close together.

type Star = { id: string; label: string; kind: string; promptKey: string | null; x: number; y: number };

const PROMPTS: { key: string; q: string; hint: string }[] = [
  {
    key: "knock",
    q: "What tends to knock you off center, again and again?",
    hint: "A situation, a feeling, a kind of moment. There may be more than one.",
  },
  {
    key: "protect",
    q: "When that happens, what do you do to protect yourself?",
    hint: "However it looks — withdrawing, working harder, going quiet, taking charge.",
  },
  {
    key: "belief",
    q: "Is there a belief about yourself underneath it — a sentence you'd recognize?",
    hint: "Often it starts with “I'm…” or “I have to…”.",
  },
  {
    key: "origin",
    q: "Where did that begin, if you know? (It's okay not to.)",
    hint: "A time, a place, a relationship. Only what feels ready.",
  },
  {
    key: "strength",
    q: "And what's strong in you — what's carried you through?",
    hint: "These belong on your map too. They always did.",
  },
];

const KIND_TINT: Record<string, string> = {
  PATTERN: "#946E80",
  PROTECTION: "#B79175",
  CORE_BELIEF: "#B24A5C",
  WOUND: "#801634",
  RESOURCE: "#D4A860",
};

export function FirstMap({
  initialStars,
  completed,
  crisisResources,
}: {
  initialStars: Star[];
  completed: boolean;
  crisisResources: { label: string; detail: string }[];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"prompts" | "place" | "done">(
    completed ? "done" : initialStars.length > 0 ? "place" : "prompts",
  );
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [stars, setStars] = useState<Star[]>(initialStars);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const [addingMore, setAddingMore] = useState<string | null>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);

  const prompt = PROMPTS[step];

  async function submit(promptKey: string, thenNext: boolean) {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await addStar(promptKey, body);
      if (res.ok && res.id) {
        setStars((s) => [
          ...s,
          {
            id: res.id!,
            label: body.length > 90 ? `${body.slice(0, 90)}…` : body,
            kind: "",
            promptKey,
            x: 0.2 + Math.random() * 0.6,
            y: 0.2 + Math.random() * 0.6,
          },
        ]);
        setText("");
        if (res.crisis) setShowCrisis(true);
        if (thenNext) advance();
      }
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    if (step < PROMPTS.length - 1) setStep(step + 1);
    else setPhase("place");
  }
  function skip() {
    setSkipped((s) => [...s, prompt.key]);
    setText("");
    advance();
  }

  async function finish() {
    setBusy(true);
    try {
      await finishFirstMap(skipped);
      setPhase("done");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // ---- the sky: drag stars; connected things live close together ----
  function starPointerDown(id: string) {
    dragRef.current = id;
  }
  function skyPointerMove(e: React.PointerEvent) {
    const id = dragRef.current;
    const sky = skyRef.current;
    if (!id || !sky) return;
    const rect = sky.getBoundingClientRect();
    const x = Math.min(0.97, Math.max(0.03, (e.clientX - rect.left) / rect.width));
    const y = Math.min(0.94, Math.max(0.04, (e.clientY - rect.top) / rect.height));
    setStars((s) => s.map((st) => (st.id === id ? { ...st, x, y } : st)));
  }
  async function skyPointerUp() {
    const id = dragRef.current;
    dragRef.current = null;
    if (!id) return;
    const st = stars.find((s) => s.id === id);
    if (st) void placeStar(st.id, st.x, st.y);
  }

  const sky = (
    <div
      ref={skyRef}
      onPointerMove={skyPointerMove}
      onPointerUp={skyPointerUp}
      className="relative h-[46vh] min-h-[320px] w-full touch-none overflow-hidden rounded-card border border-white/10"
      style={{ background: "radial-gradient(ellipse at 50% 35%, #241820 0%, #191114 72%)" }}
    >
      {stars.map((st) => (
        <button
          key={st.id}
          onPointerDown={(e) => {
            e.preventDefault();
            starPointerDown(st.id);
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ left: `${st.x * 100}%`, top: `${st.y * 100}%` }}
        >
          <span
            aria-hidden
            className="block text-xl leading-none"
            style={{
              color: KIND_TINT[st.kind] ?? "#E8C687",
              textShadow: "0 0 12px rgba(232,198,135,0.65)",
            }}
          >
            ✦
          </span>
          <span className="mt-1 block max-w-[9rem] truncate text-center text-[11px] text-white/75">
            {st.label}
          </span>
        </button>
      ))}
      {stars.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white/50">
          Your stars will appear here as you name them.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {showCrisis && (
        <div className="flex flex-col gap-2 rounded-card border-2 border-rose bg-surface p-6 shadow-card">
          <p className="font-headline text-xl font-medium text-rose">That sounds heavy — you deserve support right now.</p>
          <p className="text-sm leading-relaxed text-ink">
            This exercise will keep. Please reach out to someone who can be there immediately —
            and Valentina will see this too.
          </p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {crisisResources.map((r) => (
              <li key={r.label} className="text-sm text-ink">
                <span className="font-semibold text-wine">{r.label}</span> — {r.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase === "prompts" && (
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-soft">
          <p className="text-[13px] text-whisper">
            {step + 1} of {PROMPTS.length}
          </p>
          <h2 className="max-w-prose font-headline text-2xl font-medium text-ink-strong">{prompt.q}</h2>
          <p className="max-w-prose text-sm text-slate">{prompt.hint}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="In your own words…"
            className="resize-y rounded-md border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-wine"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => submit(prompt.key, true)}
              disabled={busy || !text.trim()}
              className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-40"
            >
              {busy ? "Placing…" : "Name it — make a star"}
            </button>
            <button
              onClick={() => submit(prompt.key, false)}
              disabled={busy || !text.trim()}
              className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline disabled:opacity-40"
            >
              add another for this question
            </button>
            <button onClick={skip} disabled={busy} className="ml-auto text-sm text-whisper underline-offset-4 hover:text-wine hover:underline">
              Not yet — some things aren&apos;t ready. It will wait for you.
            </button>
          </div>
          {sky}
        </div>
      )}

      {phase === "place" && (
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-[15px] text-ink">
            Now arrange your sky: <em>put the ones that feel connected close together.</em> There
            is no wrong arrangement — only yours.
          </p>
          {sky}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={finish}
              disabled={busy}
              className="rounded-lg bg-wine px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-50"
            >
              {busy ? "Keeping…" : "This is my map, for now"}
            </button>
            <button
              onClick={() => {
                setPhase("prompts");
                setStep(0);
              }}
              className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
            >
              back to the questions
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-[15px] text-ink">
            Your map, as you see it today. It stays yours — come back anytime something new asks
            to be named, and drag the stars as your sense of them shifts.
          </p>
          {sky}
          <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <p className="mb-3 text-sm font-medium text-ink-strong">I realized something…</p>
            <div className="flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setAddingMore(addingMore === p.key ? null : p.key)}
                  className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${addingMore === p.key ? "bg-wine text-white" : "border border-line text-ink hover:bg-blush"}`}
                >
                  {p.key === "knock" ? "something that knocks me" : p.key === "protect" ? "a way I protect myself" : p.key === "belief" ? "a belief underneath" : p.key === "origin" ? "where it began" : "a strength"}
                </button>
              ))}
            </div>
            {addingMore && (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder="In your own words…"
                  className="resize-y rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
                />
                <button
                  onClick={() => submit(addingMore, false)}
                  disabled={busy || !text.trim()}
                  className="self-start rounded-lg bg-wine px-4 py-2 text-sm font-medium text-white hover:bg-wine-dark disabled:opacity-40"
                >
                  Add the star
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
