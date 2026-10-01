"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";

// AMENDMENT-03 — folder/item actions. PC-identical behaviors: new folder, new
// doc/link, rename, move, duplicate, delete-to-trash, restore. Everything is
// scoped to the practitioner; every drag action has one of these as its menu
// equivalent so it works on mobile too.

type Res = { ok: boolean; id?: string; error?: string };

async function ownFolder(id: string, practitionerId: string) {
  return prisma.libraryFolder.findFirst({ where: { id, practitionerId } });
}
async function ownItem(id: string, practitionerId: string) {
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) return null;
  const folder = await prisma.libraryFolder.findFirst({
    where: { id: item.folderId, practitionerId },
    select: { id: true },
  });
  return folder ? item : null;
}

// Every descendant folder + item id under a folder (regardless of trash state).
async function collectSubtree(rootId: string) {
  const folderIds: string[] = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    const kids = await prisma.libraryFolder.findMany({
      where: { parentId: cur },
      select: { id: true },
    });
    for (const k of kids) {
      folderIds.push(k.id);
      queue.push(k.id);
    }
  }
  return folderIds;
}

export async function createFolder(parentId: string | null, name?: string): Promise<Res> {
  const me = await requirePractitioner();
  if (parentId) {
    const parent = await ownFolder(parentId, me.id);
    if (!parent) return { ok: false, error: "not-found" };
  }
  const count = await prisma.libraryFolder.count({ where: { practitionerId: me.id, parentId } });
  const folder = await prisma.libraryFolder.create({
    data: {
      practitionerId: me.id,
      parentId,
      name: name?.trim() || "New folder",
      order: count,
    },
  });
  revalidatePath("/practitioner/library");
  return { ok: true, id: folder.id };
}

export async function renameFolder(id: string, name: string): Promise<Res> {
  const me = await requirePractitioner();
  if (!(await ownFolder(id, me.id))) return { ok: false, error: "not-found" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  await prisma.libraryFolder.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function renameItem(id: string, name: string): Promise<Res> {
  const me = await requirePractitioner();
  if (!(await ownItem(id, me.id))) return { ok: false, error: "not-found" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  await prisma.libraryItem.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

// Move a folder under a new parent ("__root__" = top level). Guards against
// moving a folder into itself or a descendant.
export async function moveFolder(id: string, targetParentId: string): Promise<Res> {
  const me = await requirePractitioner();
  const folder = await ownFolder(id, me.id);
  if (!folder) return { ok: false, error: "not-found" };
  const newParent = targetParentId === "__root__" ? null : targetParentId;
  if (newParent) {
    if (!(await ownFolder(newParent, me.id))) return { ok: false, error: "not-found" };
    const subtree = await collectSubtree(id);
    if (subtree.includes(newParent)) return { ok: false, error: "cycle" };
  }
  await prisma.libraryFolder.update({ where: { id }, data: { parentId: newParent } });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function moveItem(id: string, targetFolderId: string): Promise<Res> {
  const me = await requirePractitioner();
  if (!(await ownItem(id, me.id))) return { ok: false, error: "not-found" };
  if (!(await ownFolder(targetFolderId, me.id))) return { ok: false, error: "not-found" };
  await prisma.libraryItem.update({ where: { id }, data: { folderId: targetFolderId } });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function duplicateItem(id: string): Promise<Res> {
  const me = await requirePractitioner();
  const item = await ownItem(id, me.id);
  if (!item) return { ok: false, error: "not-found" };
  const copy = await prisma.libraryItem.create({
    data: {
      folderId: item.folderId,
      kind: item.kind,
      refId: item.refId,
      fileKey: item.fileKey,
      url: item.url,
      body: item.body,
      name: `${item.name} (copy)`,
      order: item.order + 1,
    },
  });
  revalidatePath("/practitioner/library");
  return { ok: true, id: copy.id };
}

export async function trashItem(id: string): Promise<Res> {
  const me = await requirePractitioner();
  if (!(await ownItem(id, me.id))) return { ok: false, error: "not-found" };
  await prisma.libraryItem.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

// Deleting a folder moves its whole subtree (folders + items) to trash together
// — never silent loss; restorable as a unit.
export async function trashFolder(id: string): Promise<Res> {
  const me = await requirePractitioner();
  const folder = await ownFolder(id, me.id);
  if (!folder) return { ok: false, error: "not-found" };
  if (folder.isDefault) return { ok: false, error: "default" };
  const folderIds = await collectSubtree(id);
  const now = new Date();
  await prisma.$transaction([
    prisma.libraryItem.updateMany({ where: { folderId: { in: folderIds } }, data: { deletedAt: now } }),
    prisma.libraryFolder.updateMany({ where: { id: { in: folderIds } }, data: { deletedAt: now } }),
  ]);
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function restoreItem(id: string): Promise<Res> {
  const me = await requirePractitioner();
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) return { ok: false, error: "not-found" };
  if (!(await ownFolder(item.folderId, me.id))) return { ok: false, error: "not-found" };
  await prisma.libraryItem.update({ where: { id }, data: { deletedAt: null } });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function restoreFolder(id: string): Promise<Res> {
  const me = await requirePractitioner();
  const folder = await prisma.libraryFolder.findFirst({ where: { id, practitionerId: me.id } });
  if (!folder) return { ok: false, error: "not-found" };
  const folderIds = await collectSubtree(id);
  // If the parent is still trashed (or gone), surface this folder at the top.
  const parent = folder.parentId
    ? await prisma.libraryFolder.findUnique({ where: { id: folder.parentId } })
    : null;
  const reparent = folder.parentId && (!parent || parent.deletedAt) ? null : folder.parentId;
  await prisma.$transaction([
    prisma.libraryItem.updateMany({ where: { folderId: { in: folderIds } }, data: { deletedAt: null } }),
    prisma.libraryFolder.updateMany({ where: { id: { in: folderIds } }, data: { deletedAt: null } }),
    prisma.libraryFolder.update({ where: { id }, data: { parentId: reparent } }),
  ]);
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function createDoc(folderId: string, name: string, body: string): Promise<Res> {
  const me = await requirePractitioner();
  if (!(await ownFolder(folderId, me.id))) return { ok: false, error: "not-found" };
  const item = await prisma.libraryItem.create({
    data: { folderId, kind: "DOC", name: name.trim() || "Untitled", body: body ?? "" },
  });
  revalidatePath("/practitioner/library");
  return { ok: true, id: item.id };
}

export async function updateDoc(id: string, name: string, body: string): Promise<Res> {
  const me = await requirePractitioner();
  const item = await ownItem(id, me.id);
  if (!item || item.kind !== "DOC") return { ok: false, error: "not-found" };
  await prisma.libraryItem.update({
    where: { id },
    data: { name: name.trim() || "Untitled", body: body ?? "" },
  });
  revalidatePath("/practitioner/library");
  return { ok: true };
}

export async function createLink(folderId: string, name: string, url: string): Promise<Res> {
  const me = await requirePractitioner();
  if (!(await ownFolder(folderId, me.id))) return { ok: false, error: "not-found" };
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return { ok: false, error: "url" };
  const item = await prisma.libraryItem.create({
    data: { folderId, kind: "LINK", name: name.trim() || clean, url: clean },
  });
  revalidatePath("/practitioner/library");
  return { ok: true, id: item.id };
}
