import { beforeEach, describe, expect, it, vi } from "vitest";

// Repositories run raw SQL through the shared client; stub it so these tests
// exercise the nullable-field mapping and cursor logic with fixture rows only.
const queryRaw = vi.fn();
vi.mock("../client", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args), store: {}, ad: {} },
}));

import { LiveAdRepository } from "./live/LiveAdRepository";
import { LiveStoreRepository } from "./live/LiveStoreRepository";
import { MockAdRepository } from "./mock/MockAdRepository";
import { decodeKeysetCursor, encodeCursor, toPage } from "./pagination";
import { resolveDataSource } from "./index";

const liveAdRow = {
  id: "ad_live",
  platform: "META",
  creativeUrl: "https://www.facebook.com/ads/archive/render_ad/?id=1",
  headline: "Linen shirts – 20% off",
  bodyText: "Summer sale",
  cta: "example-linen.com",
  spendEstimate: null,
  impressions: null,
  engagementRate: null,
  impressionsLower: null,
  impressionsUpper: null,
  euTotalReach: 48213,
  targetAudience: null,
  storeId: null,
  pageId: "100200300",
  pageName: "Example Linen",
  adLibraryId: "1",
  firstSeenAt: new Date("2026-06-02"),
  lastSeenAt: new Date("2026-09-01"),
  active: true,
  source: "meta_ad_library",
  createdAt: new Date("2026-06-01"),
  store: null,
  _sort: 91,
};

type SqlLike = { strings: readonly string[]; values: readonly unknown[] };

/** Renders a tagged-template call (strings + values, with nested Prisma.Sql fragments) to text. */
function render(strings: readonly string[], values: readonly unknown[]): string {
  return strings.reduce((out, str, i) => {
    const value = values[i];
    if (i >= values.length) return out + str;
    const isSql =
      typeof value === "object" && value !== null && "strings" in value && "values" in value;
    return (
      out + str + (isSql ? render((value as SqlLike).strings, (value as SqlLike).values) : "?")
    );
  }, "");
}

function sqlText(call: unknown[]): string {
  const [strings, ...values] = call as [readonly string[], ...unknown[]];
  return render(strings, values);
}

beforeEach(() => queryRaw.mockReset());

describe("resolveDataSource", () => {
  it("accepts mock and live, maps the deprecated shopify alias to live, rejects junk", () => {
    expect(resolveDataSource("mock")).toBe("mock");
    expect(resolveDataSource("live")).toBe("live");
    expect(resolveDataSource("shopify")).toBe("live");
    expect(resolveDataSource(undefined)).toBe("mock");
    expect(() => resolveDataSource("nope")).toThrow(/mock" or "live/);
  });
});

describe("LiveAdRepository.list", () => {
  it("passes null metrics through untouched and keeps a null store", async () => {
    queryRaw.mockResolvedValueOnce([liveAdRow]);
    const page = await new LiveAdRepository().list({
      sort: "longest_running",
      order: "desc",
      limit: 10,
    });
    expect(page.data).toHaveLength(1);
    const ad = page.data[0]!;
    expect(ad.spendEstimate).toBeNull();
    expect(ad.impressions).toBeNull();
    expect(ad.engagementRate).toBeNull();
    expect(ad.euTotalReach).toBe(48213);
    expect(ad.store).toBeNull();
    expect(ad.pageName).toBe("Example Linen");
    expect("_sort" in ad).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("scopes to non-mock rows, defaults to longest_running, and orders nulls last", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await new LiveAdRepository().list({ sort: "relevance", order: "desc", limit: 5 });
    const text = sqlText(queryRaw.mock.calls[0]!);
    expect(text).toContain("a.source <> 'mock'");
    expect(text).toContain('a."lastSeenAt" - a."firstSeenAt"');
    expect(text).toContain("NULLS LAST");
  });

  it("encodes a null sort value into the cursor and decodes it back", async () => {
    const rows = [
      { ...liveAdRow, id: "a1", _sort: null },
      { ...liveAdRow, id: "a2", _sort: null },
    ];
    queryRaw.mockResolvedValueOnce(rows);
    const page = await new LiveAdRepository().list({ sort: "engagement", order: "desc", limit: 1 });
    expect(page.data.map((a) => a.id)).toEqual(["a1"]);
    expect(decodeKeysetCursor(page.nextCursor!)).toEqual({ v: null, id: "a1" });
  });
});

describe("MockAdRepository.list", () => {
  it("scopes to mock rows and defaults to engagement", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await new MockAdRepository().list({ sort: "relevance", order: "desc", limit: 5 });
    const text = sqlText(queryRaw.mock.calls[0]!);
    expect(text).toContain("a.source = 'mock'");
    expect(text).toContain('a."engagementRate"');
  });
});

describe("LiveStoreRepository.trending", () => {
  it("ranks on product count and labels the metric; null growth stays null", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: "s1",
        shopifyDomain: "example-linen.com",
        name: "Example Linen",
        description: null,
        logo: null,
        category: "Shirts",
        monthlyRevenue: null,
        monthlyTraffic: null,
        revenueEstimate: 1500,
        estimateConfidence: "low",
        productCount: 42,
        priceMin: 25,
        priceMax: 250,
        currency: "EUR",
        source: "shopify_storefront",
        sourceUpdatedAt: new Date(),
        topProduct: null,
        techStack: null,
        lastScrapedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latestRevenue: 42,
        priorRevenue: null,
        growth: null,
      },
    ]);
    const page = await new LiveStoreRepository().trending({ limit: 10 });
    const store = page.data[0]!;
    expect(store.growthMetric).toBe("productCount");
    expect(store.growth).toBeNull();
    expect(store.monthlyRevenue).toBeNull();
    expect(store.revenueEstimate).toBe(1500);
    const text = sqlText(queryRaw.mock.calls[0]!);
    expect(text).toContain('"productCount"');
    expect(text).toContain("s.source <> 'mock'");
  });
});

describe("pagination helpers", () => {
  it("round-trips keyset cursors including null values", () => {
    const cursor = encodeCursor({ v: null, id: "x" });
    expect(decodeKeysetCursor(cursor)).toEqual({ v: null, id: "x" });
    expect(toPage([1, 2, 3], 2, (last) => ({ o: last })).data).toEqual([1, 2]);
  });
});
