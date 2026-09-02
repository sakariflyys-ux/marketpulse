import type { EstimateConfidence } from "../../repositories/StoreRepository";

export type EstimateInput = {
  productCount: number | null;
  priceMin: number | null;
  priceMax: number | null;
  /** Review count when a review widget exposes it publicly; usually unknown. */
  reviewCount?: number | null;
};

export type RevenueEstimate = {
  revenueEstimate: number | null;
  confidence: EstimateConfidence;
  /** Human-readable method, surfaced in the UI on hover. */
  method: string;
};

export const ESTIMATE_METHOD_TEXT =
  "catalogue size × typical price × an assumed monthly sell-through band (0.75 units/product for small catalogues, tapering for large ones). Public storefronts expose no sales data; this is an order-of-magnitude estimate, not a measurement.";

/**
 * Order-of-magnitude revenue estimate from what a public storefront shows.
 *
 * Deliberately crude and deliberately labelled. Assumptions:
 *   - typical price = geometric mean of the observed min/max (robust to one
 *     outlier accessory or bundle),
 *   - monthly units per product tapers with catalogue size (large catalogues
 *     have a long tail): 0.75 for <=50 products, 0.5 up to 500, 0.25 beyond,
 *   - review volume, when known, tightens confidence but not the number.
 * Confidence: "none" when a required input is missing (estimate null),
 * "low" from catalogue + prices, "medium" when review volume corroborates.
 */
export function estimateRevenue(input: EstimateInput): RevenueEstimate {
  const { productCount, priceMin, priceMax } = input;
  if (
    productCount === null ||
    productCount <= 0 ||
    priceMin === null ||
    priceMax === null ||
    priceMax <= 0
  ) {
    return { revenueEstimate: null, confidence: "none", method: ESTIMATE_METHOD_TEXT };
  }
  const typicalPrice = Math.sqrt(Math.max(priceMin, 0.01) * priceMax);
  const unitsPerProduct = productCount <= 50 ? 0.75 : productCount <= 500 ? 0.5 : 0.25;
  const revenue = Math.round(productCount * unitsPerProduct * typicalPrice);
  const confidence: EstimateConfidence =
    typeof input.reviewCount === "number" && input.reviewCount > 0 ? "medium" : "low";
  return { revenueEstimate: revenue, confidence, method: ESTIMATE_METHOD_TEXT };
}
