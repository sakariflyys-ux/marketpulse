import type { Page } from "./pagination";
import type { SortOrder } from "./StoreRepository";

export type AdPlatformValue = "META" | "TIKTOK" | "GOOGLE";
export type AdSort =
  "engagement" | "spend" | "impressions" | "newest" | "relevance" | "longest_running";

export type AdListParams = {
  /** Full-text query over headline + bodyText. Enables `relevance` sort. */
  q?: string;
  platform?: AdPlatformValue;
  storeId?: string;
  /** Meta page id (live ads). */
  pageId?: string;
  /** Only ads still present in the archive (live) — mock ads are always active. */
  activeOnly?: boolean;
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

export type AdSource = "mock" | "meta_ad_library";

export type AdSummary = {
  id: string;
  platform: AdPlatformValue;
  creativeUrl: string;
  headline: string;
  bodyText: string;
  cta: string;
  /**
   * Mock-only metrics. Null for live ads — the Ad Library gives no spend or
   * engagement for commercial ads and nothing here is estimated.
   */
  spendEstimate: number | null;
  impressions: number | null;
  engagementRate: number | null;
  /** Ad Library impression range (political/issue ads) and EU reach (all EU ads). */
  impressionsLower: number | null;
  impressionsUpper: number | null;
  euTotalReach: number | null;
  targetAudience: TargetAudience | null;
  /** Null when a live ad's advertiser is not a tracked store; see pageId/pageName. */
  storeId: string | null;
  pageId: string | null;
  pageName: string | null;
  adLibraryId: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  active: boolean;
  source: AdSource;
  createdAt: Date;
  store: AdStoreRef | null;
};

export type AdDetail = AdSummary;

/** Data-source abstraction for ads. See StoreRepository for the rationale. */
export interface AdRepository {
  list(params: AdListParams): Promise<Page<AdSummary>>;
  getById(id: string): Promise<AdDetail | null>;
}
