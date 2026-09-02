import { Prisma } from "../../../generated/prisma/client";
import { MockStoreRepository } from "../mock/MockStoreRepository";
import type { GrowthMetric } from "../StoreRepository";

/**
 * Live data source: the same Postgres tables, populated by the storefront
 * ingestion instead of the seed. Reuses the mock SQL wholesale and only
 * changes what differs — which rows count, and which observable signal
 * drives the trending ranking (product count; public storefronts expose no
 * revenue, so growth on an estimate would be growth on a guess).
 */
export class LiveStoreRepository extends MockStoreRepository {
  protected override sourceFilter(): Prisma.Sql {
    return Prisma.sql`s.source <> 'mock'`;
  }

  protected override sourceWhere(): Prisma.StoreWhereInput {
    return { source: { not: "mock" } };
  }

  protected override growthMetric(): GrowthMetric {
    return "productCount";
  }
}
