/**
 * Repository factory — the single swap point for data sources.
 *
 * `DATA_SOURCE=mock` (default) serves the Faker-seeded Postgres tables.
 * When real integrations land, add e.g. `ShopifyStoreRepository` and change
 * the one line in `buildRepositories()` below (or gate it on the env value).
 * Nothing else in the app imports a concrete implementation.
 */
import { withCache } from "./withCache";
import { MockAdRepository } from "./mock/MockAdRepository";
import { MockStoreRepository } from "./mock/MockStoreRepository";
import type { AdRepository } from "./AdRepository";
import type { StoreRepository } from "./StoreRepository";

export type DataSource = "mock" | "shopify";

export type Repositories = {
  stores: StoreRepository;
  ads: AdRepository;
};

function resolveDataSource(): DataSource {
  const raw = (process.env["DATA_SOURCE"] ?? "mock").toLowerCase();
  if (raw === "mock" || raw === "shopify") return raw;
  throw new Error(`DATA_SOURCE must be "mock" or "shopify", got "${raw}"`);
}

function buildRepositories(source: DataSource): Repositories {
  switch (source) {
    case "mock":
      return {
        stores: withCache("stores", new MockStoreRepository()),
        ads: withCache("ads", new MockAdRepository()),
      };
    case "shopify":
      // Swap point: return { stores: withCache("stores", new ShopifyStoreRepository()), ... }
      throw new Error("DATA_SOURCE=shopify is not implemented yet");
  }
}

let repositories: Repositories | undefined;

/** Lazily-built singleton so env is read at first use, not at import time. */
export function getRepositories(): Repositories {
  repositories ??= buildRepositories(resolveDataSource());
  return repositories;
}

export type { AdRepository, StoreRepository };
export * from "./AdRepository";
export * from "./StoreRepository";
export { InvalidCursorError, type Page } from "./pagination";
