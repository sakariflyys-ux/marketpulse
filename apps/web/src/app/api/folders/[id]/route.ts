import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteFolder, MAX_FOLDER_NAME, updateFolder } from "@synergilon/db/services";

import { ApiError, parseBody, withErrorHandling } from "@/lib/api";
import { requireUserId } from "@/lib/auth-guard";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_FOLDER_NAME).optional(),
    parentId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, {
    message: "Nothing to update",
  });

/** PATCH /api/folders/:id — rename and/or move (parentId: null = root). */
export const PATCH = withErrorHandling<Ctx>(async (request, ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  const body = await parseBody(patchSchema, request);
  const folder = await updateFolder(userId, id, body);
  return NextResponse.json({ data: folder });
});

/** DELETE /api/folders/:id — deletes subfolders and saved items too. */
export const DELETE = withErrorHandling<Ctx>(async (_request, ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  if (!id) throw new ApiError(400, "VALIDATION_ERROR", "Folder id is required");
  await deleteFolder(userId, id);
  return new NextResponse(null, { status: 204 });
});
