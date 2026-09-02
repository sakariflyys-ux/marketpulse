/**
 * Why a metric can be missing. Shown as the tooltip on every "—" so a blank
 * cell is never mistaken for zero. Keep the wording factual.
 */
export const MISSING_REASON = {
  adMetric:
    "Not available: Meta's Ad Library does not publish spend, impressions or engagement for commercial ads.",
  adSightings: "Not tracked for sample data: first/last seen dates come from Ad Library ingestion.",
  storeMeasured: "Not measured: public storefronts do not expose revenue or traffic.",
  storeEstimate: "No estimate: not enough public signals (product count, prices) to compute one.",
  noHistory: "Not enough snapshot history yet.",
} as const;

export type MissingReason = keyof typeof MISSING_REASON;

export const ESTIMATE_METHOD =
  "Estimate from public storefront signals: catalogue size × median price × an assumed monthly sell-through band. Confidence reflects how many signals were available. Not a measurement.";
