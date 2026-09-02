import { prisma } from "../client";
import { ServiceError } from "./errors";

export const MAX_FOLDER_NAME = 80;

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  /** Saved items directly in this folder (not descendants). */
  savedCount: number;
  children: FolderNode[];
};

export type FolderRecord = { id: string; name: string; parentId: string | null; createdAt: Date };

function normalizeName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ServiceError(400, "INVALID", "Folder name is required");
  if (trimmed.length > MAX_FOLDER_NAME) {
    throw new ServiceError(
      400,
      "INVALID",
      `Folder name must be at most ${MAX_FOLDER_NAME} characters`,
    );
  }
  if (trimmed.includes("/"))
    throw new ServiceError(400, "INVALID", 'Folder name cannot contain "/"');
  return trimmed;
}

async function requireFolder(userId: string, id: string): Promise<FolderRecord> {
  const folder = await prisma.folder.findFirst({
    where: { id, userId },
    select: { id: true, name: true, parentId: true, createdAt: true },
  });
  if (!folder) throw new ServiceError(404, "NOT_FOUND", "Folder not found");
  return folder;
}

/**
 * The DB unique index on (userId, parentId, name) doesn't catch duplicates at
 * the root because Postgres treats NULLs as distinct, so uniqueness is
 * enforced here for both levels.
 */
async function assertNameFree(
  userId: string,
  parentId: string | null,
  name: string,
  exceptId?: string,
) {
  const clash = await prisma.folder.findFirst({
    where: { userId, parentId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash)
    throw new ServiceError(409, "CONFLICT", `A folder named "${name}" already exists here`);
}

/** Full tree for a user, root folders first, siblings sorted by name. */
export async function getFolderTree(userId: string): Promise<FolderNode[]> {
  const [folders, counts] = await Promise.all([
    prisma.folder.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true, createdAt: true },
    }),
    prisma.savedItem.groupBy({ by: ["folderId"], where: { userId }, _count: { _all: true } }),
  ]);
  const countByFolder = new Map(counts.map((c) => [c.folderId, c._count._all]));
  const nodes = new Map<string, FolderNode>(
    folders.map((f) => [f.id, { ...f, savedCount: countByFolder.get(f.id) ?? 0, children: [] }]),
  );
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function createFolder(
  userId: string,
  input: { name: string; parentId?: string | null },
): Promise<FolderRecord> {
  const name = normalizeName(input.name);
  const parentId = input.parentId ?? null;
  if (parentId) await requireFolder(userId, parentId);
  await assertNameFree(userId, parentId, name);
  return prisma.folder.create({
    data: { userId, name, parentId },
    select: { id: true, name: true, parentId: true, createdAt: true },
  });
}

/** Rename and/or move. `parentId: null` moves to the root. */
export async function updateFolder(
  userId: string,
  id: string,
  input: { name?: string; parentId?: string | null },
): Promise<FolderRecord> {
  const current = await requireFolder(userId, id);
  const name = input.name !== undefined ? normalizeName(input.name) : current.name;
  const parentId = input.parentId !== undefined ? input.parentId : current.parentId;

  if (parentId !== current.parentId) {
    if (parentId === id)
      throw new ServiceError(400, "INVALID", "A folder cannot be its own parent");
    if (parentId) {
      await requireFolder(userId, parentId);
      if (await isDescendant(userId, parentId, id)) {
        throw new ServiceError(400, "INVALID", "Cannot move a folder into its own subfolder");
      }
    }
  }
  if (name !== current.name || parentId !== current.parentId) {
    await assertNameFree(userId, parentId, name, id);
  }
  return prisma.folder.update({
    where: { id },
    data: { name, parentId },
    select: { id: true, name: true, parentId: true, createdAt: true },
  });
}

/** Deletes the folder, its subfolders and every saved item inside (FK cascade). */
export async function deleteFolder(userId: string, id: string): Promise<void> {
  await requireFolder(userId, id);
  await prisma.folder.delete({ where: { id } });
}

/** Walks up from `candidateId`; true if `ancestorId` is on the path. */
async function isDescendant(
  userId: string,
  candidateId: string,
  ancestorId: string,
): Promise<boolean> {
  let cursor: string | null = candidateId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (cursor === ancestorId) return true;
    const row: { parentId: string | null } | null = await prisma.folder.findFirst({
      where: { id: cursor, userId },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
  return false;
}

/**
 * Resolves a slash-separated path like "Competitors/Skincare", creating any
 * missing segments. Used by the MCP `save_to_folder` tool.
 */
export async function ensureFolderPath(userId: string, path: string): Promise<FolderRecord> {
  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) throw new ServiceError(400, "INVALID", "Folder path is required");

  let parentId: string | null = null;
  let folder: FolderRecord | null = null;
  for (const segment of segments) {
    const name = normalizeName(segment);
    const existing: FolderRecord | null = await prisma.folder.findFirst({
      where: { userId, parentId, name },
      select: { id: true, name: true, parentId: true, createdAt: true },
    });
    folder =
      existing ??
      (await prisma.folder.create({
        data: { userId, parentId, name },
        select: { id: true, name: true, parentId: true, createdAt: true },
      }));
    parentId = folder.id;
  }
  return folder!;
}

/** "Parent / Child / Leaf" label for a folder id, for display. */
export function folderPath(tree: FolderNode[], id: string): string[] | null {
  for (const node of tree) {
    if (node.id === id) return [node.name];
    const inner = folderPath(node.children, id);
    if (inner) return [node.name, ...inner];
  }
  return null;
}
