import { NextResponse } from "next/server";
import { getFolderTree } from "@marketpulse/db/services";

import { withErrorHandling } from "@/lib/api";
import { requireUserId } from "@/lib/auth-guard";

/** GET /api/folders/tree — the user's nested folder tree with saved counts. */
export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const tree = await getFolderTree(userId);
  return NextResponse.json({ data: tree });
});
