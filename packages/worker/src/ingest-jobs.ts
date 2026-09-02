import { cache } from "@synergilon/db/cache";
import {
  prismaIngestDb,
  runIngestAds,
  runIngestStores,
  trackedEntityNegativeCache,
  type IngestSummary,
} from "@synergilon/db/services";
import { DEFAULT_AD_COUNTRIES, MetaAdLibraryClient } from "@synergilon/db/sources/meta";
import { ShopifyStorefrontClient } from "@synergilon/db/sources/shopify";

export type IngestJobName = "ingest-ads" | "ingest-stores";

export const INGEST_JOBS: { name: IngestJobName; cronEnv: string; defaultCron: string }[] = [
  { name: "ingest-ads", cronEnv: "INGEST_ADS_CRON", defaultCron: "0 4 * * *" },
  { name: "ingest-stores", cronEnv: "INGEST_STORES_CRON", defaultCron: "0 5 * * *" },
];

export function adCountries(): string[] {
  const raw = process.env["META_AD_COUNTRIES"];
  const list = (raw ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return list.length ? list : DEFAULT_AD_COUNTRIES;
}

/**
 * Runs one ingestion job. Never throws: every outcome is an IngestRun row
 * (SUCCESS / PARTIAL / FAILED) and existing data is left in place on failure.
 */
export async function runIngestJob(
  name: IngestJobName,
  log: (m: string) => void,
): Promise<IngestSummary> {
  let summary: IngestSummary;
  if (name === "ingest-ads") {
    const client = new MetaAdLibraryClient({
      accessToken: process.env["META_ACCESS_TOKEN"],
      graphVersion: process.env["META_GRAPH_VERSION"] || undefined,
    });
    if (!client.configured)
      log("no ingestion credentials configured (META_ACCESS_TOKEN); recording a FAILED run");
    // Look back one year: commercial ads are only retained that long in the archive.
    const deliveryDateMin = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    summary = await runIngestAds(client, prismaIngestDb, {
      countries: adCountries(),
      deliveryDateMin,
      log,
    });
  } else {
    const client = new ShopifyStorefrontClient({
      userAgent: process.env["SCRAPER_USER_AGENT"] || undefined,
      contactUrl: process.env["SCRAPER_CONTACT_URL"] || undefined,
      negativeCache: trackedEntityNegativeCache(),
    });
    summary = await runIngestStores(client, prismaIngestDb, { log });
  }
  // Ingestion changed the live tables; drop every cached repository read.
  await cache.invalidate("stores", "ads");
  log(
    `${name} ${summary.status}: ${summary.itemsSeen} seen, ${summary.itemsWritten} written${summary.error ? ` — ${summary.error}` : ""}`,
  );
  return summary;
}
