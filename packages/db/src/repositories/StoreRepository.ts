import type { Page } from "./pagination";

export type StoreSort = "revenue" | "traffic" | "newest" | "name" | "relevance";
export type SortOrder = "asc" | "desc";

export type StoreListParams = {
  /** Full-text query over name + description. Enables `relevance` sort. */
  q?: string;
  category?: string;
  minRevenue?: number;
  maxRevenue?: number;
  minTraffic?: number;
  maxTraffic?: number;
  sort: StoreSort;
  order: SortOrder;
  limit: number;
  cursor?: string;
};

export type TrendingParams = {
  category?: string;
  limit: number;
  cursor?: string;
};

export type TopProduct = { name: string; price: number; imageUrl?: string };
export type TechStack = { theme?: string; apps?: string[] };

export type StoreSummary = {
  id: string;
  shopifyDomain: string;
  name: string;
  description: string | null;
  logo: string | null;
  category: string;
  monthlyRevenue: number;
  monthlyTraffic: number;
  topProduct: TopProduct | null;
  techStack: TechStack | null;
  lastScrapedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TrendingStore = StoreSummary & {
  /** Revenue growth over the last 7 snapshots as a fraction (0.12 = +12%). Null when history is too short. */
  growth: number | null;
  latestRevenue: number | null;
  priorRevenue: number | null;
};

export type SnapshotPoint = { capturedAt: Date; monthlyRevenue: number; monthlyTraffic: number };

export type StoreAdSummary = {
  id: string;
  platform: "META" | "TIKTOK" | "GOOGLE";
  creativeUrl: string;
  headline: string;
  cta: string;
  spendEstimate: number;
  impressions: number;
  engagementRate: number;
  createdAt: Date;
};

export type StoreDetail = StoreSummary & {
  snapshots: SnapshotPoint[];
  ads: StoreAdSummary[];
  adCount: number;
};

export type CategoryCount = { category: string; count: number };

/**
 * Data-source abstraction for stores. The mock implementation reads the
 * Faker-seeded Postgres tables; a future ShopifyStoreRepository would pull
 * from real APIs (and may still cache into Postgres). Both may use
 * Postgres-specific features — this interface abstracts the *source*, not SQL.
 */
export interface StoreRepository {
  list(params: StoreListParams): Promise<Page<StoreSummary>>;
  trending(params: TrendingParams): Promise<Page<TrendingStore>>;
  getByDomain(domain: string): Promise<StoreDetail | null>;
  categories(): Promise<CategoryCount[]>;
}
