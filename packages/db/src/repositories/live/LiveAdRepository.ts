import { Prisma } from "../../../generated/prisma/client";
import type { AdListParams } from "../AdRepository";
import { MockAdRepository } from "../mock/MockAdRepository";

/**
 * Live ads come from the Meta Ad Library ingestion. Same SQL as the mock
 * repository; only the row scope and the default ordering differ. Live ads
 * carry no engagement, so the default sort is longevity (days between first
 * and last sighting) — the most useful public signal about an ad.
 */
export class LiveAdRepository extends MockAdRepository {
  protected override sourceFilter(): Prisma.Sql {
    return Prisma.sql`a.source <> 'mock'`;
  }

  protected override sourceWhere(): Prisma.AdWhereInput {
    return { source: { not: "mock" } };
  }

  protected override defaultSort(): AdListParams["sort"] {
    return "longest_running";
  }
}
