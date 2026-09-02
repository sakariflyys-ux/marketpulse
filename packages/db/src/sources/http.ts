/** Small fetch helpers shared by the data-source clients. No third-party HTTP deps. */

export type FetchLike = typeof fetch;

export class HttpTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request to ${url} timed out after ${ms}ms`);
    this.name = "HttpTimeoutError";
  }
}

export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError")
      throw new HttpTimeoutError(url, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Exponential backoff with full jitter, capped. Returns milliseconds. */
export function backoffDelay(
  attempt: number,
  baseMs = 1_000,
  capMs = 60_000,
  random = Math.random,
): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(random() * exp);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Per-key token bucket: at most one call per `intervalMs` per key. */
export class PerKeyRateLimiter {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async acquire(key: string): Promise<void> {
    const previous = this.last.get(key);
    const current = this.now();
    if (previous === undefined) {
      this.last.set(key, current);
      return;
    }
    const earliest = previous + this.intervalMs;
    if (current < earliest) await this.wait(earliest - current);
    this.last.set(key, Math.max(this.now(), earliest));
  }
}
