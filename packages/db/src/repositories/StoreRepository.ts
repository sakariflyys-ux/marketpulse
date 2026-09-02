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

/** Where a row came from: the Faker seed or an ingestion job. */
export type StoreSource = "mock" | "shopify_storefront";
export type EstimateConfidence = "none" | "low" | "medium";

export type StoreSummary = {
  id: string;
  shopifyDomain: string;
  name: string;
  description: string | null;
  logo: string | null;
  category: string;
  /** Measured figures exist only for mock stores; null for live rows. */
  monthlyRevenue: number | null;
  monthlyTraffic: number | null;
  /** Storefront-derived estimate and how much to trust it. */
  revenueEstimate: number | null;
  estimateConfidence: EstimateConfidence | null;
  /** Observable storefront signals (live rows). */
  productCount: number | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  source: StoreSource;
  sourceUpdatedAt: Date | null;
  topProduct: TopProduct | null;
  techStack: TechStack | null;
  lastScrapedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Which snapshot column the trending growth figure was computed from. */
export type GrowthMetric = "monthlyRevenue" | "productCount";

export type TrendingStore = StoreSummary & {
  /** Growth of `growthMetric` over the last 7 snapshots as a fraction (0.12 = +12%). Null when history is too short. */
  growth: number | null;
  growthMetric: GrowthMetric;
  latestRevenue: number | null;
  priorRevenue: number | null;
};

export type SnapshotPoint = {
  capturedAt: Date;
  monthlyRevenue: number | null;
  monthlyTraffic: number | null;
  productCount: number | null;
  priceMin: number | null;
  priceMax: number | null;
  revenueEstimate: number | null;
  source: string | null;
};

export type StoreAdSummary = {
  id: string;
  platform: "META" | "TIKTOK" | "GOOGLE";
  creativeUrl: string;
  headline: string;
  cta: string;
  /** Null for live ads: the Ad Library does not expose spend or engagement for commercial ads. */
  spendEstimate: number | null;
  impressions: number | null;
  engagementRate: number | null;
  euTotalReach: number | null;
  source: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  active: boolean;
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
