import { describe, expect, it, vi } from "vitest";
import commercial from "../sources/meta/__fixtures__/commercial-eu.json";
import political from "../sources/meta/__fixtures__/political-range.json";
import { MetaAdLibraryClient } from "../sources/meta";
import type { AdArchiveItem, AdArchivePage } from "../sources/meta";
import { ShopifyStorefrontClient } from "../sources/shopify";
import { PerKeyRateLimiter } from "../sources/http";
import { readFileSync } from "node:fs";
import {
  brandQuery,
  runIngestAds,
  runIngestStores,
  type IngestDb,
  type TrackedEntityRow,
} from "./ingest";

vi.mock("../client", () => ({ prisma: {} }));

/** In-memory IngestDb so the jobs run end to end on fixtures. */
function memoryDb(entities: TrackedEntityRow[]) {
  const ads = new Map<
    string,
    {
      data: Record<string, unknown>;
      firstSeenAt: Date | null;
      lastSeenAt: Date | null;
      active: boolean;
    }
  >();
  const stores = new Map<string, Record<string, unknown>>();
  const snapshots: { storeId: string; data: Record<string, unknown> }[] = [];
  const runs: {
    id: string;
    source: string;
    status: string;
    itemsSeen?: number;
    itemsWritten?: number;
    error?: string | null;
  }[] = [];
  const db: IngestDb = {
    async listTracked(kind) {
      return entities.filter((e) => e.kind === kind);
    },
    async markTracked(id, patch) {
      const e = entities.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
    },
    async findStoreIdByDomain(domain) {
      return stores.has(domain) ? `store:${domain}` : null;
    },
    async upsertAd(ad, observedAt) {
      const existing = ads.get(ad.adLibraryId);
      const first = (ad.data.firstSeenAt as Date | null) ?? null;
      const last = (ad.data.lastSeenAt as Date | null) ?? observedAt;
      if (existing) {
        existing.data = ad.data as Record<string, unknown>;
        existing.firstSeenAt =
          existing.firstSeenAt && first
            ? existing.firstSeenAt < first
              ? existing.firstSeenAt
              : first
            : (existing.firstSeenAt ?? first);
        existing.lastSeenAt = last;
        existing.active = Boolean(ad.data.active);
        return "updated";
      }
      ads.set(ad.adLibraryId, {
        data: ad.data as Record<string, unknown>,
        firstSeenAt: first,
        lastSeenAt: last,
        active: Boolean(ad.data.active),
      });
      return "created";
    },
    async deactivateMissingAds(pageId, seen, observedAt) {
      let n = 0;
      for (const [id, ad] of ads) {
        if (ad.data["pageId"] === pageId && ad.active && !seen.includes(id)) {
          ad.active = false;
          ad.lastSeenAt = observedAt;
          n++;
        }
      }
      return n;
    },
    async upsertStore(domain, data) {
      stores.set(domain, data as Record<string, unknown>);
      return `store:${domain}`;
    },
    async createSnapshot(storeId, data) {
      snapshots.push({ storeId, data: data as Record<string, unknown> });
    },
    async startRun(source) {
      const id = `run${runs.length + 1}`;
      runs.push({ id, source, status: "RUNNING" });
      return id;
    },
    async finishRun(id, patch) {
      Object.assign(
        runs.find((r) => r.id === id)!,
        patch,
      );
    },
  };
  return { db, ads, stores, snapshots, runs };
}

function metaClient(pagesByCall: AdArchivePage[][]) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const pages = pagesByCall[Math.min(call, pagesByCall.length - 1)]!;
    call++;
    const page = pages.shift() ?? { data: [] };
    return new Response(JSON.stringify(page), { status: 200 });
  });
  return new MetaAdLibraryClient({
    accessToken: "T",
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => undefined,
  });
}

const brand: TrackedEntityRow = {
  id: "e1",
  kind: "BRAND",
  value: "100200300",
  label: "Example Linen",
  linkedDomain: "example-linen.com",
  active: true,
  lastRunAt: null,
  lastError: null,
};

describe("brandQuery", () => {
  it("uses page ids for numeric values and search terms otherwise", () => {
    expect(brandQuery("100200300")).toEqual({ searchPageIds: ["100200300"] });
    expect(brandQuery("Example Linen")).toEqual({ searchTerms: "Example Linen" });
  });
});

describe("runIngestAds", () => {
  it("is idempotent: a second run over the same fixtures keeps the row count and bumps lastSeenAt", async () => {
    const t1 = new Date("2026-09-01T00:00:00Z");
    const t2 = new Date("2026-09-02T00:00:00Z");
    const items = [commercial, political] as AdArchiveItem[];
    const client = metaClient([[{ data: items }], [{ data: items }]]);
    const { db, ads, runs } = memoryDb([brand]);

    const first = await runIngestAds(client, db, { countries: ["FI"], now: () => t1 });
    expect(first.status).toBe("SUCCESS");
    expect(first.itemsSeen).toBe(2);
    expect(first.itemsWritten).toBe(2);
    expect(ads.size).toBe(2);
    expect(ads.get("1234567890123456")!.lastSeenAt).toEqual(t1);

    const second = await runIngestAds(client, db, { countries: ["FI"], now: () => t2 });
    expect(second.status).toBe("SUCCESS");
    expect(ads.size).toBe(2);
    expect(ads.get("1234567890123456")!.lastSeenAt).toEqual(t2);
    // The stopped political ad keeps its stop date as last seen.
    expect(ads.get("9876543210")!.lastSeenAt).toEqual(new Date("2026-03-30"));
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === "SUCCESS")).toBe(true);
    expect(brand.lastRunAt).toEqual(t2);
  });

  it("marks ads that disappeared as inactive instead of deleting them", async () => {
    const t1 = new Date("2026-09-01T00:00:00Z");
    const t2 = new Date("2026-09-05T00:00:00Z");
    const both = [
      commercial,
      { ...commercial, id: "second", ad_creative_link_titles: ["Other"] },
    ] as AdArchiveItem[];
    const client = metaClient([[{ data: both }], [{ data: [commercial as AdArchiveItem] }]]);
    const { db, ads } = memoryDb([brand]);
    await runIngestAds(client, db, { countries: ["FI"], now: () => t1 });
    const result = await runIngestAds(client, db, { countries: ["FI"], now: () => t2 });
    expect(ads.size).toBe(2);
    expect(ads.get("second")!.active).toBe(false);
    expect(ads.get("second")!.lastSeenAt).toEqual(t2);
    expect(ads.get("1234567890123456")!.active).toBe(true);
    expect(result.entities[0]!.deactivated).toBe(1);
  });

  it("records FAILED with a clear message when credentials are missing", async () => {
    const client = new MetaAdLibraryClient({ accessToken: undefined });
    const { db, runs } = memoryDb([brand]);
    const result = await runIngestAds(client, db, { countries: ["FI"] });
    expect(result.status).toBe("FAILED");
    expect(result.error).toMatch(/META_ACCESS_TOKEN/);
    expect(runs[0]!.status).toBe("FAILED");
  });

  it("continues past a failing entity and records PARTIAL", async () => {
    const bad: TrackedEntityRow = { ...brand, id: "e2", value: "999", label: "Broken" };
    const good = [commercial] as AdArchiveItem[];
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      return call === 1
        ? new Response(JSON.stringify({ data: good }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: 1, message: "Unknown error" } }), {
            status: 500,
          });
    });
    const client = new MetaAdLibraryClient({
      accessToken: "T",
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
      maxRetries: 0,
    });
    const { db } = memoryDb([brand, bad]);
    const result = await runIngestAds(client, db, { countries: ["FI"] });
    expect(result.status).toBe("PARTIAL");
    expect(result.itemsWritten).toBe(1);
    expect(bad.lastError).toMatch(/Unknown error/);
  });
});

describe("runIngestStores", () => {
  const fixture = (name: string) =>
    readFileSync(new URL(`../sources/shopify/__fixtures__/${name}`, import.meta.url), "utf8");
  function storefrontClient() {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "dead.example") return new Response("", { status: 503 });
      if (url.pathname === "/robots.txt")
        return new Response(fixture("robots-shopify-default.txt"));
      if (url.pathname === "/") return new Response(fixture("shopify-home.html"));
      if (url.pathname === "/products.json") return new Response(fixture("products.json"));
      return new Response("", { status: 404 });
    });
    return new ShopifyStorefrontClient({
      fetch: fetchMock as unknown as typeof fetch,
      rateLimiter: new PerKeyRateLimiter(0),
    });
  }

  it("writes one snapshot per run and upserts the store idempotently", async () => {
    const entities: TrackedEntityRow[] = [
      {
        id: "s1",
        kind: "STORE",
        value: "example-linen.com",
        label: null,
        linkedDomain: null,
        active: true,
        lastRunAt: null,
        lastError: null,
      },
    ];
    const { db, stores, snapshots, runs } = memoryDb(entities);
    const client = storefrontClient();
    await runIngestStores(client, db);
    await runIngestStores(client, db);
    expect(stores.size).toBe(1);
    expect(snapshots).toHaveLength(2);
    expect(stores.get("example-linen.com")).toMatchObject({
      monthlyRevenue: null,
      productCount: 4,
      source: "shopify_storefront",
    });
    expect(runs.map((r) => r.status)).toEqual(["SUCCESS", "SUCCESS"]);
  });

  it("keeps going when a domain is dead and reports PARTIAL", async () => {
    const entities: TrackedEntityRow[] = [
      {
        id: "s1",
        kind: "STORE",
        value: "dead.example",
        label: null,
        linkedDomain: null,
        active: true,
        lastRunAt: null,
        lastError: null,
      },
      {
        id: "s2",
        kind: "STORE",
        value: "example-linen.com",
        label: null,
        linkedDomain: null,
        active: true,
        lastRunAt: null,
        lastError: null,
      },
    ];
    const { db, runs } = memoryDb(entities);
    const result = await runIngestStores(storefrontClient(), db);
    expect(result.status).toBe("PARTIAL");
    expect(result.itemsWritten).toBe(1);
    expect(entities[0]!.lastError).toMatch(/503/);
    expect(runs[0]!.error).toMatch(/1 of 2/);
  });
});
