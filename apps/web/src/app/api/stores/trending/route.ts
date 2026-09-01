import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@marketpulse/db/repositories";

import { limitSchema, optionalString, parseQuery, withErrorHandling } from "@/lib/api";

const querySchema = z.object({
  category: optionalString,
  limit: limitSchema,
  cursor: optionalString,
});

/**
 * GET /api/stores/trending — stores ranked by revenue growth over the last 7
 * snapshots, falling back to absolute revenue.
 */
export const GET = withErrorHandling(async (request) => {
  const params = parseQuery(querySchema, request.url);
  const page = await getRepositories().stores.trending(params);
  return NextResponse.json(page);
});
