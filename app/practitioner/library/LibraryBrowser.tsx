"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/mobile/Sheet";
import {
  createFolder,
  renameFolder,
  renameItem,
  moveFolder,
  moveItem,
  duplicateItem,
  trashFolder,
  trashItem,
  createDoc,
  updateDoc,
  createLink,
} from "./folder-actions";
import { setIntakeWorksheet } from "./actions";

export type Crumb = { id: string | null; name: string };
export type FolderTile = { id: string; name: string; isDefault: boolean; childCount: number };
export type ItemView = {
  id: string;
  kind: string;
  name: string;
  href: string | null;
  external: boolean;
  body: string | null;
  refId: string | null;
  isIntake?: boolean;
};
export type MoveOption = { id: string; name: string; depth: number };
type Target = {
  type: "folder" | "item";
  id: string;
  name: string;
  kind?: string;
  refId?: string | null;
  isIntake?: boolean;
} | null;

const KIND_LABEL: Record<string, string> = {
  WORKSHEET: "Worksheet",
  PROMPT: "Prompt",
  COURSE: "Course",
  DOC: "Doc",
  LINK: "Link",
  FILE: "File",
};

export function LibraryBrowser({
  folderId,
  breadcrumb,
  subfolders,
  items,
  view,
  sort,
  q,
  canAddItems,
  itemMoveOptions,
  folderMoveOptions,
  worksheetStudioHref,
  promptStudioHref,
}: {
  folderId: string | null;
  breadcrumb: Crumb[];
  subfolders: FolderTile[];
  items: ItemView[];
  view: "grid" | "list";
  sort: string;
  q: string;
  canAddItems: boolean;
  itemMoveOptions: MoveOption[];
  folderMoveOptions: MoveOption[];
  worksheetStudioHref: string;
  promptStudioHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<Target>(null);
  const [moveFor, setMoveFor] = useState<Target>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [docEditor, setDocEditor] = useState<{ id?: string; name: string; body: string } | null>(null);
  const [linkForm, setLinkForm] = useState<{ name: string; url: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
      setMenuFor(null);
      setMoveFor(null);
    }
  }

  function startRename(t: Target) {
    if (!t) return;
    setRenaming(`${t.type}:${t.id}`);
    setRenameValue(t.name);
    setMenuFor(null);
  }
  async function commitRename(t: { type: "folder" | "item"; id: string }) {
    const key = `${t.type}:${t.id}`;
    if (renaming !== key) return;
    const val = renameValue.trim();
    setRenaming(null);
    if (val) await run(() => (t.type === "folder" ? renameFolder(t.id, val) : renameItem(t.id, val)));
  }

  // ---- URL param helpers (view / sort / search) ----
  function setParam(k: string, v: string | null) {
    const params = new URLSearchParams();
    if (folderId) params.set("folder", folderId);
    if (view) params.set("view", view);
    if (sort) params.set("sort", sort);
    if (q) params.set("q", q);
    if (v === null) params.delete(k);
    else params.set(k, v);
    if (!folderId) params.delete("folder");
    router.push(`/practitioner/library?${params.toString()}`);
  }
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParam("q", searchRef.current?.value || null);
  }

  // ---- desktop drag & drop ----
  function onDropInto(targetFolderId: string) {
    if (!dragId) return;
    const [type, id] = dragId.split(":");
    const fn =
      type === "folder"
        ? () => moveFolder(id, targetFolderId)
        : () => moveItem(id, targetFolderId);
    setDragId(null);
    void run(fn);
  }

  const grid = view === "grid";

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb + search */}
      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-[15px]">
          {breadcrumb.map((c, i) => {
            const last = i === breadcrumb.length - 1;
            const href = c.id ? `/practitioner/library?folder=${c.id}` : "/practitioner/library";
            return (
              <span key={c.id ?? "root"} className="flex items-center gap-1">
                {i > 0 && <span className="text-whisper">/</span>}
                {last ? (
                  <span className="font-semibold text-ink-strong">{c.name}</span>
                ) : (
                  <Link
                    href={href}
                    onDragOver={(e) => dragId && e.preventDefault()}
                    onDrop={() => onDropInto(c.id ?? "__root__")}
                    className="rounded px-1 text-slate underline-offset-4 hover:text-wine hover:underline"
                  >
                    {c.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <input
            ref={searchRef}
            name="q"
            defaultValue={q}
            placeholder="Search the whole library…"
            className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
          />
          <button className="rounded-md border border-mocha px-3 py-2 text-sm font-medium text-wine hover:bg-blush">
            Search
          </button>
          {q && (
            <Link href="/practitioner/library" className="text-[13px] text-whisper hover:text-wine">
              clear
            </Link>
          )}
        </form>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-wine px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
        >
          ＋ New
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line">
            <button
              onClick={() => setParam("view", "grid")}
              aria-pressed={grid}
              className={`px-3 py-1.5 text-sm ${grid ? "bg-blush text-wine" : "text-slate hover:text-wine"}`}
            >
              Grid
            </button>
            <button
              onClick={() => setParam("view", "list")}
              aria-pressed={!grid}
              className={`px-3 py-1.5 text-sm ${!grid ? "bg-blush text-wine" : "text-slate hover:text-wine"}`}
            >
              List
            </button>
          </div>
          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="rounded-md border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-wine"
            aria-label="Sort"
          >
            <option value="name">Name</option>
            <option value="recent">Recent</option>
            <option value="type">Type</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {subfolders.length === 0 && items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-white/60 px-5 py-10 text-center text-slate">
          Nothing here yet — <button onClick={() => setNewOpen(true)} className="font-medium text-wine underline-offset-4 hover:underline">＋ New</button> to add a folder or document.
        </p>
      ) : (
        <div className={grid ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "flex flex-col divide-y divide-line rounded-card border border-line bg-white"}>
          {/* Folders first */}
          {subfolders.map((f) => {
            const key = `folder:${f.id}`;
            const isRenaming = renaming === key;
            return (
              <div
                key={f.id}
                draggable={!isRenaming}
                onDragStart={() => setDragId(key)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => dragId && dragId !== key && e.preventDefault()}
                onDrop={() => onDropInto(f.id)}
                className={
                  grid
                    ? "group relative flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-white p-4 pr-10 shadow-soft transition-shadow hover:shadow-card"
                    : "group relative flex items-center gap-3 px-4 py-3"
                }
              >
                <Link href={`/practitioner/library?folder=${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <FolderGlyph />
                  {isRenaming ? (
                    <RenameInput
                      value={renameValue}
                      onChange={setRenameValue}
                      onCommit={() => commitRename({ type: "folder", id: f.id })}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-strong">{f.name}</span>
                      <span className="text-[13px] text-whisper">
                        {f.childCount === 0 ? "empty" : f.childCount === 1 ? "1 item" : `${f.childCount} items`}
                      </span>
                    </span>
                  )}
                </Link>
                <button
                  onClick={() => setMenuFor({ type: "folder", id: f.id, name: f.name })}
                  aria-label="Folder actions"
                  className={`${grid ? "absolute right-2 top-2" : ""} shrink-0 rounded-pill px-2 py-1 text-mocha hover:bg-blush`}
                >
                  ⋯
                </button>
              </div>
            );
          })}

          {/* Items */}
          {items.map((it) => {
            const key = `item:${it.id}`;
            const isRenaming = renaming === key;
            const body = (
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <ItemGlyph kind={it.kind} />
                {isRenaming ? (
                  <RenameInput
                    value={renameValue}
                    onChange={setRenameValue}
                    onCommit={() => commitRename({ type: "item", id: it.id })}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-strong">{it.name}</span>
                    <span className="text-[13px] text-whisper">{KIND_LABEL[it.kind] ?? it.kind}</span>
                  </span>
                )}
              </span>
            );
            return (
              <div
                key={it.id}
                draggable={!isRenaming}
                onDragStart={() => setDragId(key)}
                onDragEnd={() => setDragId(null)}
                className={
                  grid
                    ? "group relative flex flex-col gap-2 overflow-hidden rounded-card border border-line bg-white p-4 pr-10 shadow-soft transition-shadow hover:shadow-card"
                    : "group relative flex items-center gap-3 px-4 py-3"
                }
              >
                {isRenaming || !it.href ? (
                  it.kind === "DOC" && !isRenaming ? (
                    <button onClick={() => setDocEditor({ id: it.id, name: it.name, body: it.body ?? "" })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {body}
                    </button>
                  ) : (
                    body
                  )
                ) : it.external ? (
                  <a href={it.href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                    {body}
                  </a>
                ) : (
                  <Link href={it.href} className="flex min-w-0 flex-1 items-center gap-3">
                    {body}
                  </Link>
                )}
                <button
                  onClick={() =>
                    setMenuFor({
                      type: "item",
                      id: it.id,
                      name: it.name,
                      kind: it.kind,
                      refId: it.refId,
                      isIntake: it.isIntake,
                    })
                  }
                  aria-label="Item actions"
                  className={`${grid ? "absolute right-2 top-2" : ""} shrink-0 rounded-pill px-2 py-1 text-mocha hover:bg-blush`}
                >
                  ⋯
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ⋯ action sheet */}
      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <ul className="flex flex-col">
            <SheetAction label="Rename" onClick={() => startRename(menuFor)} />
            <SheetAction
              label="Move to…"
              onClick={() => {
                setMoveFor(menuFor);
                setMenuFor(null);
              }}
            />
            {menuFor.type === "item" && menuFor.kind === "WORKSHEET" && menuFor.refId && (
              <SheetAction
                label={menuFor.isIntake ? "Unset as intake" : "Set as intake"}
                hint="The intake is auto-assigned to every new client"
                onClick={() => run(() => setIntakeWorksheet(menuFor.refId!, !menuFor.isIntake))}
              />
            )}
            {menuFor.type === "item" && (
              <SheetAction label="Duplicate" onClick={() => run(() => duplicateItem(menuFor.id))} />
            )}
            <SheetAction
              label="Delete"
              danger
              onClick={() =>
                run(() => (menuFor.type === "folder" ? trashFolder(menuFor.id) : trashItem(menuFor.id)))
              }
            />
          </ul>
        )}
      </Sheet>

      {/* Move-to sheet */}
      <Sheet open={!!moveFor} onClose={() => setMoveFor(null)} title="Move to…">
        {moveFor && (
          <ul className="flex flex-col">
            {(moveFor.type === "folder" ? folderMoveOptions : itemMoveOptions).map((o) => (
              <li key={o.id}>
                <button
                  onClick={() =>
                    run(() =>
                      moveFor.type === "folder"
                        ? moveFolder(moveFor.id, o.id)
                        : moveItem(moveFor.id, o.id),
                    )
                  }
                  className="flex min-h-[48px] w-full items-center border-b border-line text-left text-[15px] text-ink last:border-0 hover:text-wine"
                  style={{ paddingLeft: `${o.depth * 16}px` }}
                >
                  {o.depth > 0 && <span className="mr-2 text-whisper">↳</span>}
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {/* New sheet */}
      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Add to this folder">
        <ul className="flex flex-col">
          <SheetAction
            label="New folder"
            hint="A place to organize"
            onClick={async () => {
              setNewOpen(false);
              await run(() => createFolder(folderId, "New folder"));
            }}
          />
          {canAddItems ? (
            <>
              <SheetLink label="New worksheet" hint="Opens the studio; files under Worksheets" href={worksheetStudioHref} onClick={() => setNewOpen(false)} />
              <SheetLink label="New prompt / exercise" hint="Opens the studio; files under Exercises & Prompts" href={promptStudioHref} onClick={() => setNewOpen(false)} />
              <SheetAction
                label="New doc"
                hint="A simple written note"
                onClick={() => {
                  setNewOpen(false);
                  setDocEditor({ name: "", body: "" });
                }}
              />
              <SheetAction
                label="Add a link"
                hint="A URL to an outside resource"
                onClick={() => {
                  setNewOpen(false);
                  setLinkForm({ name: "", url: "" });
                }}
              />
              <li className="flex min-h-[56px] flex-col justify-center gap-0.5 py-3 opacity-60">
                <span className="text-[15px] font-medium text-ink-strong">Upload a file</span>
                <span className="text-[13px] text-whisper">
                  Needs file storage — ask to enable uploads (PDFs, images, video).
                </span>
              </li>
            </>
          ) : (
            <li className="py-3 text-[13px] text-whisper">
              Open a folder to add documents. Up here, add folders to organize.
            </li>
          )}
        </ul>
      </Sheet>

      {/* Doc editor */}
      <Sheet open={!!docEditor} onClose={() => setDocEditor(null)} title={docEditor?.id ? "Edit doc" : "New doc"}>
        {docEditor && (
          <div className="flex flex-col gap-3">
            <input
              value={docEditor.name}
              onChange={(e) => setDocEditor({ ...docEditor, name: e.target.value })}
              placeholder="Title"
              className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
            />
            <textarea
              value={docEditor.body}
              onChange={(e) => setDocEditor({ ...docEditor, body: e.target.value })}
              rows={8}
              placeholder="Write…"
              className="resize-y rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
            />
            <button
              disabled={busy}
              onClick={async () => {
                const d = docEditor;
                setDocEditor(null);
                if (d.id) await run(() => updateDoc(d.id!, d.name, d.body));
                else if (folderId) await run(() => createDoc(folderId, d.name, d.body));
              }}
              className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white hover:bg-wine-dark disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </Sheet>

      {/* Link form */}
      <Sheet open={!!linkForm} onClose={() => setLinkForm(null)} title="Add a link">
        {linkForm && (
          <div className="flex flex-col gap-3">
            <input
              value={linkForm.url}
              onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })}
              placeholder="https://…"
              className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
            />
            <input
              value={linkForm.name}
              onChange={(e) => setLinkForm({ ...linkForm, name: e.target.value })}
              placeholder="Name (optional)"
              className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
            />
            <button
              disabled={busy || !folderId}
              onClick={async () => {
                const l = linkForm;
                setLinkForm(null);
                if (folderId) await run(() => createLink(folderId, l.name, l.url));
              }}
              className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white hover:bg-wine-dark disabled:opacity-50"
            >
              Add link
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function SheetAction({
  label,
  hint,
  danger,
  onClick,
}: {
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex min-h-[52px] w-full flex-col justify-center gap-0.5 border-b border-line py-3 text-left last:border-0"
      >
        <span className={`text-[15px] font-medium ${danger ? "text-rose" : "text-ink-strong"}`}>{label}</span>
        {hint && <span className="text-[13px] text-whisper">{hint}</span>}
      </button>
    </li>
  );
}

function SheetLink({ label, hint, href, onClick }: { label: string; hint?: string; href: string; onClick: () => void }) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="flex min-h-[52px] flex-col justify-center gap-0.5 border-b border-line py-3 last:border-0"
      >
        <span className="text-[15px] font-medium text-ink-strong">{label}</span>
        {hint && <span className="text-[13px] text-whisper">{hint}</span>}
      </Link>
    </li>
  );
}

function RenameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onCommit}
      className="w-full rounded border border-wine bg-white px-2 py-1 text-ink outline-none"
    />
  );
}

function FolderGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="shrink-0 text-mocha" aria-hidden>
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h7A1.5 1.5 0 0 1 19 8.5v9A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5v-11Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h7A1.5 1.5 0 0 1 19 8.5v9A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ItemGlyph({ kind }: { kind: string }) {
  const glyph = kind === "LINK" ? "🔗" : kind === "COURSE" ? "◈" : kind === "WORKSHEET" ? "▤" : kind === "PROMPT" ? "❝" : "▦";
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-mocha" aria-hidden>
      {glyph}
    </span>
  );
}
