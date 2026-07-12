import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import {
  ensureLibrary,
  getFolderView,
  foldersForPicker,
  searchLibrary,
  type SortKey,
} from "@/lib/library";
import { LibraryBrowser, type ItemView } from "./LibraryBrowser";
import { createSpiralAssessment } from "./actions";

export const dynamic = "force-dynamic";

// AMENDMENT-03 — the Library as folders on a computer. Opens to four doors, then
// folders all the way down with a breadcrumb back out. The C9 studio is
// unchanged; this is only where things live and how she moves them.

function itemHref(kind: string, refId: string | null, url: string | null): {
  href: string | null;
  external: boolean;
} {
  switch (kind) {
    case "WORKSHEET":
      return { href: refId ? `/practitioner/worksheets/${refId}` : null, external: false };
    case "PROMPT":
      return { href: refId ? `/practitioner/library/${refId}` : null, external: false };
    case "COURSE":
      return { href: refId ? `/practitioner/courses/${refId}` : null, external: false };
    case "LINK":
      return { href: url, external: true };
    default:
      return { href: null, external: false }; // DOC opens inline; FILE deferred
  }
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { folder?: string; view?: string; sort?: string; q?: string };
}) {
  const me = await requirePractitioner();
  await ensureLibrary(me.id);

  const q = (searchParams.q ?? "").trim();
  const view = searchParams.view === "list" ? "list" : "grid";
  const sort: SortKey =
    searchParams.sort === "recent" || searchParams.sort === "type" ? searchParams.sort : "name";
  const folderId = searchParams.folder ?? null;

  // Search across the whole library.
  if (q) {
    const hits = await searchLibrary(me.id, q);
    return (
      <div className="flex flex-col gap-6">
        <Header />
        <div className="flex items-center gap-3">
          <p className="text-[15px] text-ink">
            {hits.length === 0 ? "No matches" : `${hits.length} match${hits.length === 1 ? "" : "es"}`} for
            &ldquo;{q}&rdquo;
          </p>
          <Link href="/practitioner/library" className="text-[13px] text-whisper hover:text-wine">
            back to Library
          </Link>
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
          {hits.map((h) => {
            const href =
              h.type === "folder"
                ? `/practitioner/library?folder=${h.id}`
                : `/practitioner/library?folder=${h.folderId}`;
            return (
              <li key={`${h.type}-${h.id}`}>
                <Link href={href} className="flex items-center gap-3 px-5 py-3 hover:bg-blush/40">
                  <span className="text-mocha">{h.type === "folder" ? "📁" : "▦"}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-strong">{h.name}</span>
                    <span className="text-[13px] text-whisper">
                      {h.type === "folder" ? "Folder" : `${h.kind} · in ${h.where}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const viewData = await getFolderView(me.id, folderId, sort);
  const [intakeRows, spiral] = await Promise.all([
    prisma.worksheet.findMany({ where: { isIntake: true }, select: { id: true } }),
    prisma.worksheet.findFirst({ where: { isSpiral: true }, select: { id: true } }),
  ]);
  const intakeIds = new Set(intakeRows.map((w) => w.id));
  const items: ItemView[] = viewData.items.map((it) => {
    const { href, external } = itemHref(it.kind, it.refId, it.url);
    return {
      id: it.id,
      kind: it.kind,
      name: it.name,
      href,
      external,
      body: it.body,
      refId: it.refId,
      isIntake: it.kind === "WORKSHEET" && !!it.refId && intakeIds.has(it.refId),
    };
  });

  const allFolders = await foldersForPicker(me.id);
  const itemMoveOptions = allFolders.filter((o) => o.id !== "__root__"); // items live in folders
  const folderMoveOptions = allFolders; // includes top level

  return (
    <div className="flex flex-col gap-6">
      <Header />
      <LibraryBrowser
        folderId={viewData.folder?.id ?? null}
        breadcrumb={viewData.breadcrumb}
        subfolders={viewData.subfolders.map((f) => ({
          id: f.id,
          name: f.name,
          isDefault: f.isDefault,
          childCount: f.childCount,
        }))}
        items={items}
        view={view}
        sort={sort}
        q=""
        canAddItems={!!viewData.folder}
        itemMoveOptions={itemMoveOptions}
        folderMoveOptions={folderMoveOptions}
        worksheetStudioHref="/practitioner/worksheets/new"
        promptStudioHref="/practitioner/library/new"
      />

      {/* Practice essentials — only at the top level, only when relevant. */}
      {!viewData.folder && !spiral && (
        <section className="rounded-card border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-64 flex-1">
              <h2 className="text-lg font-semibold">Values assessment</h2>
              <p className="mt-1 text-sm text-slate">
                Your original values-spiral questionnaire — its answers score into the integrative map.
                Create it once, reword anything in the studio.
              </p>
            </div>
            <form action={createSpiralAssessment}>
              <button className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Create values assessment
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>Between sessions</Eyebrow>
      <h1 className="text-[2.25rem] font-semibold">Your library</h1>
      <SignatureRule />
      <p className="max-w-prose text-ink">Folders, like on your computer — open a door, find your things.</p>
    </div>
  );
}
