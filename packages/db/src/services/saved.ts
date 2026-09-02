import { prisma } from "../client";
import { ServiceError } from "./errors";

export type SavedItemType = "STORE" | "AD";

export type SavedStoreRef = {
  id: string;
  name: string;
  shopifyDomain: string;
  logo: string | null;
  category: string;
  monthlyRevenue: number | null;
  revenueEstimate: number | null;
  estimateConfidence: string | null;
  source: string;
};

export type SavedAdRef = {
  id: string;
  platform: "META" | "TIKTOK" | "GOOGLE";
  headline: string;
  creativeUrl: string;
  engagementRate: number | null;
  spendEstimate: number | null;
  source: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  active: boolean;
  pageName: string | null;
  store: { name: string; shopifyDomain: string } | null;
};

export type SavedItemRecord = {
  id: string;
  userId: string;
  folderId: string;
  itemType: SavedItemType;
  itemId: string;
  notes: string | null;
  createdAt: Date;
};

/** A saved item with its referenced store or ad resolved (null if it no longer exists). */
export type SavedItemWithRef =
  | (SavedItemRecord & { itemType: "STORE"; item: SavedStoreRef | null })
  | (SavedItemRecord & { itemType: "AD"; item: SavedAdRef | null });

export const MAX_NOTES = 2000;

async function requireOwnedFolder(userId: string, folderId: string): Promise<void> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) throw new ServiceError(404, "NOT_FOUND", "Folder not found");
}

async function assertItemExists(itemType: SavedItemType, itemId: string): Promise<void> {
  const exists =
    itemType === "STORE"
      ? await prisma.store.findUnique({ where: { id: itemId }, select: { id: true } })
      : await prisma.ad.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!exists)
    throw new ServiceError(404, "NOT_FOUND", `${itemType === "STORE" ? "Store" : "Ad"} not found`);
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) return null;
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTES) {
    throw new ServiceError(400, "INVALID", `Notes must be at most ${MAX_NOTES} characters`);
  }
  return trimmed || null;
}

/** Attach the referenced stores/ads in two batched queries. */
export async function resolveRefs(items: SavedItemRecord[]): Promise<SavedItemWithRef[]> {
  const storeIds = items.filter((i) => i.itemType === "STORE").map((i) => i.itemId);
  const adIds = items.filter((i) => i.itemType === "AD").map((i) => i.itemId);
  const [stores, ads] = await Promise.all([
    storeIds.length
      ? prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: {
            id: true,
            name: true,
            shopifyDomain: true,
            logo: true,
            category: true,
            monthlyRevenue: true,
            revenueEstimate: true,
            estimateConfidence: true,
            source: true,
          },
        })
      : [],
    adIds.length
      ? prisma.ad.findMany({
          where: { id: { in: adIds } },
          select: {
            id: true,
            platform: true,
            headline: true,
            creativeUrl: true,
            engagementRate: true,
            spendEstimate: true,
            source: true,
            firstSeenAt: true,
            lastSeenAt: true,
            active: true,
            pageName: true,
            store: { select: { name: true, shopifyDomain: true } },
          },
        })
      : [],
  ]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const adById = new Map(ads.map((a) => [a.id, a]));
  return items.map((i) =>
    i.itemType === "STORE"
      ? { ...i, itemType: "STORE", item: storeById.get(i.itemId) ?? null }
      : { ...i, itemType: "AD", item: adById.get(i.itemId) ?? null },
  );
}

/** Saved items for a user, optionally scoped to one folder, newest first. */
export async function listSaved(
  userId: string,
  filter: { folderId?: string } = {},
): Promise<SavedItemWithRef[]> {
  if (filter.folderId) await requireOwnedFolder(userId, filter.folderId);
  const items = await prisma.savedItem.findMany({
    where: { userId, ...(filter.folderId ? { folderId: filter.folderId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return resolveRefs(items);
}

export async function saveItem(
  userId: string,
  input: { itemType: SavedItemType; itemId: string; folderId: string; notes?: string | null },
): Promise<SavedItemRecord> {
  await requireOwnedFolder(userId, input.folderId);
  await assertItemExists(input.itemType, input.itemId);
  const existing = await prisma.savedItem.findUnique({
    where: {
      userId_folderId_itemType_itemId: {
        userId,
        folderId: input.folderId,
        itemType: input.itemType,
        itemId: input.itemId,
      },
    },
  });
  if (existing) throw new ServiceError(409, "CONFLICT", "Already saved in this folder");
  return prisma.savedItem.create({
    data: {
      userId,
      folderId: input.folderId,
      itemType: input.itemType,
      itemId: input.itemId,
      notes: normalizeNotes(input.notes),
    },
  });
}

/** Move to another folder and/or update notes. */
export async function updateSaved(
  userId: string,
  id: string,
  input: { folderId?: string; notes?: string | null },
): Promise<SavedItemRecord> {
  const current = await prisma.savedItem.findFirst({ where: { id, userId } });
  if (!current) throw new ServiceError(404, "NOT_FOUND", "Saved item not found");

  const folderId = input.folderId ?? current.folderId;
  if (folderId !== current.folderId) {
    await requireOwnedFolder(userId, folderId);
    const clash = await prisma.savedItem.findUnique({
      where: {
        userId_folderId_itemType_itemId: {
          userId,
          folderId,
          itemType: current.itemType,
          itemId: current.itemId,
        },
      },
      select: { id: true },
    });
    if (clash) throw new ServiceError(409, "CONFLICT", "Already saved in the target folder");
  }
  return prisma.savedItem.update({
    where: { id },
    data: {
      folderId,
      ...(input.notes !== undefined ? { notes: normalizeNotes(input.notes) } : {}),
    },
  });
}

export async function deleteSaved(userId: string, id: string): Promise<void> {
  const current = await prisma.savedItem.findFirst({ where: { id, userId }, select: { id: true } });
  if (!current) throw new ServiceError(404, "NOT_FOUND", "Saved item not found");
  await prisma.savedItem.delete({ where: { id } });
}

/** Folder ids in which the given item is already saved (for "saved" indicators). */
export async function foldersContaining(
  userId: string,
  itemType: SavedItemType,
  itemId: string,
): Promise<string[]> {
  const rows = await prisma.savedItem.findMany({
    where: { userId, itemType, itemId },
    select: { folderId: true },
  });
  return rows.map((r) => r.folderId);
}
