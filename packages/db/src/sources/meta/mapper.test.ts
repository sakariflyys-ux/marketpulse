import { describe, expect, it } from "vitest";
import commercial from "./__fixtures__/commercial-eu.json";
import political from "./__fixtures__/political-range.json";
import sparse from "./__fixtures__/sparse.json";
import { mapArchiveAd } from "./mapper";
import type { AdArchiveItem } from "./types";

const observedAt = new Date("2026-09-01T00:00:00Z");

describe("mapArchiveAd", () => {
  it("maps a commercial EU ad without inventing spend or engagement", () => {
    const mapped = mapArchiveAd(commercial as AdArchiveItem, { storeId: "store_1", observedAt });
    expect(mapped).not.toBeNull();
    const d = mapped!.data;
    expect(mapped!.adLibraryId).toBe("1234567890123456");
    expect(d.platform).toBe("META");
    expect(d.headline).toBe("Linen shirts – 20% off");
    expect(d.bodyText).toContain("Summer sale");
    expect(d.cta).toBe("example-linen.com");
    expect(d.creativeUrl).toContain("render_ad");
    // Metrics the archive does not provide stay null.
    expect(d.spendEstimate).toBeNull();
    expect(d.impressions).toBeNull();
    expect(d.engagementRate).toBeNull();
    expect(d.impressionsLower).toBeNull();
    expect(d.impressionsUpper).toBeNull();
    // EU reach is the one real reach number for commercial ads.
    expect(d.euTotalReach).toBe(48213);
    expect(d.storeId).toBe("store_1");
    expect(d.pageId).toBe("100200300");
    expect(d.pageName).toBe("Example Linen");
    expect(d.firstSeenAt).toEqual(new Date("2026-06-02"));
    // Still delivering: last seen is the observation time, ad is active.
    expect(d.lastSeenAt).toEqual(observedAt);
    expect(d.active).toBe(true);
    expect(d.source).toBe("meta_ad_library");
    expect(d.targetAudience).toEqual({
      ageRange: "25, 54",
      gender: "women",
      countries: ["Finland", "Sweden"],
      languages: ["en", "fi"],
    });
    expect(d.raw).toEqual(commercial);
    expect(d.createdAt).toEqual(new Date("2026-06-01"));
  });

  it("stores political impression ranges on the range columns and keeps impressions null", () => {
    const mapped = mapArchiveAd(political as AdArchiveItem, { observedAt });
    const d = mapped!.data;
    expect(d.impressions).toBeNull();
    expect(d.impressionsLower).toBe(10000);
    expect(d.impressionsUpper).toBe(14999);
    expect(d.spendEstimate).toBeNull();
    expect(d.euTotalReach).toBeNull();
    // Stopped ads are inactive and last seen at their stop date.
    expect(d.active).toBe(false);
    expect(d.lastSeenAt).toEqual(new Date("2026-03-30"));
    expect(d.storeId).toBeNull();
    // No link title: falls back to the body.
    expect(d.headline).toBe("Vote on Sunday.");
  });

  it("tolerates missing and malformed fields", () => {
    const mapped = mapArchiveAd(sparse as AdArchiveItem, { observedAt });
    const d = mapped!.data;
    expect(d.headline).toBe("(no creative text)");
    expect(d.bodyText).toBe("");
    expect(d.cta).toBe("");
    expect(d.creativeUrl).toBe("");
    expect(d.firstSeenAt).toBeNull();
    expect(d.lastSeenAt).toBeNull();
    expect(d.impressionsLower).toBeNull();
    expect(d.impressionsUpper).toBeNull();
    expect(d.euTotalReach).toBeNull();
    expect(d.targetAudience).toBeUndefined();
    expect(d.createdAt).toBeUndefined();
  });

  it("returns null when there is no archive id to upsert on", () => {
    expect(mapArchiveAd({ page_id: "1" }, { observedAt })).toBeNull();
    expect(mapArchiveAd({ id: "   " }, { observedAt })).toBeNull();
  });

  it("truncates a long body used as a headline", () => {
    const long = "x".repeat(300);
    const mapped = mapArchiveAd({ id: "1", ad_creative_bodies: [long] }, { observedAt });
    expect(mapped!.data.headline.length).toBe(120);
    expect(mapped!.data.bodyText).toBe(long);
  });
});
