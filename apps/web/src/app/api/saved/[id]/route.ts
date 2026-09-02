import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSaved, MAX_NOTES, updateSaved } from "@marketpulse/db/services";

import { parseBody, withErrorHandling } from "@/lib/api";
import { requireUserId } from "@/lib/auth-guard";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    folderId: z.string().min(1).optional(),
    notes: z.string().max(MAX_NOTES).nullable().optional(),
  })
  .refine((v) => v.folderId !== undefined || v.notes !== undefined, {
    message: "Nothing to update",
  });

/** PATCH /api/saved/:id — move to another folder and/or edit notes. */
export const PATCH = withErrorHandling<Ctx>(async (request, ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  const body = await parseBody(patchSchema, request);
  const item = await updateSaved(userId, id, body);
  return NextResponse.json({ data: item });
});

/** DELETE /api/saved/:id */
export const DELETE = withErrorHandling<Ctx>(async (_request, ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await deleteSaved(userId, id);
  return new NextResponse(null, { status: 204 });
});
