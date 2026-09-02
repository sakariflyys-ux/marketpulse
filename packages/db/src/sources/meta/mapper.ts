import type { Prisma } from "../../../generated/prisma/client";
import type { AdArchiveItem, AdArchiveRange } from "./types";

export const META_AD_SOURCE = "meta_ad_library";

export type MappedAd = {
  adLibraryId: string;
  data: Omit<Prisma.AdUncheckedCreateInput, "id">;
};

export type MapContext = {
  /** Store to attach the ad to, when the advertiser is a tracked store. */
  storeId?: string | null;
  /** Time of observation, used for lastSeenAt when the ad is still delivering. */
  observedAt: Date;
};

function parseIntRange(range: AdArchiveRange | undefined): {
  lower: number | null;
  upper: number | null;
} {
  if (!range || typeof range !== "object") return { lower: null, upper: null };
  const toInt = (v: string | number | undefined): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return { lower: toInt(range.lower_bound), upper: toInt(range.upper_bound) };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function firstText(values: unknown): string | null {
  if (!Array.isArray(values)) return null;
  const s = values.find((v) => typeof v === "string" && v.trim());
  return typeof s === "string" ? s.trim() : null;
}

function toInt(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Maps one ads_archive item onto the Ad model.
 *
 * Nothing is invented: spend, impressions and engagement stay null (the
 * archive has no engagement at all, and spend/impression ranges only exist
 * for political/issue ads, where they are stored on impressionsLower/Upper).
 * Returns null when the item has no archive id — there is nothing to upsert on.
 */
export function mapArchiveAd(item: AdArchiveItem, ctx: MapContext): MappedAd | null {
  const adLibraryId = typeof item.id === "string" && item.id.trim() ? item.id.trim() : null;
  if (!adLibraryId) return null;

  const bodies = Array.isArray(item.ad_creative_bodies)
    ? item.ad_creative_bodies.filter(
        (b): b is string => typeof b === "string" && b.trim().length > 0,
      )
    : [];
  const title = firstText(item.ad_creative_link_titles);
  const body = bodies.join("\n\n");
  const headline = title ?? (bodies[0] ? truncate(bodies[0], 120) : "(no creative text)");

  const start = parseDate(item.ad_delivery_start_time);
  const stop = parseDate(item.ad_delivery_stop_time);
  const created = parseDate(item.ad_creation_time);
  const impressions = parseIntRange(item.impressions);

  const audience = {
    ...(Array.isArray(item.target_ages) && item.target_ages.length
      ? { ageRange: item.target_ages.join(", ") }
      : {}),
    ...(typeof item.target_gender === "string" && item.target_gender
      ? { gender: item.target_gender.toLowerCase() }
      : {}),
    ...(Array.isArray(item.target_locations) && item.target_locations.length
      ? {
          countries: item.target_locations
            .filter((l) => l && typeof l.name === "string" && !l.excluded)
            .map((l) => l.name as string),
        }
      : {}),
    ...(Array.isArray(item.languages) && item.languages.length
      ? { languages: item.languages }
      : {}),
  };

  return {
    adLibraryId,
    data: {
      platform: "META",
      creativeUrl: typeof item.ad_snapshot_url === "string" ? item.ad_snapshot_url : "",
      headline,
      bodyText: body,
      // The archive does not expose the CTA button; link caption (usually the
      // destination domain) is the closest public signal.
      cta: firstText(item.ad_creative_link_captions) ?? "",
      spendEstimate: null,
      impressions: null,
      engagementRate: null,
      impressionsLower: impressions.lower,
      impressionsUpper: impressions.upper,
      euTotalReach: toInt(item.eu_total_reach),
      targetAudience: Object.keys(audience).length ? audience : undefined,
      storeId: ctx.storeId ?? null,
      pageId: typeof item.page_id === "string" ? item.page_id : null,
      pageName: typeof item.page_name === "string" ? item.page_name : null,
      adLibraryId,
      firstSeenAt: start,
      // Still delivering => seen now; stopped => last delivery date.
      lastSeenAt: stop ?? (start ? ctx.observedAt : null),
      active: stop === null,
      source: META_AD_SOURCE,
      raw: item as Prisma.InputJsonValue,
      ...((created ?? start) ? { createdAt: (created ?? start) as Date } : {}),
    },
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
