import type { SnapshotPoint } from "@synergilon/db/repositories";

export type GrowthResult = { growth: number | null; metric: "monthlyRevenue" | "productCount" };

/**
 * Mirrors the trending query: latest vs. 7 snapshots earlier, on revenue for
 * sample stores and on the observable product count for live stores.
 */
export function growthFromSnapshots(
  snapshots: Pick<SnapshotPoint, "monthlyRevenue" | "productCount">[],
): GrowthResult {
  const hasRevenue = snapshots.some((s) => s.monthlyRevenue !== null);
  const metric = hasRevenue ? "monthlyRevenue" : "productCount";
  const series = snapshots.map((s) => s[metric]).filter((v): v is number => v !== null);
  if (series.length < 7) return { growth: null, metric };
  const latest = series[series.length - 1]!;
  const prior = series[series.length - 7]!;
  return { growth: prior > 0 ? (latest - prior) / prior : null, metric };
}
