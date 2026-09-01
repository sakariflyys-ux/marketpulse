import { cache, DEFAULT_TTL_SECONDS } from "../cache";

/**
 * Wraps every method of a read-only repository with the Redis read-through
 * cache. The key is `<method>:<stable JSON of args>`; the namespace is the
 * repository name so the worker (Phase 6) can invalidate `stores` / `ads`
 * wholesale after writing new snapshots.
 */
export function withCache<T extends object>(
  namespace: string,
  repo: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): T {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        cache.wrap(
          namespace,
          `${String(prop)}:${stableStringify(args)}`,
          () => value.apply(target, args),
          ttlSeconds,
        );
    },
  });
}

/** JSON with sorted object keys so `{a,b}` and `{b,a}` hit the same entry. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return v;
  });
}
