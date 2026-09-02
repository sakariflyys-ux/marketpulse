import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@marketpulse/db/repositories";

import {
  limitSchema,
  optionalNumber,
  optionalString,
  orderSchema,
  parseQuery,
  withErrorHandling,
} from "@/lib/api";
import { withRateLimit } from "@/lib/rate-limit";

const querySchema = z
  .object({
    q: optionalString,
    platform: z.enum(["META", "TIKTOK", "GOOGLE"]).optional(),
    storeId: optionalString,
    minEngagement: optionalNumber,
    maxEngagement: optionalNumber,
    minSpend: optionalNumber,
    maxSpend: optionalNumber,
    sort: z
      .enum(["engagement", "spend", "impressions", "newest", "relevance"])
      .default("engagement"),
    order: orderSchema,
    limit: limitSchema,
    cursor: optionalString,
  })
  .refine(
    (v) =>
      v.minEngagement === undefined ||
      v.maxEngagement === undefined ||
      v.minEngagement <= v.maxEngagement,
    { message: "minEngagement must be <= maxEngagement", path: ["minEngagement"] },
  )
  .refine((v) => v.minSpend === undefined || v.maxSpend === undefined || v.minSpend <= v.maxSpend, {
    message: "minSpend must be <= maxSpend",
    path: ["minSpend"],
  });

/**
 * GET /api/ads — paginated, filterable, sortable ad list.
 * Response: `{ data: AdSummary[], nextCursor: string | null }`.
 */
export const GET = withRateLimit(
  withErrorHandling(async (request) => {
    const params = parseQuery(querySchema, request.url);
    const page = await getRepositories().ads.list(params);
    return NextResponse.json(page);
  }),
);
