"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/mobile/Sheet";
import type { MessageView } from "@/lib/messaging";
import type { RefType } from "@/lib/message-refs";

// AMENDMENT-04 §2b — the thread as a fixed three-layer screen, not a card in a
// page: header bar · message scroll region (only this scrolls, starts at the
// bottom) · pinned composer. On mobile it is a full-screen overlay (immersive —
// it covers the tab bar; ‹ returns). Desktop renders the same structure as a
// contained column. Bubble grammar follows iMessage: grouping, tails, sparse
// timestamps, Seen once, wine=self / surface=them.

type RefGroup = { type: RefType; label: string; options: { id: string; label: string }[] };
type PendingRef = { type: RefType; id: string; label: string };

const GROUP_GAP_MS = 15 * 60 * 1000;

function fmtSeparator(iso: string, prevIso: string | null): string | null {
  const d = new Date(iso);
  if (!prevIso) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(d);
  }
  const gap = d.getTime() - new Date(prevIso).getTime();
  if (gap <= GROUP_GAP_MS) return null;
  const sameDay = new Date(prevIso).toDateString() === d.toDateString();
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  if (sameDay) return time;
  return `${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d)} · ${time}`;
}

export function ThreadScreen({
  viewerRole,
  counterpartName,
  counterpartInitial,
  backHref,
  nameHref,
  initial,
  refGroups,
  paused,
  topNote,
  crisisResources,
  menu,
  send,
  poll,
}: {
  viewerRole: "CLIENT" | "PRACTITIONER";
  counterpartName: string;
  counterpartInitial: string;
  backHref: string;
  nameHref?: string; // practitioner: tap the name → the Portrait
  initial: MessageView[];
  refGroups: RefGroup[];
  paused: boolean;
  topNote?: string | null; // client: away note / response rhythm, as a quiet system line
  crisisResources: { label: string; detail: string }[];
  menu?: React.ReactNode; // optional thread actions (pause / acknowledge)
  send: (formData: FormData) => Promise<{ ok: boolean; crisis?: boolean; error?: string }>;
  poll: () => Promise<MessageView[]>;
}) {
  const [messages, setMessages] = useState<MessageView[]>(initial);
  const [body, setBody] = useState("");
  const [pendingRefs, setPendingRefs] = useState<PendingRef[]>([]);
  const [offRecord, setOffRecord] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const polling = useRef(false);

  const toBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    toBottom();
  }, []);
  useEffect(() => {
    toBottom(true);
  }, [messages.length]);

  // Keyboard: when the visual viewport resizes (keyboard up), stay pinned to
  // the latest message. The composer rides above via resizes-content.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => toBottom();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Gentle short-poll — delivery doesn't depend on it.
  useEffect(() => {
    const tick = async () => {
      if (polling.current || document.hidden) return;
      polling.current = true;
      try {
        const next = await poll();
        setMessages((prev) => (sameList(prev, next) ? prev : next));
      } catch {
        /* keep last good state */
      } finally {
        polling.current = false;
      }
    };
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [poll]);

  async function onSend() {
    if (sending || paused) return;
    if (!body.trim() && pendingRefs.length === 0) return;
    setSending(true);
    const fd = new FormData();
    fd.set("body", body);
    fd.set("refs", JSON.stringify(pendingRefs.map((r) => ({ type: r.type, id: r.id }))));
    fd.set("offRecord", offRecord ? "1" : "");
    try {
      const res = await send(fd);
      if (res.ok) {
        setBody("");
        setPendingRefs([]);
        setOffRecord(false);
        if (res.crisis) setShowCrisis(true);
        setMessages(await poll());
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // Seen goes under the viewer's LAST message that has been read — once.
  const lastSeenOwnId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === viewerRole) return m.readAt ? m.id : null;
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas md:static md:z-auto md:h-[72vh] md:overflow-hidden md:rounded-card md:border md:border-line">
      {/* ── header bar (fixed) ── */}
      <div className="flex items-center gap-3 border-b border-line bg-canvas/95 px-3 pb-2 pt-safe backdrop-blur md:pt-2">
        <Link href={backHref} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-pill text-xl text-wine">
          ‹
        </Link>
        <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-blush text-[13px] font-semibold text-wine ring-1 ring-line">
          {counterpartInitial}
        </span>
        {nameHref ? (
          <Link href={nameHref} className="min-w-0 truncate text-[15px] font-semibold text-ink-strong underline-offset-4 hover:text-wine hover:underline">
            {counterpartName}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-[15px] font-semibold text-ink-strong">{counterpartName}</span>
        )}
        {menu && (
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Conversation options"
            className="ml-auto rounded-pill px-2 py-1 text-mocha hover:bg-blush"
          >
            ⋯
          </button>
        )}
      </div>

      {/* ── message scroll region (only this scrolls) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:px-5">
        {topNote && <p className="pb-2 text-center text-[12px] text-whisper">{topNote}</p>}

        {showCrisis && (
          <div className="mx-auto mb-3 flex max-w-md flex-col gap-2 rounded-lg border-2 border-rose bg-surface p-4">
            <p className="text-sm font-semibold text-rose">You deserve support right now.</p>
            <p className="text-[13px] leading-relaxed text-ink">
              This line isn&apos;t for emergencies — please reach out to someone who can be there
              immediately. Valentina has been let know too.
            </p>
            <ul className="flex flex-col gap-1">
              {crisisResources.map((r) => (
                <li key={r.label} className="text-[13px] text-ink">
                  <span className="font-semibold text-wine">{r.label}</span> — {r.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-12 text-center text-sm text-whisper">
            {viewerRole === "CLIENT"
              ? `The start of your open line with ${counterpartName}. Say anything.`
              : `Nothing here yet — write ${counterpartName} a first note.`}
          </p>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1] ?? null;
          const next = messages[i + 1] ?? null;
          const own = m.role === viewerRole;
          const separator = fmtSeparator(m.createdAt, prev?.createdAt ?? null);
          // Grouping: same sender, small gap, no separator between.
          const groupedWithPrev =
            !!prev && prev.role === m.role && !separator;
          const groupedWithNext =
            !!next &&
            next.role === m.role &&
            new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() <= GROUP_GAP_MS;
          const isTail = !groupedWithNext; // tail only on the last of a group

          const base = own
            ? "bg-wine text-white"
            : "bg-surface border border-line text-ink";
          const corners = own
            ? isTail
              ? "rounded-[18px] rounded-br-[4px]"
              : "rounded-[18px]"
            : isTail
              ? "rounded-[18px] rounded-bl-[4px]"
              : "rounded-[18px]";

          return (
            <div key={m.id}>
              {separator && (
                <p className="py-2 text-center text-[11px] text-whisper">{separator}</p>
              )}
              <div className={`flex ${own ? "justify-end" : "justify-start"} ${groupedWithPrev ? "mt-0.5" : "mt-3"}`}>
                <div className={`flex max-w-[75%] flex-col gap-1.5 px-3 py-2 ${base} ${corners}`}>
                  {m.body && (
                    <p className="whitespace-pre-wrap text-[15px] leading-snug">{m.body}</p>
                  )}
                  {m.refs.map((ref) => (
                    <Link
                      key={`${ref.type}-${ref.id}`}
                      href={ref.href}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                        own ? "bg-white/15 text-white" : "bg-blush/60 text-wine"
                      }`}
                    >
                      <span className={`rounded-pill px-1.5 text-[10px] font-semibold uppercase ${own ? "bg-white/20" : "bg-white"}`}>
                        {ref.kindLabel}
                      </span>
                      <span className="truncate font-medium">{ref.title}</span>
                    </Link>
                  ))}
                  {m.excludedFromRecord && (
                    <span className={`text-[10px] ${own ? "text-white/70" : "text-whisper"}`}>
                      just between us
                    </span>
                  )}
                </div>
              </div>
              {m.id === lastSeenOwnId && (
                <p className="mt-0.5 pr-1 text-right text-[11px] text-whisper">Seen</p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── composer (pinned) ── */}
      {paused ? (
        <div className="border-t border-line bg-canvas px-4 py-3 pb-safe">
          <p className="text-center text-[13px] text-whisper">
            {viewerRole === "CLIENT"
              ? "This line is paused for now — anything urgent is best brought to your next session."
              : "You've paused this thread."}
          </p>
        </div>
      ) : (
        <div className="border-t border-line bg-canvas px-2 py-2 pb-safe">
          {pendingRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
              {pendingRefs.map((r) => (
                <span key={`${r.type}-${r.id}`} className="inline-flex items-center gap-1.5 rounded-pill bg-blush-deep px-2.5 py-0.5 text-[12px] text-wine">
                  {r.label}
                  <button
                    onClick={() => setPendingRefs((p) => p.filter((x) => !(x.type === r.type && x.id === r.id)))}
                    aria-label="Remove reference"
                    className="text-mocha hover:text-wine"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          {offRecord && (
            <p className="px-1 pb-1 text-[11px] text-whisper">just between us — this won&apos;t join the record</p>
          )}
          <div className="flex items-end gap-1.5">
            <button
              onClick={() => setPlusOpen(true)}
              aria-label="Add"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-lg text-mocha hover:text-wine"
            >
              ＋
            </button>
            <textarea
              ref={inputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={1}
              placeholder={`Write to ${counterpartName}…`}
              className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-[18px] border border-line bg-surface px-3.5 py-1.5 text-[16px] leading-relaxed text-ink outline-none placeholder:text-whisper focus:border-wine"
            />
            <button
              onClick={onSend}
              disabled={sending || (!body.trim() && pendingRefs.length === 0)}
              aria-label="Send"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wine text-white transition-opacity disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ＋ sheet: references + off-record toggle + the standing frame */}
      <Sheet open={plusOpen} onClose={() => setPlusOpen(false)} title="Add to this message">
        <div className="flex flex-col gap-4">
          <label className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-[15px] font-medium text-ink-strong">Just between us</span>
              <span className="text-[12px] text-whisper">Keep this message out of the record</span>
            </span>
            <input
              type="checkbox"
              checked={offRecord}
              onChange={(e) => setOffRecord(e.target.checked)}
              className="h-5 w-5 accent-wine"
            />
          </label>
          {refGroups.length > 0 && (
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto border-t border-line pt-3">
              {refGroups.map((g) => (
                <div key={g.type} className="flex flex-col gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">{g.label}</p>
                  {g.options.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        if (!pendingRefs.some((r) => r.type === g.type && r.id === o.id) && pendingRefs.length < 6) {
                          setPendingRefs((p) => [...p, { type: g.type, id: o.id, label: o.label }]);
                        }
                        setPlusOpen(false);
                      }}
                      className="rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-blush hover:text-wine"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          {viewerRole === "CLIENT" && (
            <p className="border-t border-line pt-3 text-[12px] leading-relaxed text-whisper">
              A space for reflection between sessions — not for emergencies. Need help now?{" "}
              {crisisResources.map((r) => `${r.label} (${r.detail})`).join(" · ")}
            </p>
          )}
        </div>
      </Sheet>

      {/* thread options (pause / acknowledge) */}
      {menu && (
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="This conversation">
          {menu}
        </Sheet>
      )}
    </div>
  );
}

function sameList(a: MessageView[], b: MessageView[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].readAt !== b[i].readAt || a[i].deliveredAt !== b[i].deliveredAt) return false;
  }
  return true;
}
