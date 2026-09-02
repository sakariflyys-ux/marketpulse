import type { Prisma } from "../../../generated/prisma/client";
import { categorize } from "./categories";
import { resolveStoreName } from "./parse";
import type { StorefrontInspection } from "./ShopifyStorefrontClient";

export const SHOPIFY_STORE_SOURCE = "shopify_storefront";

/** Cap on stored raw tags: the most common ones carry the signal. */
export const MAX_RAW_TAGS = 50;

export type MappedStore = {
  domain: string;
  data: Omit<Prisma.StoreUncheckedCreateInput, "id" | "shopifyDomain">;
  snapshot: Omit<Prisma.StoreSnapshotUncheckedCreateInput, "id" | "storeId">;
};

/**
 * Maps a storefront inspection onto Store + StoreSnapshot.
 *
 * Only measured values are written: product count (with the truncation
 * flag), price range across the whole crawl, currency, theme, apps, raw
 * tags and a category normalised from them. Revenue and traffic stay null
 * and nothing derived is written in their place — the Phase 7 "estimate"
 * was removed because catalogue size is not a revenue signal.
 */
export function mapStorefront(inspection: StorefrontInspection): MappedStore {
  const products = inspection.products;
  const tagCounts = products?.tagCounts ?? [];
  const rawTags = tagCounts.slice(0, MAX_RAW_TAGS).map((t) => t.value);
  const top = products?.top[0];
  const name = resolveStoreName(inspection.html, inspection.domain);

  return {
    domain: inspection.domain,
    data: {
      name,
      pageTitle: inspection.html.title,
      description: inspection.html.description,
      logo: null,
      category: categorize(tagCounts),
      rawTags,
      monthlyRevenue: null,
      monthlyTraffic: null,
      revenueEstimate: null,
      estimateConfidence: null,
      productCount: products?.count ?? null,
      productCountTruncated: inspection.productCountTruncated,
      priceMin: products?.priceMin ?? null,
      priceMax: products?.priceMax ?? null,
      currency: inspection.html.currency,
      source: SHOPIFY_STORE_SOURCE,
      sourceUpdatedAt: inspection.fetchedAt,
      lastScrapedAt: inspection.fetchedAt,
      topProduct: top
        ? { name: top.name, price: top.price ?? 0, imageUrl: top.imageUrl ?? undefined }
        : undefined,
      techStack: { theme: inspection.html.theme ?? undefined, apps: inspection.html.apps },
    },
    snapshot: {
      monthlyRevenue: null,
      monthlyTraffic: null,
      productCount: products?.count ?? null,
      priceMin: products?.priceMin ?? null,
      priceMax: products?.priceMax ?? null,
      revenueEstimate: null,
      source: SHOPIFY_STORE_SOURCE,
      capturedAt: inspection.fetchedAt,
    },
  };
}
