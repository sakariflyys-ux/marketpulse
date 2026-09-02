/**
 * Shapes of the Meta Ad Library (`/ads_archive`) API as observed. Every field
 * is optional: the archive omits fields it does not have for an ad, and the
 * set differs between political/issue ads and commercial EU ads.
 *
 * Verified against Meta's own Ad-Library-API-Script-Repository and Radlibrary
 * (facebookresearch) field lists; the developer docs themselves were not
 * reachable from the build environment, so the client keeps the Graph
 * version configurable (META_GRAPH_VERSION).
 */
export type AdArchiveRange = { lower_bound?: string | number; upper_bound?: string | number };

export type AdArchiveItem = {
  id?: string;
  ad_creation_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  bylines?: string;
  currency?: string;
  estimated_audience_size?: AdArchiveRange;
  /** Political/issue ads only. Commercial ads never carry this. */
  impressions?: AdArchiveRange;
  /** Political/issue ads only. */
  spend?: AdArchiveRange;
  languages?: string[];
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  /** EU transparency fields (ads delivered in the EU). */
  eu_total_reach?: number | string;
  target_ages?: string[];
  target_gender?: string;
  target_locations?: { name?: string; type?: string; excluded?: boolean }[];
  beneficiary_payers?: { beneficiary?: string; payer?: string; current?: boolean }[];
  age_country_gender_reach_breakdown?: unknown[];
  [key: string]: unknown;
};

export type AdArchivePage = {
  data?: AdArchiveItem[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
  error?: GraphError;
};

export type GraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export const AD_ARCHIVE_FIELDS = [
  "id",
  "ad_creation_time",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_descriptions",
  "ad_creative_link_titles",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "bylines",
  "currency",
  "estimated_audience_size",
  "impressions",
  "languages",
  "page_id",
  "page_name",
  "publisher_platforms",
  "spend",
  "eu_total_reach",
  "target_ages",
  "target_gender",
  "target_locations",
  "beneficiary_payers",
] as const;

export type AdActiveStatus = "ACTIVE" | "INACTIVE" | "ALL";
export type AdType =
  "ALL" | "POLITICAL_AND_ISSUE_ADS" | "HOUSING_ADS" | "EMPLOYMENT_ADS" | "CREDIT_ADS";
