import { NextResponse } from "next/server";
import { getRepositories } from "@synergilon/db/repositories";

import { apiError, withErrorHandling } from "@/lib/api";
import { withRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ domain: string }> };

/** GET /api/stores/:domain — full store insights (snapshots + recent ads). */
export const GET = withRateLimit(
  withErrorHandling<Ctx>(async (_request, ctx) => {
    const { domain } = await ctx.params;
    const store = await getRepositories().stores.getByDomain(decodeURIComponent(domain));
    if (!store) return apiError(404, "NOT_FOUND", `No store with domain "${domain}"`);
    return NextResponse.json({ data: store });
  }),
);
