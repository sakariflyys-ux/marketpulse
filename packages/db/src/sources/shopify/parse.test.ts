import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateRevenue } from "./estimate";
import { isAllowedByRobots, parseProducts, parseStorefrontHtml } from "./parse";
import { mapStorefront } from "./mapper";
import type { StorefrontInspection } from "./ShopifyStorefrontClient";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseStorefrontHtml", () => {
  it("detects Shopify, theme, apps and currency", () => {
    const parsed = parseStorefrontHtml(fixture("shopify-home.html"));
    expect(parsed.isShopify).toBe(true);
    expect(parsed.theme).toBe("Dawn");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.apps).toEqual(
      expect.arrayContaining(["Klaviyo", "Judge.me", "Gorgias", "Google Analytics"]),
    );
    expect(parsed.apps).not.toContain("Recharge");
    expect(parsed.title).toBe("Example Linen | Breathable linen shirts");
    expect(parsed.description).toBe("Linen shirts & trousers made in Portugal.");
  });

  it("rejects non-Shopify pages", () => {
    const parsed = parseStorefrontHtml(fixture("not-shopify.html"));
    expect(parsed.isShopify).toBe(false);
    expect(parsed.theme).toBeNull();
    expect(parsed.apps).toEqual([]);
  });

  it("survives malformed HTML and broken theme JSON", () => {
    const parsed = parseStorefrontHtml(fixture("malformed.html"));
    expect(parsed.isShopify).toBe(true);
    expect(parsed.theme).toBe("Impulse");
    expect(parsed.currency).toBeNull();
  });

  it("handles non-string input", () => {
    expect(parseStorefrontHtml(undefined as unknown as string).isShopify).toBe(false);
  });
});

describe("parseProducts", () => {
  it("counts products, computes price range and skips unparsable prices", () => {
    const parsed = parseProducts([JSON.parse(fixture("products.json"))]);
    expect(parsed.count).toBe(4);
    expect(parsed.priceMin).toBe(25);
    expect(parsed.priceMax).toBe(250);
    expect(parsed.top[0]).toEqual({
      name: "Classic Linen Shirt",
      price: 89,
      imageUrl: "https://cdn.shopify.com/s/files/1/0001/products/shirt.jpg",
      handle: "classic-linen-shirt",
    });
    expect(parsed.top[3]!.price).toBeNull();
    expect(parsed.productTypes[0]).toBe("Shirts");
  });

  it("returns nulls for an empty catalogue", () => {
    const parsed = parseProducts([{ products: [] }, {} as never]);
    expect(parsed).toMatchObject({ count: 0, priceMin: null, priceMax: null, top: [] });
  });
});

describe("isAllowedByRobots", () => {
  it("allows everything when there is no robots.txt", () => {
    expect(isAllowedByRobots(null, "/products.json", "SynergilonBot")).toBe(true);
  });
  it("respects a blanket disallow for * while other agents are allowed", () => {
    const txt = fixture("robots-disallow.txt");
    expect(isAllowedByRobots(txt, "/", "SynergilonBot")).toBe(false);
    expect(isAllowedByRobots(txt, "/products.json", "SynergilonBot")).toBe(false);
    expect(isAllowedByRobots(txt, "/", "Googlebot")).toBe(true);
  });
  it("allows products.json under Shopify's default robots.txt", () => {
    const txt = fixture("robots-shopify-default.txt");
    expect(isAllowedByRobots(txt, "/products.json", "SynergilonBot")).toBe(true);
    expect(isAllowedByRobots(txt, "/", "SynergilonBot")).toBe(true);
    expect(isAllowedByRobots(txt, "/admin", "SynergilonBot")).toBe(false);
    expect(isAllowedByRobots(txt, "/collections/all?sort_by=price", "SynergilonBot")).toBe(false);
  });
});

describe("estimateRevenue", () => {
  it("returns null with confidence none when inputs are missing", () => {
    expect(estimateRevenue({ productCount: null, priceMin: 10, priceMax: 20 })).toMatchObject({
      revenueEstimate: null,
      confidence: "none",
    });
    expect(estimateRevenue({ productCount: 10, priceMin: null, priceMax: null })).toMatchObject({
      revenueEstimate: null,
      confidence: "none",
    });
    expect(estimateRevenue({ productCount: 0, priceMin: 10, priceMax: 20 })).toMatchObject({
      revenueEstimate: null,
      confidence: "none",
    });
  });
  it("produces a low-confidence order-of-magnitude figure from catalogue and prices", () => {
    const r = estimateRevenue({ productCount: 40, priceMin: 25, priceMax: 100 });
    // sqrt(25*100)=50 typical price × 40 products × 0.75 units = 1500
    expect(r).toMatchObject({ revenueEstimate: 1500, confidence: "low" });
    expect(r.method).toMatch(/not a measurement/);
  });
  it("tightens confidence when reviews corroborate, without changing the figure", () => {
    const a = estimateRevenue({ productCount: 40, priceMin: 25, priceMax: 100 });
    const b = estimateRevenue({ productCount: 40, priceMin: 25, priceMax: 100, reviewCount: 120 });
    expect(b.revenueEstimate).toBe(a.revenueEstimate);
    expect(b.confidence).toBe("medium");
  });
});

describe("mapStorefront", () => {
  it("writes only observed signals plus a labelled estimate; measured revenue stays null", () => {
    const inspection: StorefrontInspection = {
      domain: "example-linen.com",
      isShopify: true,
      html: parseStorefrontHtml(fixture("shopify-home.html")),
      products: parseProducts([JSON.parse(fixture("products.json"))]),
      pagesFetched: 1,
      robotsAllowed: true,
      fetchedAt: new Date("2026-09-01T00:00:00Z"),
    };
    const mapped = mapStorefront(inspection);
    expect(mapped.data.name).toBe("Example Linen");
    expect(mapped.data.monthlyRevenue).toBeNull();
    expect(mapped.data.monthlyTraffic).toBeNull();
    expect(mapped.data.source).toBe("shopify_storefront");
    expect(mapped.data.productCount).toBe(4);
    expect(mapped.data.priceMin).toBe(25);
    expect(mapped.data.priceMax).toBe(250);
    expect(mapped.data.currency).toBe("EUR");
    expect(mapped.data.category).toBe("Shirts");
    expect(mapped.data.estimateConfidence).toBe("low");
    expect(mapped.data.revenueEstimate).toBeGreaterThan(0);
    expect(mapped.data.techStack).toEqual({
      theme: "Dawn",
      apps: expect.arrayContaining(["Klaviyo"]),
    });
    expect(mapped.snapshot).toMatchObject({
      monthlyRevenue: null,
      productCount: 4,
      source: "shopify_storefront",
    });
  });

  it("degrades to no estimate when products.json was unavailable", () => {
    const inspection: StorefrontInspection = {
      domain: "closed.example",
      isShopify: true,
      html: parseStorefrontHtml(fixture("malformed.html")),
      products: null,
      pagesFetched: 0,
      robotsAllowed: true,
      fetchedAt: new Date(),
    };
    const mapped = mapStorefront(inspection);
    expect(mapped.data.revenueEstimate).toBeNull();
    expect(mapped.data.estimateConfidence).toBe("none");
    expect(mapped.data.productCount).toBeNull();
    expect(mapped.data.category).toBe("Uncategorized");
    expect(mapped.data.topProduct).toBeUndefined();
  });
});
