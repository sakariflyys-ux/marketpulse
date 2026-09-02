import { afterEach, describe, expect, it } from "vitest";
import { adCountries, INGEST_JOBS } from "./ingest-jobs";

const original = process.env["META_AD_COUNTRIES"];
afterEach(() => {
  if (original === undefined) delete process.env["META_AD_COUNTRIES"];
  else process.env["META_AD_COUNTRIES"] = original;
});

describe("adCountries", () => {
  it("defaults to FI, SE, DE", () => {
    delete process.env["META_AD_COUNTRIES"];
    expect(adCountries()).toEqual(["FI", "SE", "DE"]);
  });
  it("parses a comma list, upper-cases and drops junk", () => {
    process.env["META_AD_COUNTRIES"] = " fi, nl ,x, ALL,de ";
    expect(adCountries()).toEqual(["FI", "NL", "DE"]);
  });
});

describe("INGEST_JOBS", () => {
  it("declares both jobs with their cron env vars", () => {
    expect(INGEST_JOBS.map((j) => [j.name, j.cronEnv])).toEqual([
      ["ingest-ads", "INGEST_ADS_CRON"],
      ["ingest-stores", "INGEST_STORES_CRON"],
    ]);
  });
});
