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
    category: optionalString,
    minRevenue: optionalNumber,
    maxRevenue: optionalNumber,
    minTraffic: optionalNumber,
    maxTraffic: optionalNumber,
    sort: z.enum(["revenue", "traffic", "newest", "name", "relevance"]).default("revenue"),
    order: orderSchema,
    limit: limitSchema,
    cursor: optionalString,
  })
  .refine(
    (v) => v.minRevenue === undefined || v.maxRevenue === undefined || v.minRevenue <= v.maxRevenue,
    {
      message: "minRevenue must be <= maxRevenue",
      path: ["minRevenue"],
    },
  )
  .refine(
    (v) => v.minTraffic === undefined || v.maxTraffic === undefined || v.minTraffic <= v.maxTraffic,
    {
      message: "minTraffic must be <= maxTraffic",
      path: ["minTraffic"],
    },
  );

/**
 * GET /api/stores — paginated, filterable, sortable store list.
 * Response: `{ data: StoreSummary[], nextCursor: string | null }`.
 */
export const GET = withRateLimit(
  withErrorHandling(async (request) => {
    const params = parseQuery(querySchema, request.url);
    const page = await getRepositories().stores.list(params);
    return NextResponse.json(page);
  }),
);
