"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/mobile/Sheet";
import { ConstellationMap, type RenderNode, type RenderEdge } from "./ConstellationMap";
import {
  extract,
  addNode,
  editNode,
  setNodeState,
  dismissSuggestion,
  mergeNodes,
  archiveNode,
  addEdge,
  deleteEdge,
  nodeToNote,
  setNotesSource,
} from "@/app/practitioner/clients/[clientId]/psyche-actions";

// C16.3/4/6 — the constellation workbench: lenses, search, the time scrub, and
// the node panel where Valentina curates truth into the map.

export type PanelNode = {
  id: string;
  kind: string;
  label: string;
  description: string | null;
  source: string;
  state: string;
  weight: number;
  glow: number;
  giftLabel: string | null;
  suggestedState: string | null;
  suggestedReason: string | null;
  selfX: number | null;
  selfY: number | null;
  createdAt: string;
  evidence: { id: string; kind: string; title: string | null; snippet: string; occurredAt: string }[];
};
export type PanelEdge = { id: string; from: string; to: string; relation: string; weight: number };

const KIND_LABEL: Record<string, string> = {
  WOUND: "Wound",
  SHADOW: "Shadow",
  CORE_BELIEF: "Core belief",
  PROTECTION: "Protection",
  PATTERN: "Pattern",
  BEHAVIOR: "Behavior",
  TRAIT: "Trait",
  RESOURCE: "Resource",
  GIFT: "Gift",
};
const REL_LABEL: Record<string, string> = {
  DRIVES: "drives",
  PROTECTS_FROM: "protects from",
  EXPRESSES_AS: "expresses as",
  ROOTED_IN: "rooted in",
  REINFORCES: "reinforces",
  SOFTENED_BY: "softened by",
};
const KIND_GROUPS: { key: string; label: string; kinds: string[] }[] = [
  { key: "wounds", label: "Wounds & shadows", kinds: ["WOUND", "SHADOW"] },
  { key: "beliefs", label: "Beliefs", kinds: ["CORE_BELIEF"] },
  { key: "protections", label: "Protections", kinds: ["PROTECTION"] },
  { key: "patterns", label: "Patterns", kinds: ["PATTERN", "BEHAVIOR"] },
  { key: "strengths", label: "Strengths & gifts", kinds: ["TRAIT", "RESOURCE", "GIFT"] },
];

function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

export function MapWorkbench({
  clientId,
  nodes,
  edges,
  lastRunAt,
  notesEnabled,
}: {
  clientId: string;
  nodes: PanelNode[];
  edges: PanelEdge[];
  lastRunAt: string | null;
  notesEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [groupLens, setGroupLens] = useState<string | null>(null);
  const [stateLens, setStateLens] = useState<"all" | "LOOSENING" | "INTEGRATED">("all");
  const [sourceLens, setSourceLens] = useState<"all" | "self" | "ai">("all");
  const [scrub, setScrub] = useState(100);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [giftAsk, setGiftAsk] = useState("");

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const renderNodes: RenderNode[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        state: n.state,
        source: n.source,
        weight: n.weight,
        glow: n.glow,
        hasSuggestion: !!n.suggestedState,
        selfX: n.selfX,
        selfY: n.selfY,
        createdAt: new Date(n.createdAt).getTime(),
      })),
    [nodes],
  );
  const renderEdges: RenderEdge[] = useMemo(
    () => edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight })),
    [edges],
  );

  // Lenses → the lit set (others recede).
  const visibleIds = useMemo(() => {
    if (!groupLens && stateLens === "all" && sourceLens === "all") return null;
    const kinds = groupLens ? new Set(KIND_GROUPS.find((g) => g.key === groupLens)?.kinds) : null;
    return new Set(
      nodes
        .filter((n) => {
          if (kinds && !kinds.has(n.kind)) return false;
          if (stateLens !== "all" && n.state !== stateLens) return false;
          if (sourceLens === "self" && n.source !== "SELF_REPORTED") return false;
          if (sourceLens === "ai" && n.source !== "AI_EXTRACTED") return false;
          return true;
        })
        .map((n) => n.id),
    );
  }, [nodes, groupLens, stateLens, sourceLens]);

  // Time scrub across the relationship (§4).
  const [minT, maxT] = useMemo(() => {
    const ts = nodes.map((n) => new Date(n.createdAt).getTime());
    return ts.length ? [Math.min(...ts), Date.now()] : [0, 0];
  }, [nodes]);
  const cutoff = scrub >= 100 ? null : minT + ((maxT - minT) * scrub) / 100;

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(label);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) setNotice(res.error === "consent" ? "No consent on file — the map can't run." : res.error === "empty" ? "Nothing new to read yet." : "That didn't go through — try again.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // Extraction closes its own loop — a zero-result read shouldn't look broken.
  async function runExtract(label: string, deep: boolean) {
    if (busy) return;
    setBusy(label);
    setNotice(null);
    try {
      const res = await extract(clientId, deep);
      if (!res.ok) {
        setNotice(
          res.error === "consent"
            ? "No consent on file — the map can't run."
            : res.error === "empty"
              ? "Nothing new in the record to read yet — it fills as they reflect."
              : "That didn't go through — try again.",
        );
      } else if (res.referral) {
        setNotice("Something in the recent material needs a person — please review it directly, not the map.");
      } else if ((res.created ?? 0) + (res.updated ?? 0) === 0) {
        setNotice(
          deep
            ? "Read the whole record — nothing firm enough to add yet. The map stays conservative on purpose; it grows as patterns repeat."
            : "Read the new material — nothing firm enough to map yet. Single moments rarely become nodes; the constellation fills in as themes recur.",
        );
      } else {
        setNotice(
          `Read the material — ${res.created ? `added ${res.created} ${res.created === 1 ? "star" : "stars"}` : "added none"}${res.updated ? `, deepened ${res.updated}` : ""}.`,
        );
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function doSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const hit = nodes.find((n) => n.label.toLowerCase().includes(q));
    if (hit) {
      setSelectedId(hit.id);
      setFocusId(null);
      requestAnimationFrame(() => setFocusId(hit.id));
    } else setNotice("No star by that name yet.");
  }

  const neighborEdges = selected ? edges.filter((e) => e.from === selected.id || e.to === selected.id) : [];
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? "—";

  const panelBody = selected && (
    <div className="flex flex-col gap-4 text-cream">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-pill border border-white/25 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
          {KIND_LABEL[selected.kind]}
        </span>
        <span className="rounded-pill border border-white/25 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
          {selected.state.toLowerCase()}
        </span>
        {selected.source === "SELF_REPORTED" && (
          <span className="rounded-pill bg-[#D4A860]/20 px-2.5 py-0.5 text-[11px] text-[#E8C687]">
            they see this themselves
          </span>
        )}
        <span className="ml-auto text-[11px] text-white/40">since {fmtDay(selected.createdAt)}</span>
      </div>

      {/* AI suggestion — hers to confirm (§5). */}
      {selected.suggestedState && (
        <div className="rounded-lg border border-[#D4A860]/50 bg-[#D4A860]/10 p-3">
          <p className="text-sm text-[#E8C687]">
            The data suggests this is <span className="font-semibold">loosening</span>
            {selected.suggestedReason ? ` — ${selected.suggestedReason}` : ""}.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => run("state", () => setNodeState(clientId, selected.id, "LOOSENING"))}
              className="rounded-md bg-[#D4A860] px-3 py-1 text-xs font-semibold text-[#191114]"
            >
              Yes — mark loosening
            </button>
            <button
              onClick={() => run("state", () => dismissSuggestion(clientId, selected.id))}
              className="rounded-md border border-white/25 px-3 py-1 text-xs text-white/75"
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      {selected.description && <p className="text-sm leading-relaxed text-white/85">{selected.description}</p>}

      {selected.giftLabel && selected.state !== "INTEGRATED" && (
        <p className="text-sm text-[#E8C687]">
          Gift direction → <span className="font-medium">{selected.giftLabel}</span>
        </p>
      )}

      {/* Evidence — every claim opens the client's actual words. */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
          Evidence · {selected.evidence.length}
        </p>
        {selected.evidence.length === 0 ? (
          <p className="text-[13px] text-white/50">
            {selected.source === "PRACTITIONER" ? "Placed by you." : "Placed by the client — their own naming is the evidence."}
          </p>
        ) : (
          selected.evidence.slice(0, 12).map((ev) => (
            <details key={ev.id} className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <summary className="cursor-pointer list-none text-[13px] text-white/80">
                {ev.title || ev.kind.toLowerCase().replace("_", " ")}{" "}
                <span className="text-white/40">· {fmtDay(ev.occurredAt)}</span>
              </summary>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-white/70">{ev.snippet}</p>
            </details>
          ))
        )}
      </div>

      {/* Connections. */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
          Connections · {neighborEdges.length}
        </p>
        {neighborEdges.map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-[13px] text-white/75">
            <span className="min-w-0 flex-1 truncate">
              {e.from === selected.id ? (
                <>
                  {REL_LABEL[e.relation] ?? e.relation} <button onClick={() => { setSelectedId(e.to); setFocusId(e.to); }} className="text-[#E8C687] underline-offset-2 hover:underline">{nameOf(e.to)}</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setSelectedId(e.from); setFocusId(e.from); }} className="text-[#E8C687] underline-offset-2 hover:underline">{nameOf(e.from)}</button> {REL_LABEL[e.relation] ?? e.relation} this
                </>
              )}
            </span>
            <button
              onClick={() => run("edge", () => deleteEdge(clientId, e.id))}
              aria-label="Remove connection"
              className="text-white/35 hover:text-white/80"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={() => setEdgeOpen(true)} className="self-start text-[13px] text-[#E8C687] underline-offset-2 hover:underline">
          ＋ connect to…
        </button>
      </div>

      {/* The liberation arc — hers to declare. */}
      <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">State</p>
        <div className="flex flex-wrap gap-2">
          {(["ACTIVE", "LOOSENING"] as const).map((s) => (
            <button
              key={s}
              disabled={selected.state === s}
              onClick={() => run("state", () => setNodeState(clientId, selected.id, s))}
              className={`rounded-pill px-3 py-1 text-xs ${selected.state === s ? "bg-white/20 text-white" : "border border-white/25 text-white/70 hover:text-white"}`}
            >
              {s === "ACTIVE" ? "Active" : "Loosening"}
            </button>
          ))}
          {selected.state !== "INTEGRATED" ? (
            <span className="flex items-center gap-1.5">
              <input
                value={giftAsk}
                onChange={(e) => setGiftAsk(e.target.value)}
                placeholder={selected.giftLabel ?? "its gift name…"}
                className="w-36 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/35"
              />
              <button
                onClick={() =>
                  run("state", () => setNodeState(clientId, selected.id, "INTEGRATED", giftAsk || undefined))
                }
                className="rounded-pill bg-[#D4A860] px-3 py-1 text-xs font-semibold text-[#191114]"
              >
                Integrated ✦
              </button>
            </span>
          ) : (
            <button
              onClick={() => run("state", () => setNodeState(clientId, selected.id, "ACTIVE"))}
              className="rounded-pill border border-white/25 px-3 py-1 text-xs text-white/70"
            >
              Reopen as active
            </button>
          )}
        </div>
      </div>

      {/* Actions. */}
      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-3 text-[13px]">
        <button onClick={() => setEditOpen(true)} className="text-white/75 underline-offset-2 hover:text-white hover:underline">
          Edit
        </button>
        <button onClick={() => setMergeOpen(true)} className="text-white/75 underline-offset-2 hover:text-white hover:underline">
          Merge into…
        </button>
        <button onClick={() => run("note", () => nodeToNote(clientId, selected.id))} className="text-white/75 underline-offset-2 hover:text-white hover:underline">
          Turn into a note
        </button>
        <button onClick={() => run("archive", () => archiveNode(clientId, selected.id)).then(() => setSelectedId(null))} className="ml-auto text-white/45 underline-offset-2 hover:text-white/80 hover:underline">
          Archive
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => runExtract("extract", false)}
          disabled={!!busy}
          className="rounded-lg bg-wine px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark disabled:opacity-50"
        >
          {busy === "extract" ? "Reading…" : "Read new material"}
        </button>
        <button
          onClick={() => runExtract("deep", true)}
          disabled={!!busy}
          title="Re-reads the whole record to catch slow arcs"
          className="rounded-lg border border-mocha px-3.5 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush disabled:opacity-50"
        >
          {busy === "deep" ? "Reading everything…" : "Deep pass"}
        </button>
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-mocha hover:text-wine"
        >
          ＋ Add a node
        </button>
        <form onSubmit={doSearch} className="ml-auto flex min-w-40 flex-1 items-center gap-1.5 sm:max-w-60">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a star…"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-wine"
          />
        </form>
      </div>

      {/* Lenses */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Chip active={!groupLens} onClick={() => setGroupLens(null)} label="Everything" />
        {KIND_GROUPS.map((g) => (
          <Chip key={g.key} active={groupLens === g.key} onClick={() => setGroupLens(groupLens === g.key ? null : g.key)} label={g.label} />
        ))}
        <span className="mx-1 text-line">·</span>
        <Chip active={stateLens === "LOOSENING"} onClick={() => setStateLens(stateLens === "LOOSENING" ? "all" : "LOOSENING")} label="What's loosening ✨" />
        <span className="mx-1 text-line">·</span>
        <Chip active={sourceLens === "self"} onClick={() => setSourceLens(sourceLens === "self" ? "all" : "self")} label="They see it" />
        <Chip active={sourceLens === "ai"} onClick={() => setSourceLens(sourceLens === "ai" ? "all" : "ai")} label="The data sees it" />
      </div>

      {notice && <p className="rounded-md bg-blush-deep px-4 py-2 text-sm text-wine">{notice}</p>}

      {/* The sky */}
      <div className="relative">
        <ConstellationMap
          nodes={renderNodes}
          edges={renderEdges}
          visibleIds={visibleIds}
          selectedId={selectedId}
          focusId={focusId}
          cutoff={cutoff}
          onSelect={setSelectedId}
        />
        {/* Desktop panel — overlaid on the night. */}
        {selected && (
          <div className="absolute right-3 top-3 hidden max-h-[calc(100%-1.5rem)] w-[22rem] flex-col overflow-y-auto rounded-card border border-white/15 bg-[#1f151b]/95 p-5 shadow-card backdrop-blur md:flex">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="font-headline text-xl font-medium text-cream">{selected.label}</h3>
              <button onClick={() => setSelectedId(null)} aria-label="Close" className="text-white/40 hover:text-white">
                ✕
              </button>
            </div>
            {panelBody}
          </div>
        )}
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-sm px-6 text-center text-sm text-white/60">
              An empty sky, for now — run <em>Read new material</em> and the constellation begins to
              form from their record.
            </p>
          </div>
        )}
      </div>

      {/* Time scrub — the story of the work, watchable. */}
      {nodes.length > 0 && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={scrub}
            onChange={(e) => setScrub(Number(e.target.value))}
            className="flex-1 accent-wine"
            aria-label="Replay the constellation over time"
          />
          <span className="w-28 shrink-0 text-right text-[12px] text-whisper">
            {cutoff == null ? "today" : new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(cutoff))}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-[12px] text-whisper">
        <span>{lastRunAt ? `Last read ${fmtDay(lastRunAt)}` : "Never read yet"}</span>
        <label className="ml-auto flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={notesEnabled}
            onChange={(e) => run("notes", () => setNotesSource(clientId, e.target.checked))}
            className="h-3.5 w-3.5 accent-wine"
          />
          let it read your Margins notes (as context, never evidence)
        </label>
      </div>

      {/* Mobile panel */}
      <div className="md:hidden">
        <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected?.label}>
          <div className="rounded-card bg-[#1f151b] p-4">{panelBody}</div>
        </Sheet>
      </div>

      {/* Add node */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add a node">
        <AddNodeForm
          onSubmit={async (input) => {
            setAddOpen(false);
            await run("add", () => addNode(clientId, input));
          }}
        />
      </Sheet>

      {/* Edit node */}
      <Sheet open={editOpen && !!selected} onClose={() => setEditOpen(false)} title="Edit — into truer language">
        {selected && (
          <EditNodeForm
            node={selected}
            onSubmit={async (input) => {
              setEditOpen(false);
              await run("edit", () => editNode(clientId, selected.id, input));
            }}
          />
        )}
      </Sheet>

      {/* Merge picker */}
      <Sheet open={mergeOpen && !!selected} onClose={() => setMergeOpen(false)} title={`Merge “${selected?.label}” into…`}>
        <ul className="flex max-h-80 flex-col overflow-y-auto">
          {nodes
            .filter((n) => n.id !== selected?.id)
            .map((n) => (
              <li key={n.id}>
                <button
                  onClick={async () => {
                    setMergeOpen(false);
                    if (selected) await run("merge", () => mergeNodes(clientId, n.id, selected.id));
                    setSelectedId(null);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-2 border-b border-line text-left text-[15px] text-ink last:border-0 hover:text-wine"
                >
                  <span className="text-[11px] uppercase text-whisper">{KIND_LABEL[n.kind]}</span> {n.label}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>

      {/* Add edge */}
      <Sheet open={edgeOpen && !!selected} onClose={() => setEdgeOpen(false)} title={`Connect “${selected?.label}”`}>
        {selected && (
          <AddEdgeForm
            others={nodes.filter((n) => n.id !== selected.id)}
            onSubmit={async (toId, relation) => {
              setEdgeOpen(false);
              await run("edge", () => addEdge(clientId, selected.id, toId, relation));
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-pill px-3 py-1 font-medium transition-colors ${active ? "bg-wine text-white" : "border border-line text-ink hover:bg-blush"}`}
    >
      {label}
    </button>
  );
}

const FIELD = "rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine";

function AddNodeForm({ onSubmit }: { onSubmit: (i: { kind: string; label: string; description?: string; giftLabel?: string }) => void }) {
  const [kind, setKind] = useState("WOUND");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [gift, setGift] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>
        {Object.entries(KIND_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='Short and human — "Not enough as I am"' className={FIELD} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="One plain paragraph (optional)" className={FIELD} />
      <input value={gift} onChange={(e) => setGift(e.target.value)} placeholder='Gift direction (optional) — "Sovereign worth"' className={FIELD} />
      <button
        disabled={!label.trim()}
        onClick={() => onSubmit({ kind, label, description: description || undefined, giftLabel: gift || undefined })}
        className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white hover:bg-wine-dark disabled:opacity-40"
      >
        Place the star
      </button>
    </div>
  );
}

function EditNodeForm({
  node,
  onSubmit,
}: {
  node: PanelNode;
  onSubmit: (i: { label: string; description: string; giftLabel: string }) => void;
}) {
  const [label, setLabel] = useState(node.label);
  const [description, setDescription] = useState(node.description ?? "");
  const [gift, setGift] = useState(node.giftLabel ?? "");
  return (
    <div className="flex flex-col gap-3">
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={FIELD} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={FIELD} />
      <input value={gift} onChange={(e) => setGift(e.target.value)} placeholder="Gift direction" className={FIELD} />
      <button
        disabled={!label.trim()}
        onClick={() => onSubmit({ label, description, giftLabel: gift })}
        className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white hover:bg-wine-dark disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function AddEdgeForm({
  others,
  onSubmit,
}: {
  others: PanelNode[];
  onSubmit: (toId: string, relation: string) => void;
}) {
  const [toId, setToId] = useState(others[0]?.id ?? "");
  const [relation, setRelation] = useState("DRIVES");
  return (
    <div className="flex flex-col gap-3">
      <select value={relation} onChange={(e) => setRelation(e.target.value)} className={FIELD}>
        {Object.entries(REL_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <select value={toId} onChange={(e) => setToId(e.target.value)} className={FIELD}>
        {others.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      <button
        disabled={!toId}
        onClick={() => onSubmit(toId, relation)}
        className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white hover:bg-wine-dark disabled:opacity-40"
      >
        Connect
      </button>
    </div>
  );
}
