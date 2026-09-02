import { NextResponse } from "next/server";
import { z } from "zod";
import { foldersContaining, listSaved, MAX_NOTES, saveItem } from "@synergilon/db/services";

import { optionalString, parseBody, parseQuery, withErrorHandling } from "@/lib/api";
import { requireUserId } from "@/lib/auth-guard";

const querySchema = z.object({
  folderId: optionalString,
  itemType: z.enum(["STORE", "AD"]).optional(),
  itemId: optionalString,
});

const bodySchema = z.object({
  itemType: z.enum(["STORE", "AD"]),
  itemId: z.string().min(1),
  folderId: z.string().min(1),
  notes: z.string().max(MAX_NOTES).nullable().optional(),
});

/**
 * GET /api/saved?folderId= — saved items with their store/ad resolved.
 * GET /api/saved?itemType=&itemId= — the folders a given item is saved in
 * (`[{ folderId }]`), used for "already saved" indicators.
 */
export const GET = withErrorHandling(async (request) => {
  const userId = await requireUserId();
  const { folderId, itemType, itemId } = parseQuery(querySchema, request.url);
  if (itemType && itemId) {
    const folderIds = await foldersContaining(userId, itemType, itemId);
    return NextResponse.json({ data: folderIds.map((id) => ({ folderId: id })) });
  }
  const items = await listSaved(userId, { folderId });
  return NextResponse.json({ data: items });
});

/** POST /api/saved — save a store or ad into a folder. */
export const POST = withErrorHandling(async (request) => {
  const userId = await requireUserId();
  const body = await parseBody(bodySchema, request);
  const item = await saveItem(userId, body);
  return NextResponse.json({ data: item }, { status: 201 });
});
