import { describe, expect, it, vi } from "vitest";
import { PerKeyRateLimiter } from "../http";
import { ShopifyStorefrontClient, StorefrontSkippedError } from "./ShopifyStorefrontClient";
import { mapStorefront } from "./mapper";

const HOME =
  '<html><head><title>Big Store | Everything</title><meta property="og:site_name" content="Big Store"><script>Shopify.theme = {"name":"Dawn"};</script><script src="https://cdn.shopify.com/a.js"></script></head></html>';

function product(
  id: number,
  price: number,
  type = "T-Shirts",
  tags: string[] = ["Mens>Apparel>SS Tops>t_shirt"],
) {
  return {
    id,
    title: `Product ${id}`,
    handle: `product-${id}`,
    product_type: type,
    tags,
    variants: [{ price: String(price) }],
  };
}

/** Fake storefront with `total` products, honouring page= (and optionally only since_id). */
function fakeStore(
  total: number,
  opts: { ignorePage?: boolean; rateLimitFirst?: boolean; forbidden?: boolean } = {},
) {
  const all = Array.from({ length: total }, (_, i) => product(1000 + i, 10 + (i % 50) * 5));
  let hits429 = 0;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (opts.forbidden) return new Response("blocked", { status: 403 });
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /admin\n");
    if (url.pathname === "/") return new Response(HOME);
    if (url.pathname === "/products.json") {
      if (opts.rateLimitFirst && hits429 === 0) {
        hits429++;
        return new Response("", { status: 429, headers: { "retry-after": "2" } });
      }
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const sinceId = url.searchParams.get("since_id");
      const page = Number(url.searchParams.get("page") ?? 1);
      let slice: typeof all;
      if (sinceId) {
        const idx = all.findIndex((p) => String(p.id) === sinceId);
        slice = all.slice(idx + 1, idx + 1 + limit);
      } else if (opts.ignorePage) {
        slice = all.slice(0, limit);
      } else {
        slice = all.slice((page - 1) * limit, page * limit);
      }
      return new Response(JSON.stringify({ products: slice }));
    }
    return new Response("", { status: 404 });
  });
  const waits: number[] = [];
  const client = new ShopifyStorefrontClient({
    fetch: fetchMock as unknown as typeof fetch,
    rateLimiter: new PerKeyRateLimiter(0),
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  return { client, calls, waits };
}

describe("products.json paging", () => {
  it("walks past the old 1,000 cap and computes the price range over every page", async () => {
    const { client, calls } = fakeStore(1200);
    const result = await client.inspect("big.example");
    expect(result.products!.count).toBe(1200);
    expect(result.pagesFetched).toBe(5);
    expect(result.productCountTruncated).toBe(false);
    expect(result.products!.priceMin).toBe(10);
    expect(result.products!.priceMax).toBe(255); // only reachable on later pages
    expect(calls.filter((c) => c.includes("products.json")).length).toBe(5);
  });

  it("flags truncation at the hard cap", async () => {
    const { client } = fakeStore(1300);
    const capped = new ShopifyStorefrontClient({
      fetch: (client as unknown as { fetchImpl: typeof fetch }).fetchImpl,
      rateLimiter: new PerKeyRateLimiter(0),
      maxProductPages: 4,
    });
    const result = await capped.inspect("big.example");
    expect(result.products!.count).toBe(1000);
    expect(result.productCountTruncated).toBe(true);
    const mapped = mapStorefront(result);
    expect(mapped.data.productCountTruncated).toBe(true);
    expect(mapped.data.productCount).toBe(1000);
  });

  it("switches to since_id when the endpoint ignores page=", async () => {
    const { client, calls } = fakeStore(600, { ignorePage: true });
    const result = await client.inspect("big.example");
    expect(result.products!.count).toBe(600);
    expect(calls.some((c) => c.includes("since_id="))).toBe(true);
  });

  it("retries a 429 once after Retry-After", async () => {
    const { client, waits } = fakeStore(300, { rateLimitFirst: true });
    const result = await client.inspect("big.example");
    expect(waits).toEqual([2000]);
    expect(result.products!.count).toBe(300);
  });

  it("reports a 403 as blocked without touching the negative cache", async () => {
    const { client } = fakeStore(10, { forbidden: true });
    await expect(client.inspect("blocked.example")).rejects.toMatchObject({
      reason: "blocked",
      status: 403,
    });
    // Not remembered as dead: a second call still tries (and is blocked again).
    await expect(client.inspect("blocked.example")).rejects.toBeInstanceOf(StorefrontSkippedError);
  });
});

describe("mapStorefront (Phase 7.1)", () => {
  it("writes measured fields only, raw tags and a normalised category, and no estimate", async () => {
    const { client } = fakeStore(20);
    const mapped = mapStorefront(await client.inspect("big.example"));
    expect(mapped.data.name).toBe("Big Store");
    expect(mapped.data.pageTitle).toBe("Big Store | Everything");
    expect(mapped.data.category).toBe("Apparel");
    expect(mapped.data.rawTags).toEqual(["Mens>Apparel>SS Tops>t_shirt", "T-Shirts"]);
    expect(mapped.data.revenueEstimate).toBeNull();
    expect(mapped.data.estimateConfidence).toBeNull();
    expect(mapped.data.monthlyRevenue).toBeNull();
    expect(mapped.snapshot.revenueEstimate).toBeNull();
    expect(mapped.data.productCount).toBe(20);
  });
});
