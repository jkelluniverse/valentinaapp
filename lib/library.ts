import { prisma } from "@/lib/prisma";
import type { LibraryFolder, LibraryItem } from "@prisma/client";

// AMENDMENT-03 — The Library, as Folders. The service layer: seed the four
// default folders, auto-file existing (and newly-studio'd) content as pointer
// items, and read folder views / search / the move-picker. Folders behave like
// folders on a computer; items are pointers to the real C9/C3/C6 records.

export type ItemKind = "WORKSHEET" | "PROMPT" | "COURSE" | "FILE" | "LINK" | "DOC";

const DEFAULTS: { key: string; name: string; order: number }[] = [
  { key: "worksheets", name: "Worksheets", order: 0 },
  { key: "prompts", name: "Exercises & Prompts", order: 1 },
  { key: "courses", name: "Courses", order: 2 },
  { key: "resources", name: "Resources", order: 3 },
];

const defaultId = (practitionerId: string, key: string) => `libf-${practitionerId}-${key}`;

// Idempotent: ensure the four default folders exist (renameable — we never
// overwrite the name), then file any worksheet/prompt/course not yet pointed at
// into its home folder. Cheap enough to run on each library load.
export async function ensureLibrary(practitionerId: string): Promise<void> {
  await Promise.all(
    DEFAULTS.map((d) =>
      prisma.libraryFolder.upsert({
        where: { id: defaultId(practitionerId, d.key) },
        create: {
          id: defaultId(practitionerId, d.key),
          practitionerId,
          name: d.name,
          isDefault: true,
          order: d.order,
        },
        update: {}, // never clobber a renamed default
      }),
    ),
  );

  const existing = await prisma.libraryItem.findMany({
    where: { refId: { not: null }, deletedAt: null },
    select: { refId: true, kind: true },
  });
  const filed = new Set(existing.map((i) => `${i.kind}:${i.refId}`));

  const [worksheets, prompts, courses] = await Promise.all([
    prisma.worksheet.findMany({ select: { id: true, title: true } }),
    prisma.prompt.findMany({ select: { id: true, title: true } }),
    prisma.course.findMany({ select: { id: true, title: true } }),
  ]);

  const toCreate: {
    folderId: string;
    kind: ItemKind;
    refId: string;
    name: string;
  }[] = [];
  for (const w of worksheets)
    if (!filed.has(`WORKSHEET:${w.id}`))
      toCreate.push({ folderId: defaultId(practitionerId, "worksheets"), kind: "WORKSHEET", refId: w.id, name: w.title });
  for (const p of prompts)
    if (!filed.has(`PROMPT:${p.id}`))
      toCreate.push({ folderId: defaultId(practitionerId, "prompts"), kind: "PROMPT", refId: p.id, name: p.title });
  for (const c of courses)
    if (!filed.has(`COURSE:${c.id}`))
      toCreate.push({ folderId: defaultId(practitionerId, "courses"), kind: "COURSE", refId: c.id, name: c.title });

  if (toCreate.length > 0) {
    await prisma.libraryItem.createMany({ data: toCreate });
  }
}

export const worksheetsFolderId = (practitionerId: string) => defaultId(practitionerId, "worksheets");
export const promptsFolderId = (practitionerId: string) => defaultId(practitionerId, "prompts");

export type Crumb = { id: string | null; name: string };
export type FolderTile = LibraryFolder & { childCount: number };
export type SortKey = "name" | "recent" | "type";

export type FolderView = {
  folder: LibraryFolder | null; // null = top level (the four doors)
  breadcrumb: Crumb[];
  subfolders: FolderTile[];
  items: LibraryItem[];
};

function sortFolders(a: FolderTile, b: FolderTile, sort: SortKey): number {
  if (sort === "recent") return b.updatedAt.getTime() - a.updatedAt.getTime();
  return a.order - b.order || a.name.localeCompare(b.name);
}
function sortItems(a: LibraryItem, b: LibraryItem, sort: SortKey): number {
  if (sort === "recent") return b.updatedAt.getTime() - a.updatedAt.getTime();
  if (sort === "type") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
  return a.order - b.order || a.name.localeCompare(b.name);
}

export async function getFolderView(
  practitionerId: string,
  folderId: string | null,
  sort: SortKey = "name",
): Promise<FolderView> {
  const folder = folderId
    ? await prisma.libraryFolder.findFirst({
        where: { id: folderId, practitionerId, deletedAt: null },
      })
    : null;
  if (folderId && !folder) {
    // Missing/foreign folder → fall back to top.
    return getFolderView(practitionerId, null, sort);
  }

  // Breadcrumb: walk parents up to the top.
  const breadcrumb: Crumb[] = [{ id: null, name: "Library" }];
  if (folder) {
    const chain: LibraryFolder[] = [folder];
    let cur = folder;
    while (cur.parentId) {
      const parent = await prisma.libraryFolder.findUnique({ where: { id: cur.parentId } });
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    for (const f of chain) breadcrumb.push({ id: f.id, name: f.name });
  }

  const subfoldersRaw = await prisma.libraryFolder.findMany({
    where: { practitionerId, parentId: folderId, deletedAt: null },
  });
  const subfolders: FolderTile[] = await Promise.all(
    subfoldersRaw.map(async (f) => {
      const [fc, ic] = await Promise.all([
        prisma.libraryFolder.count({ where: { parentId: f.id, deletedAt: null } }),
        prisma.libraryItem.count({ where: { folderId: f.id, deletedAt: null } }),
      ]);
      return { ...f, childCount: fc + ic };
    }),
  );
  subfolders.sort((a, b) => sortFolders(a, b, sort));

  // Top level shows only the four doors — no loose items.
  const items = folderId
    ? (await prisma.libraryItem.findMany({ where: { folderId, deletedAt: null } })).sort((a, b) =>
        sortItems(a, b, sort),
      )
    : [];

  return { folder, breadcrumb, subfolders, items };
}

// A flat, depth-labelled list of folders for the "Move to…" picker (excludes a
// folder and its descendants when moving a folder).
export async function foldersForPicker(
  practitionerId: string,
  excludeSubtreeOf?: string,
): Promise<{ id: string; name: string; depth: number }[]> {
  const all = await prisma.libraryFolder.findMany({
    where: { practitionerId, deletedAt: null },
    orderBy: { order: "asc" },
  });
  const byParent = new Map<string | null, LibraryFolder[]>();
  for (const f of all) {
    const key = f.parentId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(f);
    byParent.set(key, arr);
  }
  const out: { id: string; name: string; depth: number }[] = [{ id: "__root__", name: "Library (top level)", depth: 0 }];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of byParent.get(parentId) ?? []) {
      if (f.id === excludeSubtreeOf) continue; // don't allow moving into itself/descendants
      out.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

export type SearchHit =
  | { type: "folder"; id: string; name: string; where: string }
  | { type: "item"; id: string; kind: string; name: string; where: string; folderId: string };

export async function searchLibrary(practitionerId: string, q: string): Promise<SearchHit[]> {
  const term = q.trim();
  if (!term) return [];
  const [folders, items] = await Promise.all([
    prisma.libraryFolder.findMany({
      where: { practitionerId, deletedAt: null, name: { contains: term, mode: "insensitive" } },
      take: 30,
    }),
    prisma.libraryItem.findMany({
      where: { deletedAt: null, name: { contains: term, mode: "insensitive" } },
      take: 60,
    }),
  ]);
  // Resolve each item's folder name (and confirm ownership via the folder).
  const folderIds = [...new Set(items.map((i) => i.folderId))];
  const folderMap = new Map(
    (
      await prisma.libraryFolder.findMany({
        where: { id: { in: folderIds }, practitionerId },
        select: { id: true, name: true },
      })
    ).map((f) => [f.id, f.name]),
  );
  const hits: SearchHit[] = [];
  for (const f of folders) hits.push({ type: "folder", id: f.id, name: f.name, where: "Folder" });
  for (const i of items) {
    const where = folderMap.get(i.folderId);
    if (!where) continue; // item in a folder she doesn't own — skip
    hits.push({ type: "item", id: i.id, kind: i.kind, name: i.name, where, folderId: i.folderId });
  }
  return hits;
}

export async function trashView(practitionerId: string) {
  const [folders, items] = await Promise.all([
    prisma.libraryFolder.findMany({
      where: { practitionerId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.libraryItem.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 100,
    }),
  ]);
  return { folders, items };
}
