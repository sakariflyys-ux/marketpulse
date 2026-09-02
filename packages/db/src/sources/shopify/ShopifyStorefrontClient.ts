import { fetchWithTimeout, PerKeyRateLimiter, sleep, type FetchLike } from "../http";
import {
  isAllowedByRobots,
  parseProducts,
  parseStorefrontHtml,
  type ParsedHtml,
  type ParsedProducts,
  type ProductsJson,
} from "./parse";

export const DEFAULT_USER_AGENT =
  "SynergilonBot/1.0 (+https://github.com/sakariflyys-ux/marketpulse; market research; contact via repo)";

/** Products per products.json page (Shopify's maximum). */
export const PRODUCTS_PAGE_SIZE = 250;
/** Hard cap on pages per crawl: 40 × 250 = 10,000 products. */
export const DEFAULT_MAX_PRODUCT_PAGES = 40;

/** Remembers domains that failed so they are not re-hit every run. */
export interface NegativeCache {
  /** Returns the time until which the domain should be skipped, or null. */
  get(domain: string): Promise<Date | null>;
  set(domain: string, until: Date, reason: string): Promise<void>;
}

export class InMemoryNegativeCache implements NegativeCache {
  private readonly map = new Map<string, Date>();
  async get(domain: string): Promise<Date | null> {
    const until = this.map.get(domain);
    if (!until) return null;
    if (until.getTime() <= Date.now()) {
      this.map.delete(domain);
      return null;
    }
    return until;
  }
  async set(domain: string, until: Date): Promise<void> {
    this.map.set(domain, until);
  }
}

export type StorefrontInspection = {
  domain: string;
  isShopify: boolean;
  html: ParsedHtml;
  products: ParsedProducts | null;
  /** Number of products.json pages fetched (each up to 250 products). */
  pagesFetched: number;
  /** True when the crawl stopped at the hard page cap; the count is a floor. */
  productCountTruncated: boolean;
  robotsAllowed: boolean;
  fetchedAt: Date;
};

export type SkipReason = "negative-cache" | "robots" | "not-shopify" | "unreachable" | "blocked";

export class StorefrontSkippedError extends Error {
  constructor(
    public readonly domain: string,
    public readonly reason: SkipReason,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "StorefrontSkippedError";
  }
}

export type ShopifyStorefrontClientOptions = {
  userAgent?: string;
  contactUrl?: string;
  fetch?: FetchLike;
  rateLimiter?: PerKeyRateLimiter;
  negativeCache?: NegativeCache;
  /** How long to skip a failed domain. Default 7 days. */
  negativeTtlMs?: number;
  /** Max products.json pages (250 products each). Default 40 => 10,000 products. */
  maxProductPages?: number;
  now?: () => Date;
  /** Progress callback so a 40-page crawl doesn't look like a hang. */
  log?: (message: string) => void;
  /** Wait used for the single 429 retry (default: real timer). */
  wait?: (ms: number) => Promise<void>;
};

/**
 * Reads a store's public storefront: the HTML head (Shopify markers, theme,
 * apps, currency, name candidates) and every /products.json page. Respects
 * robots.txt, identifies itself with a descriptive User-Agent, never exceeds
 * one request per second per domain, retries a 429 once, reports a 403 as
 * "blocked", and remembers dead domains so they are not re-hit daily.
 */
export class ShopifyStorefrontClient {
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: PerKeyRateLimiter;
  private readonly negative: NegativeCache;
  private readonly negativeTtlMs: number;
  private readonly maxProductPages: number;
  private readonly now: () => Date;
  private readonly log: (message: string) => void;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(options: ShopifyStorefrontClientOptions = {}) {
    const base = options.userAgent ?? DEFAULT_USER_AGENT;
    this.userAgent =
      options.contactUrl && !base.includes(options.contactUrl)
        ? `${base} (+${options.contactUrl})`
        : base;
    this.fetchImpl = options.fetch ?? fetch;
    this.limiter = options.rateLimiter ?? new PerKeyRateLimiter(1_000);
    this.negative = options.negativeCache ?? new InMemoryNegativeCache();
    this.negativeTtlMs = options.negativeTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.maxProductPages = options.maxProductPages ?? DEFAULT_MAX_PRODUCT_PAGES;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (() => undefined);
    this.wait = options.wait ?? sleep;
  }

  /** Normalises user input like "https://Shop.Example.com/collections" to "shop.example.com". */
  static normalizeDomain(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[/?#].*$/, "");
  }

  async inspect(rawDomain: string): Promise<StorefrontInspection> {
    const domain = ShopifyStorefrontClient.normalizeDomain(rawDomain);
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      throw new StorefrontSkippedError(
        domain,
        "unreachable",
        `"${rawDomain}" is not a valid domain`,
      );
    }

    const skipUntil = await this.negative.get(domain);
    if (skipUntil) {
      throw new StorefrontSkippedError(
        domain,
        "negative-cache",
        `${domain} failed recently; skipped until ${skipUntil.toISOString()}`,
      );
    }

    const robots = await this.get(domain, "/robots.txt");
    const robotsTxt = robots?.ok ? await robots.text() : null;
    const uaToken = this.userAgent.split("/")[0] ?? this.userAgent;
    if (
      !isAllowedByRobots(robotsTxt, "/", uaToken) &&
      !isAllowedByRobots(robotsTxt, "/products.json", uaToken)
    ) {
      throw new StorefrontSkippedError(
        domain,
        "robots",
        `${domain} disallows crawling in robots.txt`,
      );
    }

    const homeRes = await this.get(domain, "/");
    if (homeRes && homeRes.status === 403) {
      // Bot-blocked. Not remembered as "dead": the ingestion records it as
      // blocked so repeated runs deprioritise it instead of hammering it.
      throw new StorefrontSkippedError(domain, "blocked", `${domain} returned 403 (blocked)`, 403);
    }
    if (!homeRes || !homeRes.ok) {
      await this.remember(domain, `home page ${homeRes ? homeRes.status : "unreachable"}`);
      throw new StorefrontSkippedError(
        domain,
        "unreachable",
        `${domain} returned ${homeRes ? homeRes.status : "no response"}`,
        homeRes?.status,
      );
    }
    const html = parseStorefrontHtml(await homeRes.text());
    if (!html.isShopify) {
      await this.remember(domain, "not a Shopify storefront");
      throw new StorefrontSkippedError(
        domain,
        "not-shopify",
        `${domain} does not look like a Shopify storefront`,
      );
    }

    let products: ParsedProducts | null = null;
    let pagesFetched = 0;
    let truncated = false;
    if (isAllowedByRobots(robotsTxt, "/products.json", uaToken)) {
      const crawl = await this.crawlProducts(domain);
      pagesFetched = crawl.pages.length;
      truncated = crawl.truncated;
      if (pagesFetched > 0) products = parseProducts(crawl.pages);
    }

    return {
      domain,
      isShopify: true,
      html,
      products,
      pagesFetched,
      productCountTruncated: truncated,
      robotsAllowed: true,
      fetchedAt: this.now(),
    };
  }

  /**
   * Walks /products.json 250 at a time. Shopify honours `page=N`; some
   * storefronts ignore it and return page 1 forever, in which case the crawl
   * switches to the `since_id` cursor. Stops at a short page, a repeated
   * page, or the hard cap (then `truncated` is true).
   */
  private async crawlProducts(
    domain: string,
  ): Promise<{ pages: ProductsJson[]; truncated: boolean }> {
    const pages: ProductsJson[] = [];
    const seenIds = new Set<string>();
    let mode: "page" | "since_id" = "page";
    let lastId: string | null = null;
    let truncated = false;
    let switchedForPage: number | null = null;

    for (let page = 1; page <= this.maxProductPages; page++) {
      const path =
        mode === "page"
          ? `/products.json?limit=${PRODUCTS_PAGE_SIZE}&page=${page}`
          : `/products.json?limit=${PRODUCTS_PAGE_SIZE}&since_id=${lastId}`;
      const res = await this.get(domain, path);
      if (!res || !res.ok) break;
      const json = (await res.json().catch(() => null)) as ProductsJson | null;
      if (!json || !Array.isArray(json.products)) break;

      const ids = json.products.map((p) => String(p.id ?? "")).filter(Boolean);
      const allSeen = ids.length > 0 && ids.every((id) => seenIds.has(id));
      if (allSeen && mode === "page" && page > 1 && switchedForPage !== page) {
        // The endpoint ignored `page`; retry this step with since_id.
        mode = "since_id";
        switchedForPage = page;
        page--;
        continue;
      }
      if (allSeen) break;
      for (const id of ids) seenIds.add(id);
      if (ids.length) lastId = ids[ids.length - 1]!;
      pages.push(json);
      this.log(`${domain}: products.json page ${page} (${seenIds.size} products so far)`);
      if (json.products.length < PRODUCTS_PAGE_SIZE) break;
      if (page === this.maxProductPages) truncated = true;
    }
    return { pages, truncated };
  }

  private async remember(domain: string, reason: string): Promise<void> {
    await this.negative.set(domain, new Date(this.now().getTime() + this.negativeTtlMs), reason);
  }

  private async get(domain: string, path: string, retried = false): Promise<Response | null> {
    await this.limiter.acquire(domain);
    let res: Response;
    try {
      res = await fetchWithTimeout(this.fetchImpl, `https://${domain}${path}`, {
        headers: {
          "user-agent": this.userAgent,
          accept: path.includes(".json") ? "application/json" : "text/html,*/*",
        },
        redirect: "follow",
        timeoutMs: 15_000,
      });
    } catch {
      return null;
    }
    if (res.status === 429 && !retried) {
      // One retry after Retry-After (seconds) or 30s, then give up on this request.
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 30_000;
      this.log(`${domain}: 429 on ${path}, retrying once in ${Math.round(delay / 1000)}s`);
      await this.wait(delay);
      return this.get(domain, path, true);
    }
    return res;
  }
}
