import { backoffDelay, fetchWithTimeout, sleep, type FetchLike } from "../http";
import {
  AD_ARCHIVE_FIELDS,
  type AdActiveStatus,
  type AdArchiveItem,
  type AdArchivePage,
  type AdType,
  type GraphError,
} from "./types";

export const DEFAULT_GRAPH_VERSION = "v26.0";
export const DEFAULT_AD_COUNTRIES = ["FI", "SE", "DE"];

/** Thrown when no token is configured or Meta rejects it. Never swallowed into an empty result. */
export class MetaCredentialError extends Error {
  constructor(
    message: string,
    public readonly graphError?: GraphError,
  ) {
    super(message);
    this.name = "MetaCredentialError";
  }
}

export class MetaRateLimitError extends Error {
  constructor(
    message: string,
    public readonly graphError?: GraphError,
  ) {
    super(message);
    this.name = "MetaRateLimitError";
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly graphError?: GraphError,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export type MetaAdLibraryClientOptions = {
  accessToken: string | undefined;
  graphVersion?: string;
  fetch?: FetchLike;
  /** Max retries on rate limit / transient errors. */
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type AdArchiveQuery = {
  /** Meta page ids; the authoritative way to pull one advertiser's ads. */
  searchPageIds?: string[];
  searchTerms?: string;
  /** ISO country codes. Required by the API. Commercial ads are only returned for EU/UK delivery. */
  countries: string[];
  adActiveStatus?: AdActiveStatus;
  adType?: AdType;
  /** YYYY-MM-DD */
  adDeliveryDateMin?: string;
  limit?: number;
  after?: string;
  fields?: readonly string[];
};

export type AdArchiveResult = { items: AdArchiveItem[]; nextCursor: string | null };

// Graph API error codes that mean "slow down" (app/user/page rate limits).
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80004]);
// OAuthException codes for a missing/invalid/expired token or a permission problem.
const CREDENTIAL_CODES = new Set([100, 102, 104, 190, 200, 10]);

/**
 * Thin client for GET /{version}/ads_archive. Handles cursor pagination,
 * rate-limit backoff with jitter, and turns credential problems into a typed
 * error so an unconfigured or expired token is reported, not hidden behind
 * zero results.
 */
export class MetaAdLibraryClient {
  private readonly token: string | undefined;
  private readonly version: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: MetaAdLibraryClientOptions) {
    this.token = options.accessToken?.trim() || undefined;
    this.version = options.graphVersion ?? DEFAULT_GRAPH_VERSION;
    this.fetchImpl = options.fetch ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.sleepImpl = options.sleep ?? sleep;
    this.random = options.random ?? Math.random;
  }

  get configured(): boolean {
    return this.token !== undefined;
  }

  buildUrl(query: AdArchiveQuery): string {
    if (!this.token) throw new MetaCredentialError("META_ACCESS_TOKEN is not configured");
    if (!query.searchPageIds?.length && !query.searchTerms) {
      throw new Error("ads_archive requires search_page_ids or search_terms");
    }
    if (!query.countries.length) throw new Error("ads_archive requires ad_reached_countries");

    const params = new URLSearchParams();
    params.set("access_token", this.token);
    params.set("ad_reached_countries", JSON.stringify(query.countries));
    params.set("ad_active_status", query.adActiveStatus ?? "ALL");
    params.set("ad_type", query.adType ?? "ALL");
    params.set("fields", (query.fields ?? AD_ARCHIVE_FIELDS).join(","));
    params.set("limit", String(query.limit ?? 100));
    if (query.searchPageIds?.length) params.set("search_page_ids", query.searchPageIds.join(","));
    if (query.searchTerms) params.set("search_terms", query.searchTerms);
    if (query.adDeliveryDateMin) params.set("ad_delivery_date_min", query.adDeliveryDateMin);
    if (query.after) params.set("after", query.after);
    return `https://graph.facebook.com/${this.version}/ads_archive?${params.toString()}`;
  }

  /** One page. */
  async search(query: AdArchiveQuery): Promise<AdArchiveResult> {
    const url = this.buildUrl(query);
    const page = await this.request(url);
    return { items: page.data ?? [], nextCursor: page.paging?.cursors?.after ?? null };
  }

  /** Every page, lazily, up to `maxPages`. */
  async *iterate(query: AdArchiveQuery, maxPages = 50): AsyncGenerator<AdArchiveItem[]> {
    let after = query.after;
    for (let i = 0; i < maxPages; i++) {
      const { items, nextCursor } = await this.search({ ...query, after });
      yield items;
      if (!nextCursor || items.length === 0) return;
      after = nextCursor;
    }
  }

  private async request(url: string): Promise<AdArchivePage> {
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await fetchWithTimeout(this.fetchImpl, url, { timeoutMs: 30_000 });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        await this.sleepImpl(backoffDelay(attempt++, this.baseDelayMs, 60_000, this.random));
        continue;
      }

      const body = (await res.json().catch(() => ({}))) as AdArchivePage;
      const graphError = body.error;

      if (res.ok && !graphError) return body;

      const code = graphError?.code;
      if (
        res.status === 401 ||
        res.status === 403 ||
        (code !== undefined && CREDENTIAL_CODES.has(code))
      ) {
        throw new MetaCredentialError(
          `Meta rejected the access token (${graphError?.message ?? res.status}). Check META_ACCESS_TOKEN and its permissions.`,
          graphError,
        );
      }

      const rateLimited = res.status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code));
      const transient = res.status >= 500;
      if ((rateLimited || transient) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1_000
            : backoffDelay(attempt, this.baseDelayMs, 60_000, this.random);
        attempt++;
        await this.sleepImpl(delay);
        continue;
      }
      if (rateLimited) {
        throw new MetaRateLimitError(
          `Meta rate limit persisted after ${attempt} retries`,
          graphError,
        );
      }
      throw new MetaApiError(
        `ads_archive failed: ${graphError?.message ?? res.statusText}`,
        res.status,
        graphError,
      );
    }
  }
}
