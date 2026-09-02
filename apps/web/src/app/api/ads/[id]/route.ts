import { NextResponse } from "next/server";
import { getRepositories } from "@synergilon/db/repositories";

import { apiError, withErrorHandling } from "@/lib/api";
import { withRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/ads/:id — single ad with its store reference. */
export const GET = withRateLimit(
  withErrorHandling<Ctx>(async (_request, ctx) => {
    const { id } = await ctx.params;
    const ad = await getRepositories().ads.getById(id);
    if (!ad) return apiError(404, "NOT_FOUND", `No ad with id "${id}"`);
    return NextResponse.json({ data: ad });
  }),
);
