/**
 * Catalogue value: descriptive statistics of the prices a storefront lists.
 *
 * This is NOT a revenue proxy and must never be presented as one. A catalogue
 * of 2,000 items at $40 says nothing about how many sell. Phase 7 shipped a
 * "revenue estimate" built on exactly that assumption and it was off by
 * orders of magnitude; it was removed in Phase 7.1. `Store.revenueEstimate`
 * and `Store.estimateConfidence` remain in the schema but are no longer
 * written or read by the live path.
 */
export type CatalogValue = {
  /** Products with a parseable price. */
  pricedProducts: number;
  /** Mean of each product's first-variant price. */
  averagePrice: number | null;
  /** Sum of each product's first-variant price — the value of one of everything. */
  listedValue: number | null;
};

export function catalogValue(prices: number[]): CatalogValue {
  const valid = prices.filter((p) => Number.isFinite(p) && p >= 0);
  if (valid.length === 0) return { pricedProducts: 0, averagePrice: null, listedValue: null };
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    pricedProducts: valid.length,
    averagePrice: Math.round((sum / valid.length) * 100) / 100,
    listedValue: Math.round(sum * 100) / 100,
  };
}
