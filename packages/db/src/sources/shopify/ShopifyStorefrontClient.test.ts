import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PerKeyRateLimiter } from "../http";
import {
  InMemoryNegativeCache,
  ShopifyStorefrontClient,
  StorefrontSkippedError,
} from "./ShopifyStorefrontClient";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

type Route = Record<string, () => Response>;

function makeClient(
  routes: Route,
  options: Partial<ConstructorParameters<typeof ShopifyStorefrontClient>[0]> = {},
) {
  const calls: { url: string; ua: string | null }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const ua = (init?.headers as Record<string, string> | undefined)?.["user-agent"] ?? null;
    calls.push({ url, ua });
    const path = new URL(url).pathname + new URL(url).search;
    const handler = routes[path] ?? routes[new URL(url).pathname];
    return handler ? handler() : new Response("not found", { status: 404 });
  });
  const client = new ShopifyStorefrontClient({
    fetch: fetchMock as unknown as typeof fetch,
    rateLimiter: new PerKeyRateLimiter(0),
    contactUrl: "https://synergilon.example/bot",
    ...options,
  });
  return { client, calls };
}

const html = (body: string) => () =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" } });
const json = (body: string) => () =>
  new Response(body, { status: 200, headers: { "content-type": "application/json" } });

describe("ShopifyStorefrontClient", () => {
  it("normalises domains", () => {
    expect(
      ShopifyStorefrontClient.normalizeDomain("https://WWW.Example-Linen.com/collections/all?x=1"),
    ).toBe("example-linen.com");
  });

  it("inspects a Shopify storefront with a descriptive user agent", async () => {
    const { client, calls } = makeClient({
      "/robots.txt": () => new Response(fixture("robots-shopify-default.txt")),
      "/": html(fixture("shopify-home.html")),
      "/products.json?limit=250&page=1": json(fixture("products.json")),
    });
    const result = await client.inspect("example-linen.com");
    expect(result.isShopify).toBe(true);
    expect(result.html.theme).toBe("Dawn");
    expect(result.products?.count).toBe(4);
    expect(result.pagesFetched).toBe(1);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/robots.txt",
      "/",
      "/products.json",
    ]);
    expect(calls[0]!.ua).toMatch(/SynergilonBot\/1\.0/);
    expect(calls[0]!.ua).toContain("https://synergilon.example/bot");
  });

  it("skips domains whose robots.txt disallows us", async () => {
    const { client, calls } = makeClient({
      "/robots.txt": () => new Response(fixture("robots-disallow.txt")),
    });
    await expect(client.inspect("blocked.example")).rejects.toMatchObject({ reason: "robots" });
    expect(calls).toHaveLength(1);
  });

  it("records non-Shopify and unreachable domains in the negative cache", async () => {
    const negativeCache = new InMemoryNegativeCache();
    const { client, calls } = makeClient(
      { "/": html(fixture("not-shopify.html")) },
      { negativeCache },
    );
    await expect(client.inspect("blog.example")).rejects.toMatchObject({ reason: "not-shopify" });
    expect(await negativeCache.get("blog.example")).toBeInstanceOf(Date);
    // Second call is served from the cache without any HTTP request.
    const before = calls.length;
    await expect(client.inspect("blog.example")).rejects.toBeInstanceOf(StorefrontSkippedError);
    expect(calls.length).toBe(before);

    const dead = makeClient({}, { negativeCache });
    await expect(dead.client.inspect("dead.example")).rejects.toMatchObject({
      reason: "unreachable",
    });
    expect(await negativeCache.get("dead.example")).not.toBeNull();
  });

  it("paginates products.json until a short page and caps the page count", async () => {
    const full = {
      products: Array.from({ length: 250 }, (_, i) => ({
        id: i,
        title: `P${i}`,
        variants: [{ price: "10.00" }],
      })),
    };
    const { client, calls } = makeClient(
      {
        "/": html(fixture("shopify-home.html")),
        "/products.json?limit=250&page=1": json(JSON.stringify(full)),
        "/products.json?limit=250&page=2": json(JSON.stringify(full)),
        "/products.json?limit=250&page=3": json(
          JSON.stringify({ products: full.products.slice(0, 7) }),
        ),
      },
      { maxProductPages: 4 },
    );
    const result = await client.inspect("big.example");
    expect(result.products?.count).toBe(507);
    expect(result.pagesFetched).toBe(3);
    expect(calls.filter((c) => c.url.includes("products.json"))).toHaveLength(3);
  });

  it("never sends more than one request per second per domain", async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new PerKeyRateLimiter(
      1_000,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );
    await limiter.acquire("a.example");
    await limiter.acquire("a.example");
    await limiter.acquire("b.example");
    now += 400;
    await limiter.acquire("a.example");
    expect(waits).toEqual([1000, 600]);
  });
});
