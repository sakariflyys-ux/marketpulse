import "server-only";
import { getRedis } from "@synergilon/db/cache";

import { apiError } from "@/lib/api";

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_SECONDS = 60;

function config() {
  const limit = Number(process.env["RATE_LIMIT_MAX"] ?? DEFAULT_LIMIT);
  const windowSeconds = Number(process.env["RATE_LIMIT_WINDOW_SECONDS"] ?? DEFAULT_WINDOW_SECONDS);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0
        ? Math.floor(windowSeconds)
        : DEFAULT_WINDOW_SECONDS,
  };
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult =
  | { allowed: true; limit: number; remaining: number; resetSeconds: number }
  | { allowed: false; limit: number; remaining: 0; resetSeconds: number };

/**
 * Fixed-window counter per client IP: INCR + EXPIRE on `mp:rl:<ip>:<window>`.
 * Without Redis (or if it errors) the request is allowed — the limit is a
 * courtesy against abuse, not a security boundary.
 */
export async function checkRateLimit(request: Request): Promise<RateLimitResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  const { limit, windowSeconds } = config();
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `mp:rl:${clientIp(request)}:${window}`;
  try {
    const [[, count]] = (await redis.multi().incr(key).expire(key, windowSeconds).exec()) as [
      [null, number],
      [null, number],
    ];
    const resetSeconds = (window + 1) * windowSeconds - Math.floor(Date.now() / 1000);
    if (count > limit) return { allowed: false, limit, remaining: 0, resetSeconds };
    return { allowed: true, limit, remaining: limit - count, resetSeconds };
  } catch {
    return null;
  }
}

/**
 * Wraps a public route handler with the rate limit. Adds the standard
 * X-RateLimit-* headers on success and returns 429 with Retry-After otherwise.
 */
export function withRateLimit<Ctx>(
  handler: (request: Request, ctx: Ctx) => Promise<Response>,
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request, ctx) => {
    const result = await checkRateLimit(request);
    if (result && !result.allowed) {
      const res = apiError(429, "RATE_LIMITED", "Too many requests, slow down");
      res.headers.set("Retry-After", String(result.resetSeconds));
      res.headers.set("X-RateLimit-Limit", String(result.limit));
      res.headers.set("X-RateLimit-Remaining", "0");
      return res;
    }
    const response = await handler(request, ctx);
    if (result) {
      response.headers.set("X-RateLimit-Limit", String(result.limit));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    }
    return response;
  };
}
