import type { Page } from "./pagination";
import type { SortOrder } from "./StoreRepository";

export type AdPlatformValue = "META" | "TIKTOK" | "GOOGLE";
export type AdSort = "engagement" | "spend" | "impressions" | "newest" | "relevance";

export type AdListParams = {
  /** Full-text query over headline + bodyText. Enables `relevance` sort. */
  q?: string;
  platform?: AdPlatformValue;
  storeId?: string;
  minEngagement?: number;
  maxEngagement?: number;
  minSpend?: number;
  maxSpend?: number;
  sort: AdSort;
  order: SortOrder;
  limit: number;
  cursor?: string;
};

export type TargetAudience = {
  ageRange?: string;
  gender?: string;
  interests?: string[];
  countries?: string[];
};

export type AdStoreRef = { id: string; name: string; shopifyDomain: string; logo: string | null };

export type AdSummary = {
  id: string;
  platform: AdPlatformValue;
  creativeUrl: string;
  headline: string;
  bodyText: string;
  cta: string;
  spendEstimate: number;
  impressions: number;
  engagementRate: number;
  targetAudience: TargetAudience | null;
  storeId: string;
  createdAt: Date;
  store: AdStoreRef;
};

export type AdDetail = AdSummary;

/** Data-source abstraction for ads. See StoreRepository for the rationale. */
export interface AdRepository {
  list(params: AdListParams): Promise<Page<AdSummary>>;
  getById(id: string): Promise<AdDetail | null>;
}
