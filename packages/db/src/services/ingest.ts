/**
 * Ingestion: pulls from the data-source clients into our own Postgres so the
 * app keeps querying local tables (pagination, tsvector search and caching
 * untouched). Database access goes through the small `IngestDb` interface so
 * the job logic is unit-testable with fixtures; `prismaIngestDb` is the
 * production implementation.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../client";
import {
  mapArchiveAd,
  MetaCredentialError,
  type AdArchiveItem,
  type MetaAdLibraryClient,
} from "../sources/meta";
import {
  mapStorefront,
  ShopifyStorefrontClient,
  StorefrontSkippedError,
  type NegativeCache,
  type StorefrontInspection,
} from "../sources/shopify";

export type IngestSourceName = "META_AD_LIBRARY" | "SHOPIFY_STOREFRONT";
export type IngestStatusName = "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";

export type TrackedEntityRow = {
  id: string;
  kind: "STORE" | "BRAND";
  value: string;
  label: string | null;
  linkedDomain: string | null;
  active: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
};

export type AdUpsert = { adLibraryId: string; data: Omit<Prisma.AdUncheckedCreateInput, "id"> };

export interface IngestDb {
  listTracked(kind: "STORE" | "BRAND"): Promise<TrackedEntityRow[]>;
  markTracked(id: string, patch: { lastRunAt: Date; lastError: string | null }): Promise<void>;
  findStoreIdByDomain(domain: string): Promise<string | null>;
  /** Insert or update by adLibraryId. Returns "created" | "updated". */
  upsertAd(ad: AdUpsert, observedAt: Date): Promise<"created" | "updated">;
  /** Flags ads for this page that were not seen in this run. Returns how many. */
  deactivateMissingAds(
    pageId: string,
    seenAdLibraryIds: string[],
    observedAt: Date,
  ): Promise<number>;
  upsertStore(
    domain: string,
    data: Omit<Prisma.StoreUncheckedCreateInput, "id" | "shopifyDomain">,
  ): Promise<string>;
  createSnapshot(
    storeId: string,
    data: Omit<Prisma.StoreSnapshotUncheckedCreateInput, "id" | "storeId">,
  ): Promise<void>;
  startRun(source: IngestSourceName): Promise<string>;
  finishRun(
    id: string,
    patch: {
      status: IngestStatusName;
      itemsSeen: number;
      itemsWritten: number;
      error: string | null;
      details?: unknown;
    },
  ): Promise<void>;
}

export type IngestSummary = {
  runId: string;
  status: IngestStatusName;
  itemsSeen: number;
  itemsWritten: number;
  entities: {
    entity: string;
    seen: number;
    written: number;
    deactivated?: number;
    error?: string;
  }[];
  error: string | null;
};

export type Logger = (message: string) => void;

/**
 * Wraps a job body with an IngestRun row. A thrown error becomes FAILED
 * (existing data untouched); per-entity errors make the run PARTIAL.
 */
export async function withIngestRun(
  db: IngestDb,
  source: IngestSourceName,
  body: (report: (entity: IngestSummary["entities"][number]) => void) => Promise<void>,
): Promise<IngestSummary> {
  const runId = await db.startRun(source);
  const entities: IngestSummary["entities"] = [];
  const report = (e: IngestSummary["entities"][number]) => entities.push(e);
  try {
    await body(report);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const summary = totals(entities);
    await db.finishRun(runId, { status: "FAILED", ...summary, error, details: { entities } });
    return { runId, status: "FAILED", ...summary, entities, error };
  }
  const summary = totals(entities);
  const failed = entities.filter((e) => e.error).length;
  const status: IngestStatusName =
    failed === 0 ? "SUCCESS" : failed === entities.length ? "FAILED" : "PARTIAL";
  const error = failed ? `${failed} of ${entities.length} entities failed` : null;
  await db.finishRun(runId, { status, ...summary, error, details: { entities } });
  return { runId, status, ...summary, entities, error };
}

function totals(entities: IngestSummary["entities"]): { itemsSeen: number; itemsWritten: number } {
  return {
    itemsSeen: entities.reduce((n, e) => n + e.seen, 0),
    itemsWritten: entities.reduce((n, e) => n + e.written, 0),
  };
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export type IngestAdsOptions = {
  countries: string[];
  /** Only ads that started delivering on/after this date (YYYY-MM-DD). */
  deliveryDateMin?: string;
  maxPagesPerEntity?: number;
  now?: () => Date;
  log?: Logger;
};

/** BRAND values: a numeric Meta page id, or a brand name used as search_terms. */
export function brandQuery(value: string): { searchPageIds?: string[]; searchTerms?: string } {
  const v = value.trim();
  return /^\d{5,}$/.test(v) ? { searchPageIds: [v] } : { searchTerms: v };
}

/**
 * One BRAND entity: pull every archive page, upsert on adLibraryId (so a
 * re-run touches lastSeenAt instead of duplicating), then mark ads that
 * disappeared as inactive — never delete, longevity is the signal.
 */
export async function ingestAdsForEntity(
  client: MetaAdLibraryClient,
  db: IngestDb,
  entity: TrackedEntityRow,
  options: IngestAdsOptions,
): Promise<IngestSummary["entities"][number]> {
  const now = options.now ?? (() => new Date());
  const observedAt = now();
  const storeId = entity.linkedDomain ? await db.findStoreIdByDomain(entity.linkedDomain) : null;
  const seenIds: string[] = [];
  const pageIds = new Set<string>();
  let seen = 0;
  let written = 0;

  for await (const items of client.iterate(
    {
      ...brandQuery(entity.value),
      countries: options.countries,
      adDeliveryDateMin: options.deliveryDateMin,
      adActiveStatus: "ALL",
      adType: "ALL",
    },
    options.maxPagesPerEntity ?? 20,
  )) {
    for (const item of items as AdArchiveItem[]) {
      seen++;
      const mapped = mapArchiveAd(item, { storeId, observedAt });
      if (!mapped) continue;
      await db.upsertAd(mapped, observedAt);
      written++;
      seenIds.push(mapped.adLibraryId);
      if (mapped.data.pageId) pageIds.add(mapped.data.pageId);
    }
  }

  // Only a page-id query can prove absence; a search-terms query is a sample.
  let deactivated = 0;
  const q = brandQuery(entity.value);
  if (q.searchPageIds) {
    for (const pageId of q.searchPageIds)
      deactivated += await db.deactivateMissingAds(pageId, seenIds, observedAt);
  }

  await db.markTracked(entity.id, { lastRunAt: observedAt, lastError: null });
  return { entity: entity.label ?? entity.value, seen, written, deactivated };
}

export async function runIngestAds(
  client: MetaAdLibraryClient,
  db: IngestDb,
  options: IngestAdsOptions,
): Promise<IngestSummary> {
  const log = options.log ?? (() => undefined);
  return withIngestRun(db, "META_AD_LIBRARY", async (report) => {
    if (!client.configured)
      throw new MetaCredentialError("No ingestion credentials configured: set META_ACCESS_TOKEN");
    const entities = (await db.listTracked("BRAND")).filter((e) => e.active);
    if (entities.length === 0) log("no active BRAND entities to ingest");
    for (const entity of entities) {
      try {
        const result = await ingestAdsForEntity(client, db, entity, options);
        log(
          `${result.entity}: ${result.seen} seen, ${result.written} written, ${result.deactivated ?? 0} deactivated`,
        );
        report(result);
      } catch (err) {
        // A credential problem affects every entity; stop the run and say so.
        if (err instanceof MetaCredentialError) throw err;
        const error = err instanceof Error ? err.message : String(err);
        await db.markTracked(entity.id, {
          lastRunAt: (options.now ?? (() => new Date()))(),
          lastError: error,
        });
        log(`${entity.label ?? entity.value}: ${error}`);
        report({ entity: entity.label ?? entity.value, seen: 0, written: 0, error });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export type IngestStoresOptions = { now?: () => Date; log?: Logger };

export async function ingestStoreForEntity(
  client: ShopifyStorefrontClient,
  db: IngestDb,
  entity: TrackedEntityRow,
  options: IngestStoresOptions = {},
): Promise<IngestSummary["entities"][number]> {
  const now = options.now ?? (() => new Date());
  const inspection: StorefrontInspection = await client.inspect(entity.value);
  const mapped = mapStorefront(inspection);
  const storeId = await db.upsertStore(mapped.domain, mapped.data);
  await db.createSnapshot(storeId, mapped.snapshot);
  await db.markTracked(entity.id, { lastRunAt: now(), lastError: null });
  return { entity: mapped.domain, seen: 1, written: 1 };
}

export async function runIngestStores(
  client: ShopifyStorefrontClient,
  db: IngestDb,
  options: IngestStoresOptions = {},
): Promise<IngestSummary> {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  return withIngestRun(db, "SHOPIFY_STOREFRONT", async (report) => {
    const entities = (await db.listTracked("STORE")).filter((e) => e.active);
    if (entities.length === 0) log("no active STORE entities to ingest");
    for (const entity of entities) {
      try {
        const result = await ingestStoreForEntity(client, db, entity, options);
        log(`${result.entity}: refreshed`);
        report(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        // Skips (robots, negative cache) are expected outcomes, not failures.
        const skipped = err instanceof StorefrontSkippedError && err.reason === "negative-cache";
        if (!skipped) await db.markTracked(entity.id, { lastRunAt: now(), lastError: error });
        log(`${entity.value}: ${error}`);
        report({ entity: entity.value, seen: skipped ? 0 : 1, written: 0, error });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Prisma-backed implementations
// ---------------------------------------------------------------------------

export const prismaIngestDb: IngestDb = {
  async listTracked(kind) {
    return prisma.trackedEntity.findMany({
      where: { kind },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        value: true,
        label: true,
        linkedDomain: true,
        active: true,
        lastRunAt: true,
        lastError: true,
      },
    });
  },
  async markTracked(id, patch) {
    await prisma.trackedEntity.update({ where: { id }, data: patch });
  },
  async findStoreIdByDomain(domain) {
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: domain },
      select: { id: true },
    });
    return store?.id ?? null;
  },
  async upsertAd(ad, observedAt) {
    const existing = await prisma.ad.findUnique({
      where: { adLibraryId: ad.adLibraryId },
      select: { id: true, firstSeenAt: true },
    });
    if (existing) {
      const { createdAt: _createdAt, ...rest } = ad.data;
      await prisma.ad.update({
        where: { id: existing.id },
        data: {
          ...rest,
          // Keep the earliest sighting we have ever recorded.
          firstSeenAt: earliest(existing.firstSeenAt, toDate(ad.data.firstSeenAt)),
          lastSeenAt: ad.data.lastSeenAt ?? observedAt,
        },
      });
      return "updated";
    }
    await prisma.ad.create({ data: ad.data });
    return "created";
  },
  async deactivateMissingAds(pageId, seenAdLibraryIds, observedAt) {
    const res = await prisma.ad.updateMany({
      where: {
        pageId,
        source: { not: "mock" },
        active: true,
        adLibraryId: { notIn: seenAdLibraryIds },
      },
      data: { active: false, lastSeenAt: observedAt },
    });
    return res.count;
  },
  async upsertStore(domain, data) {
    const store = await prisma.store.upsert({
      where: { shopifyDomain: domain },
      update: data,
      create: { ...data, shopifyDomain: domain },
      select: { id: true },
    });
    return store.id;
  },
  async createSnapshot(storeId, data) {
    await prisma.storeSnapshot.create({ data: { ...data, storeId } });
  },
  async startRun(source) {
    const run = await prisma.ingestRun.create({
      data: { source, status: "RUNNING" },
      select: { id: true },
    });
    return run.id;
  },
  async finishRun(id, patch) {
    await prisma.ingestRun.update({
      where: { id },
      data: {
        status: patch.status,
        itemsSeen: patch.itemsSeen,
        itemsWritten: patch.itemsWritten,
        error: patch.error,
        finishedAt: new Date(),
        details: patch.details as Prisma.InputJsonValue | undefined,
      },
    });
  },
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Negative cache backed by TrackedEntity: a domain whose last run failed is
 * skipped for `ttlMs` (default 7 days) without any schema change.
 */
export function trackedEntityNegativeCache(ttlMs = 7 * 24 * 60 * 60 * 1000): NegativeCache {
  return {
    async get(domain) {
      const entity = await prisma.trackedEntity.findUnique({
        where: { kind_value: { kind: "STORE", value: domain } },
        select: { lastError: true, lastRunAt: true },
      });
      if (!entity?.lastError || !entity.lastRunAt) return null;
      const until = new Date(entity.lastRunAt.getTime() + ttlMs);
      return until.getTime() > Date.now() ? until : null;
    },
    async set(domain, _until, reason) {
      await prisma.trackedEntity.updateMany({
        where: { kind: "STORE", value: domain },
        data: { lastError: reason, lastRunAt: new Date() },
      });
    },
  };
}

/** Recent runs for the /ingest page. */
export async function listIngestRuns(limit = 50) {
  return prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}

/** Tracked entities with their last outcome, for /ingest and the track_entity tool. */
export async function listTrackedEntities() {
  return prisma.trackedEntity.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }] });
}

export type TrackInput = {
  kind: "STORE" | "BRAND";
  value: string;
  label?: string;
  linkedDomain?: string;
  addedByUserId?: string;
};

/** Adds (or re-activates) a tracked entity. Domains are normalised. */
export async function trackEntity(input: TrackInput) {
  const value =
    input.kind === "STORE"
      ? ShopifyStorefrontClient.normalizeDomain(input.value)
      : input.value.trim();
  if (!value) throw new Error("value is required");
  return prisma.trackedEntity.upsert({
    where: { kind_value: { kind: input.kind, value } },
    update: {
      active: true,
      ...(input.label ? { label: input.label } : {}),
      ...(input.linkedDomain ? { linkedDomain: input.linkedDomain } : {}),
    },
    create: {
      kind: input.kind,
      value,
      label: input.label ?? null,
      linkedDomain: input.linkedDomain ?? null,
      addedByUserId: input.addedByUserId ?? null,
    },
  });
}
