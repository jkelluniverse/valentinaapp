"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MessageView } from "@/lib/messaging";
import type { RefType } from "@/lib/message-refs";

// C15.5 — the thread. iMessage's warmth, minus its pressure: Warm Stone
// bubbles, reference cards inline, a quiet delivered/seen, no unread counts,
// no typing surveillance. A letter exchange that happens to be fast.

type RefGroup = { type: RefType; label: string; options: { id: string; label: string }[] };
type PendingRef = { type: RefType; id: string; label: string };

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

export function MessageThread({
  viewerRole,
  initial,
  refGroups,
  paused,
  awayNote,
  responseRhythm,
  crisisResources,
  send,
  poll,
}: {
  viewerRole: "CLIENT" | "PRACTITIONER";
  initial: MessageView[];
  refGroups: RefGroup[];
  paused: boolean;
  awayNote: string | null;
  responseRhythm: string;
  crisisResources: { label: string; detail: string }[];
  send: (formData: FormData) => Promise<{ ok: boolean; crisis?: boolean; error?: string }>;
  poll: () => Promise<MessageView[]>;
}) {
  const [messages, setMessages] = useState<MessageView[]>(initial);
  const [body, setBody] = useState("");
  const [pendingRefs, setPendingRefs] = useState<PendingRef[]>([]);
  const [offRecord, setOffRecord] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const polling = useRef(false);

  const scrollToEnd = () => endRef.current?.scrollIntoView({ block: "end" });

  useEffect(() => {
    scrollToEnd();
  }, []);

  // Gentle short-poll for new messages + read receipts. Async by nature — this
  // just keeps an open thread fresh; delivery doesn't depend on it.
  useEffect(() => {
    const tick = async () => {
      if (polling.current || document.hidden) return;
      polling.current = true;
      try {
        const next = await poll();
        setMessages((prev) => (sameList(prev, next) ? prev : next));
      } catch {
        /* keep the last good state */
      } finally {
        polling.current = false;
      }
    };
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length]);

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
        const next = await poll();
        setMessages(next);
      }
    } finally {
      setSending(false);
    }
  }

  function addRef(type: RefType, id: string, label: string) {
    if (!pendingRefs.some((r) => r.type === type && r.id === id) && pendingRefs.length < 6) {
      setPendingRefs((p) => [...p, { type, id, label }]);
    }
    setPickerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Crisis resources — shown after a crisis-signal message (client). */}
      {showCrisis && (
        <div className="flex flex-col gap-2 rounded-card border-2 border-rose bg-surface p-6 shadow-card">
          <p className="font-headline text-xl font-medium text-rose">You deserve support right now.</p>
          <p className="text-sm leading-relaxed text-ink">
            This line isn&apos;t for emergencies, and I don&apos;t want you waiting on a reply.
            Please reach out to someone who can be there immediately — Valentina has been let know too.
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

      {/* The thread */}
      <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto rounded-card border border-line bg-canvas p-4 sm:p-6">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-whisper">
            {viewerRole === "CLIENT"
              ? "The start of your open line with Valentina. Say anything — a question, how something landed."
              : "No messages yet."}
          </p>
        ) : (
          messages.map((m, i) => {
            const own = m.role === viewerRole;
            const showDay = i === 0 || fmtDay(m.createdAt) !== fmtDay(messages[i - 1].createdAt);
            const isLastOwn = own && !messages.slice(i + 1).some((x) => x.role === viewerRole);
            return (
              <div key={m.id} className="flex flex-col gap-2">
                {showDay && (
                  <p className="py-1 text-center text-[13px] text-whisper">{fmtDay(m.createdAt)}</p>
                )}
                <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`flex max-w-[80%] flex-col gap-2 rounded-2xl px-4 py-3 shadow-soft ${
                      m.role === "PRACTITIONER"
                        ? "bg-blush-deep"
                        : "bg-surface border border-line"
                    }`}
                  >
                    {m.body && (
                      <p className="whitespace-pre-wrap leading-relaxed text-ink">{m.body}</p>
                    )}
                    {m.refs.map((ref) => (
                      <Link
                        key={`${ref.type}-${ref.id}`}
                        href={ref.href}
                        className="flex flex-col gap-0.5 rounded-lg border border-mocha/60 bg-surface/70 px-3 py-2 transition-colors hover:bg-blush"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
                          {ref.kindLabel}
                        </span>
                        <span className="text-sm font-medium text-ink-strong">{ref.title}</span>
                        {ref.context && <span className="text-[13px] text-whisper">{ref.context}</span>}
                      </Link>
                    ))}
                    <span className="flex items-center gap-2 text-[11px] text-whisper">
                      {m.excludedFromRecord && <span title="Kept out of the record">· just between us</span>}
                      {m.safetyFlag && viewerRole === "PRACTITIONER" && (
                        <span className="font-medium text-rose">· reached out in distress</span>
                      )}
                      <span className="ml-auto">{fmtTime(m.createdAt)}</span>
                    </span>
                    {isLastOwn && (
                      <span className="text-right text-[11px] text-whisper">
                        {m.readAt ? "Seen" : "Delivered"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      {paused ? (
        <p className="rounded-card border border-line bg-surface px-5 py-4 text-sm text-ink">
          {viewerRole === "CLIENT"
            ? "This line is paused for now. Anything urgent is best brought to your next session."
            : "You've paused this thread — reopen it from the thread settings when you're ready."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {pendingRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingRefs.map((r) => (
                <span
                  key={`${r.type}-${r.id}`}
                  className="inline-flex items-center gap-2 rounded-pill bg-blush-deep px-3 py-1 text-xs text-wine"
                >
                  {r.label}
                  <button
                    type="button"
                    onClick={() => setPendingRefs((p) => p.filter((x) => !(x.type === r.type && x.id === r.id)))}
                    className="text-mocha hover:text-wine"
                    aria-label="Remove reference"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {pickerOpen && refGroups.length > 0 && (
            <div className="flex max-h-56 flex-col gap-3 overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-card">
              {refGroups.map((g) => (
                <div key={g.type} className="flex flex-col gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">{g.label}</p>
                  {g.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => addRef(g.type, o.id, o.label)}
                      className="rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-blush hover:text-wine"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-card border border-line bg-surface p-2 shadow-soft">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={2}
              placeholder="Write to Valentina…"
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-ink outline-none placeholder:text-whisper"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={sending || (!body.trim() && pendingRefs.length === 0)}
              className="mb-1 rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-40"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 px-1 text-[13px] text-whisper">
            {refGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="font-medium text-wine underline-offset-4 hover:underline"
              >
                ＋ reference
              </button>
            )}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={offRecord}
                onChange={(e) => setOffRecord(e.target.checked)}
                className="h-3.5 w-3.5 accent-wine"
              />
              just between us
            </label>
            <span className="ml-auto">{awayNote || responseRhythm}</span>
          </div>

          <details className="px-1">
            <summary className="cursor-pointer list-none text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
              A space for reflection between sessions — not for emergencies. Need help now?
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-1">
              {crisisResources.map((r) => (
                <li key={r.label} className="text-[13px] text-ink">
                  <span className="font-semibold text-wine">{r.label}</span> — {r.detail}
                </li>
              ))}
            </ul>
          </details>
        </div>
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
