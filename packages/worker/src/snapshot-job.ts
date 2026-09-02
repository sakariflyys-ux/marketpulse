import { prisma } from "@synergilon/db";
import { cache } from "@synergilon/db/cache";

export type SnapshotJobResult = {
  stores: number;
  snapshots: number;
  maxDriftPct: number;
  durationMs: number;
};

const DEFAULT_MAX_DRIFT_PCT = 5;

/**
 * Bounded random drift, read from SNAPSHOT_MAX_DRIFT_PCT (default 5 = ±5%).
 * Clamped to [0, 50] so a typo can't wipe the dataset.
 */
export function resolveMaxDriftPct(): number {
  const raw = Number(process.env["SNAPSHOT_MAX_DRIFT_PCT"] ?? DEFAULT_MAX_DRIFT_PCT);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_DRIFT_PCT;
  return Math.min(50, Math.max(0, raw));
}

/**
 * Drifts every store's revenue/traffic by an independent random factor in
 * [1 - pct, 1 + pct] and records the new values as a StoreSnapshot.
 *
 * Done as one SQL statement so 10k stores take a single round trip: the
 * UPDATE ... RETURNING feeds the INSERT via a CTE, and both see the same
 * random draw per row. Traffic drifts with a partially correlated factor
 * (revenue and visits move together, but not in lockstep).
 */
export async function runSnapshotJob(): Promise<SnapshotJobResult> {
  const started = Date.now();
  const pct = resolveMaxDriftPct() / 100;

  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH drifted AS (
      UPDATE "Store" s
      SET "monthlyRevenue" = GREATEST(500, round(s."monthlyRevenue" * (1 + (random() * 2 - 1) * ${pct}))),
          "monthlyTraffic" = GREATEST(50, round(s."monthlyTraffic" * (1 + (random() * 2 - 1) * ${pct * 0.8})))::int,
          "lastScrapedAt"  = now(),
          "updatedAt"      = now()
      RETURNING s.id, s."monthlyRevenue", s."monthlyTraffic"
    ),
    inserted AS (
      INSERT INTO "StoreSnapshot" (id, "storeId", "monthlyRevenue", "monthlyTraffic", "capturedAt")
      SELECT gen_random_uuid()::text, id, "monthlyRevenue", "monthlyTraffic", now()
      FROM drifted
      RETURNING id
    )
    SELECT count(*)::bigint AS count FROM inserted`;

  const snapshots = Number(rows[0]?.count ?? 0);

  // Stores' revenue/traffic and the trending ranking changed, so every cached
  // repository read is stale. Ads embed store data, so bump both namespaces.
  await cache.invalidate("stores", "ads");

  return { stores: snapshots, snapshots, maxDriftPct: pct * 100, durationMs: Date.now() - started };
}
