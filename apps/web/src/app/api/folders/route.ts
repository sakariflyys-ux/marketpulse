import { NextResponse } from "next/server";
import { z } from "zod";
import { createFolder, MAX_FOLDER_NAME } from "@synergilon/db/services";

import { parseBody, withErrorHandling } from "@/lib/api";
import { requireUserId } from "@/lib/auth-guard";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_FOLDER_NAME),
  parentId: z.string().min(1).nullable().optional(),
});

/** POST /api/folders — create a folder (optionally nested). */
export const POST = withErrorHandling(async (request) => {
  const userId = await requireUserId();
  const body = await parseBody(bodySchema, request);
  const folder = await createFolder(userId, body);
  return NextResponse.json({ data: folder }, { status: 201 });
});
