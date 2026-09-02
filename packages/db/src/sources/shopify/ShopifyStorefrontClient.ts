import { fetchWithTimeout, PerKeyRateLimiter, type FetchLike } from "../http";
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
  robotsAllowed: boolean;
  fetchedAt: Date;
};

export class StorefrontSkippedError extends Error {
  constructor(
    public readonly domain: string,
    public readonly reason: "negative-cache" | "robots" | "not-shopify" | "unreachable",
    message: string,
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
  /** Max products.json pages (250 products each). Default 4 => 1,000 products. */
  maxProductPages?: number;
  now?: () => Date;
};

/**
 * Reads a store's public storefront: the HTML head (Shopify markers, theme,
 * apps, currency) and /products.json. Respects robots.txt, identifies itself
 * with a descriptive User-Agent, never exceeds one request per second per
 * domain, and remembers dead domains so they are not re-hit daily.
 */
export class ShopifyStorefrontClient {
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: PerKeyRateLimiter;
  private readonly negative: NegativeCache;
  private readonly negativeTtlMs: number;
  private readonly maxProductPages: number;
  private readonly now: () => Date;

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
    this.maxProductPages = options.maxProductPages ?? 4;
    this.now = options.now ?? (() => new Date());
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
    if (!homeRes || !homeRes.ok) {
      await this.remember(domain, `home page ${homeRes ? homeRes.status : "unreachable"}`);
      throw new StorefrontSkippedError(
        domain,
        "unreachable",
        `${domain} returned ${homeRes ? homeRes.status : "no response"}`,
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
    if (isAllowedByRobots(robotsTxt, "/products.json", uaToken)) {
      const pages: ProductsJson[] = [];
      for (let page = 1; page <= this.maxProductPages; page++) {
        const res = await this.get(domain, `/products.json?limit=250&page=${page}`);
        if (!res || !res.ok) break;
        const json = (await res.json().catch(() => null)) as ProductsJson | null;
        if (!json || !Array.isArray(json.products)) break;
        pages.push(json);
        pagesFetched++;
        if (json.products.length < 250) break;
      }
      if (pagesFetched > 0) products = parseProducts(pages);
    }

    return {
      domain,
      isShopify: true,
      html,
      products,
      pagesFetched,
      robotsAllowed: true,
      fetchedAt: this.now(),
    };
  }

  private async remember(domain: string, reason: string): Promise<void> {
    await this.negative.set(domain, new Date(this.now().getTime() + this.negativeTtlMs), reason);
  }

  private async get(domain: string, path: string): Promise<Response | null> {
    await this.limiter.acquire(domain);
    try {
      return await fetchWithTimeout(this.fetchImpl, `https://${domain}${path}`, {
        headers: {
          "user-agent": this.userAgent,
          accept: path.endsWith(".json") ? "application/json" : "text/html,*/*",
        },
        redirect: "follow",
        timeoutMs: 15_000,
      });
    } catch {
      return null;
    }
  }
}
