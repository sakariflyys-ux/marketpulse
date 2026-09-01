import { NextResponse } from "next/server";
import { getRepositories } from "@marketpulse/db/repositories";

import { apiError, withErrorHandling } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/ads/:id — single ad with its store reference. */
export const GET = withErrorHandling<Ctx>(async (_request, ctx) => {
  const { id } = await ctx.params;
  const ad = await getRepositories().ads.getById(id);
  if (!ad) return apiError(404, "NOT_FOUND", `No ad with id "${id}"`);
  return NextResponse.json({ data: ad });
});
