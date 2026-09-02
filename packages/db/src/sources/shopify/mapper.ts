import type { Prisma } from "../../../generated/prisma/client";
import { estimateRevenue } from "./estimate";
import type { StorefrontInspection } from "./ShopifyStorefrontClient";

export const SHOPIFY_STORE_SOURCE = "shopify_storefront";

export type MappedStore = {
  domain: string;
  data: Omit<Prisma.StoreUncheckedCreateInput, "id" | "shopifyDomain">;
  snapshot: Omit<Prisma.StoreSnapshotUncheckedCreateInput, "id" | "storeId">;
};

/** Best-effort category from the dominant product_type; "Uncategorized" otherwise. */
function categoryFrom(inspection: StorefrontInspection): string {
  const type = inspection.products?.productTypes[0];
  return type && type.length <= 40 ? type : "Uncategorized";
}

/**
 * Maps a storefront inspection onto Store + StoreSnapshot. Measured
 * revenue/traffic stay null; the estimate is written to revenueEstimate with
 * its confidence and is the only derived figure.
 */
export function mapStorefront(inspection: StorefrontInspection): MappedStore {
  const products = inspection.products;
  const estimate = estimateRevenue({
    productCount: products?.count ?? null,
    priceMin: products?.priceMin ?? null,
    priceMax: products?.priceMax ?? null,
  });
  const top = products?.top[0];
  const name = inspection.html.title?.replace(/\s*[|–-].*$/, "").trim() || inspection.domain;

  return {
    domain: inspection.domain,
    data: {
      name,
      description: inspection.html.description,
      logo: null,
      category: categoryFrom(inspection),
      monthlyRevenue: null,
      monthlyTraffic: null,
      revenueEstimate: estimate.revenueEstimate,
      estimateConfidence: estimate.confidence,
      productCount: products?.count ?? null,
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
      revenueEstimate: estimate.revenueEstimate,
      source: SHOPIFY_STORE_SOURCE,
      capturedAt: inspection.fetchedAt,
    },
  };
}
