import "server-only";
import { prisma } from "@marketpulse/db";

export type DashboardStats = {
  stores: number;
  ads: number;
  snapshots: number;
  totalMonthlyRevenue: number;
  topCategories: { category: string; count: number }[];
  latestSnapshotAt: Date | null;
};

/**
 * Lightweight aggregate for the dashboard welcome state. Goes straight to
 * Prisma rather than through the repository layer, which arrives in Phase 2
 * (these are DB-wide counts, not data-source-specific queries).
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [stores, ads, snapshots, revenue, categories, latest] = await Promise.all([
    prisma.store.count(),
    prisma.ad.count(),
    prisma.storeSnapshot.count(),
    prisma.store.aggregate({ _sum: { monthlyRevenue: true } }),
    prisma.store.groupBy({
      by: ["category"],
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 5,
    }),
    prisma.storeSnapshot.findFirst({
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    }),
  ]);

  return {
    stores,
    ads,
    snapshots,
    totalMonthlyRevenue: revenue._sum.monthlyRevenue ?? 0,
    topCategories: categories.map((c) => ({ category: c.category, count: c._count._all })),
    latestSnapshotAt: latest?.capturedAt ?? null,
  };
}
