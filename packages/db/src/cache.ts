/**
 * Optional Redis cache. When REDIS_URL is unset (or Redis is unreachable)
 * every operation is a passthrough, so the app never depends on Redis.
 *
 * Keys are namespaced and versioned: `mp:<ns>:v<version>:<key>`. Invalidating
 * a namespace bumps its version counter (one INCR) instead of scanning and
 * deleting keys, which is O(1) and safe on Upstash. Old entries expire via TTL.
 */
import { Redis } from "ioredis";

export const DEFAULT_TTL_SECONDS = 300;

type Client = Redis;

let client: Client | null | undefined;
let warned = false;

function getClient(): Client | null {
  if (client !== undefined) return client;
  const url = process.env["REDIS_URL"];
  if (!url) {
    client = null;
    return client;
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    // Upstash and most managed Redis require TLS on rediss:// URLs; ioredis
    // enables it from the scheme automatically.
  });
  redis.on("error", (err: Error) => {
    if (!warned) {
      warned = true;
      console.warn(`[cache] Redis unavailable, falling back to passthrough: ${err.message}`);
    }
  });
  void redis.connect().catch(() => undefined);
  client = redis;
  return client;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** JSON round-trip loses Dates; revive ISO timestamps so cached and fresh results match. */
function reviveDates(_key: string, value: unknown): unknown {
  return typeof value === "string" && ISO_DATE.test(value) ? new Date(value) : value;
}

async function namespaceVersion(redis: Client, ns: string): Promise<string> {
  return (await redis.get(`mp:${ns}:ver`)) ?? "0";
}

function fullKey(ns: string, version: string, key: string): string {
  return `mp:${ns}:v${version}:${key}`;
}

export const cache = {
  /** True when a Redis URL is configured (not necessarily connected). */
  enabled(): boolean {
    return getClient() !== null;
  },

  async get<T>(ns: string, key: string): Promise<T | undefined> {
    const redis = getClient();
    if (!redis) return undefined;
    try {
      const version = await namespaceVersion(redis, ns);
      const raw = await redis.get(fullKey(ns, version, key));
      return raw === null ? undefined : (JSON.parse(raw, reviveDates) as T);
    } catch {
      return undefined;
    }
  },

  async set(
    ns: string,
    key: string,
    value: unknown,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const redis = getClient();
    if (!redis) return;
    try {
      const version = await namespaceVersion(redis, ns);
      await redis.set(fullKey(ns, version, key), JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Passthrough on failure; the caller already has the fresh value.
    }
  },

  /** Read-through helper: returns the cached value or computes, stores and returns it. */
  async wrap<T>(
    ns: string,
    key: string,
    fn: () => Promise<T>,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<T> {
    const hit = await cache.get<T>(ns, key);
    if (hit !== undefined) return hit;
    const value = await fn();
    await cache.set(ns, key, value, ttlSeconds);
    return value;
  },

  /** Invalidate every key in a namespace by bumping its version. */
  async invalidate(...namespaces: string[]): Promise<void> {
    const redis = getClient();
    if (!redis) return;
    try {
      await Promise.all(namespaces.map((ns) => redis.incr(`mp:${ns}:ver`)));
    } catch {
      // Best effort.
    }
  },

  async disconnect(): Promise<void> {
    if (client) {
      await client.quit().catch(() => undefined);
      client = undefined;
    }
  },
};

export type Cache = typeof cache;
