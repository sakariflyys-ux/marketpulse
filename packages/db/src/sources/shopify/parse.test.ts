import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseProducts, parseStorefrontHtml, type ProductsJson } from "./parse";
import { mapStorefront } from "./mapper";

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

describe("mapStorefront", () => {
  const html = parseStorefrontHtml(fixture("shopify-home.html"));
  const products = parseProducts([JSON.parse(fixture("products.json")) as ProductsJson]);
  const base = {
    domain: "example-linen.com",
    isShopify: true as const,
    html,
    pagesFetched: 1,
    productCountTruncated: false,
    robotsAllowed: true as const,
    fetchedAt: new Date("2026-09-01T00:00:00Z"),
  };

  it("writes only observed signals; measured revenue stays null and no estimate is written", () => {
    const mapped = mapStorefront({ ...base, products });
    expect(mapped.data.name).toBe("Example Linen");
    expect(mapped.data.pageTitle).toBe("Example Linen | Breathable linen shirts");
    expect(mapped.data.monthlyRevenue).toBeNull();
    expect(mapped.data.monthlyTraffic).toBeNull();
    expect(mapped.data.revenueEstimate).toBeNull();
    expect(mapped.data.estimateConfidence).toBeNull();
    expect(mapped.data.productCount).toBe(4);
    expect(mapped.data.productCountTruncated).toBe(false);
    expect(mapped.data.priceMin).toBe(25);
    expect(mapped.data.priceMax).toBe(250);
    expect(mapped.data.currency).toBe("EUR");
    expect(mapped.data.category).toBe("Apparel");
    expect(mapped.data.rawTags).toEqual(["Shirts", "Trousers"]);
    expect(mapped.data.techStack).toEqual({
      theme: "Dawn",
      apps: ["Klaviyo", "Gorgias", "Judge.me", "Google Analytics"],
    });
    expect(mapped.data.source).toBe("shopify_storefront");
    expect(mapped.snapshot.productCount).toBe(4);
    expect(mapped.snapshot.revenueEstimate).toBeNull();
    expect(mapped.snapshot.monthlyRevenue).toBeNull();
  });

  it("degrades gracefully when products.json was unavailable", () => {
    const mapped = mapStorefront({ ...base, products: null });
    expect(mapped.data.productCount).toBeNull();
    expect(mapped.data.priceMin).toBeNull();
    expect(mapped.data.category).toBe("Other");
    expect(mapped.data.rawTags).toEqual([]);
    expect(mapped.data.revenueEstimate).toBeNull();
  });
});
