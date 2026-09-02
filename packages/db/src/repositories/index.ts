/**
 * Repository factory — the single swap point for data sources.
 *
 * `DATA_SOURCE=mock` (default) serves the Faker-seeded rows; `live` serves
 * rows written by the ingestion jobs (Meta Ad Library, Shopify storefronts).
 * Both read the same Postgres tables, scoped by `source`. Nothing else in the
 * app imports a concrete implementation.
 */
import { withCache } from "./withCache";
import { LiveAdRepository } from "./live/LiveAdRepository";
import { LiveStoreRepository } from "./live/LiveStoreRepository";
import { MockAdRepository } from "./mock/MockAdRepository";
import { MockStoreRepository } from "./mock/MockStoreRepository";
import type { AdRepository } from "./AdRepository";
import type { StoreRepository } from "./StoreRepository";

export type DataSource = "mock" | "live";

export type Repositories = {
  stores: StoreRepository;
  ads: AdRepository;
};

export function resolveDataSource(raw = process.env["DATA_SOURCE"]): DataSource {
  const value = (raw ?? "mock").trim().toLowerCase();
  if (value === "mock" || value === "live") return value;
  // "shopify" was the pre-Phase-7 name for the real-data mode.
  if (value === "shopify") return "live";
  throw new Error(`DATA_SOURCE must be "mock" or "live", got "${raw}"`);
}

function buildRepositories(source: DataSource): Repositories {
  switch (source) {
    case "mock":
      return {
        stores: withCache("stores", new MockStoreRepository()),
        ads: withCache("ads", new MockAdRepository()),
      };
    case "live":
      return {
        stores: withCache("stores", new LiveStoreRepository()),
        ads: withCache("ads", new LiveAdRepository()),
      };
  }
}

let repositories: Repositories | undefined;

/** Lazily-built singleton so env is read at first use, not at import time. */
export function getRepositories(): Repositories {
  repositories ??= buildRepositories(resolveDataSource());
  return repositories;
}

/** Build repositories for an explicit source (ingestion tools, tests). */
export function createRepositories(source: DataSource): Repositories {
  return buildRepositories(source);
}

export type { AdRepository, StoreRepository };
export * from "./AdRepository";
export * from "./StoreRepository";
export { InvalidCursorError, type Page } from "./pagination";
