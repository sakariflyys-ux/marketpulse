import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidCursorError } from "@marketpulse/db/repositories";

/** Error envelope used by every route handler: `{ error: { code, message } }`. */
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

/** Parse URL search params against a Zod schema; throws a 400 ApiError on failure. */
export function parseQuery<S extends z.ZodType>(schema: S, url: string | URL): z.output<S> {
  const params = Object.fromEntries(new URL(url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Invalid query parameters",
      z.flattenError(result.error).fieldErrors,
    );
  }
  return result.data;
}

/** Parse a JSON body against a Zod schema; throws a 400 ApiError on failure. */
export async function parseBody<S extends z.ZodType>(
  schema: S,
  request: Request,
): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Invalid request body",
      z.flattenError(result.error).fieldErrors,
    );
  }
  return result.data;
}

/**
 * Wraps a route handler so thrown errors become the standard envelope.
 * Unknown errors are logged and returned as a generic 500.
 */
export function withErrorHandling<Ctx>(
  handler: (request: Request, ctx: Ctx) => Promise<Response>,
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      if (err instanceof ApiError) return apiError(err.status, err.code, err.message, err.details);
      if (err instanceof InvalidCursorError) return apiError(400, "INVALID_CURSOR", err.message);
      console.error("[api]", err);
      return apiError(500, "INTERNAL_ERROR", "Something went wrong");
    }
  };
}

// Shared query primitives -----------------------------------------------------

export const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const orderSchema = z.enum(["asc", "desc"]).default("desc");
export const optionalNumber = z.coerce.number().finite().nonnegative().optional();
export const optionalString = z
  .string()
  .trim()
  .max(200)
  .transform((s) => (s === "" ? undefined : s))
  .optional();
