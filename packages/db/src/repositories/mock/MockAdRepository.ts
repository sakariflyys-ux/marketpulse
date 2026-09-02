import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../client";
import { decodeKeysetCursor, toPage, type Page } from "../pagination";
import type { AdDetail, AdListParams, AdRepository, AdSummary } from "../AdRepository";

export const AD_COLUMNS = Prisma.sql`
  a.id, a.platform, a."creativeUrl", a.headline, a."bodyText", a.cta,
  a."spendEstimate", a.impressions, a."engagementRate",
  a."impressionsLower", a."impressionsUpper", a."euTotalReach", a."targetAudience",
  a."storeId", a."pageId", a."pageName", a."adLibraryId", a."firstSeenAt", a."lastSeenAt",
  a.active, a.source, a."createdAt",
  CASE WHEN s.id IS NULL THEN NULL ELSE
    json_build_object('id', s.id, 'name', s.name, 'shopifyDomain', s."shopifyDomain", 'logo', s.logo)
  END AS store`;

type AdRow = AdSummary & { _sort: number | string | Date | null };

/**
 * Mock data source for ads. See MockStoreRepository for the raw-SQL rationale
 * and the source-scoping approach (LiveAdRepository overrides sourceFilter).
 */
export class MockAdRepository implements AdRepository {
  protected sourceFilter(): Prisma.Sql {
    return Prisma.sql`a.source = 'mock'`;
  }

  protected sourceWhere(): Prisma.AdWhereInput {
    return { source: "mock" };
  }

  /** Default sort when the caller passes none: mock data has engagement, live data has longevity. */
  protected defaultSort(): AdListParams["sort"] {
    return "engagement";
  }

  async list(params: AdListParams): Promise<Page<AdSummary>> {
    const { limit } = params;
    const q = params.q?.trim() || undefined;
    const sort: AdListParams["sort"] =
      params.sort === "relevance" && !q ? "engagement" : params.sort;
    const desc = params.order === "desc";
    const cmp = desc ? Prisma.sql`<` : Prisma.sql`>`;
    const dir = desc ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const tsquery = q ? Prisma.sql`websearch_to_tsquery('english', ${q})` : null;

    const sortExpr =
      sort === "relevance" && tsquery
        ? Prisma.sql`ts_rank(a."searchVector", ${tsquery})::float8`
        : sort === "spend"
          ? Prisma.sql`a."spendEstimate"`
          : sort === "impressions"
            ? Prisma.sql`a.impressions::float8`
            : sort === "newest"
              ? Prisma.sql`a."createdAt"`
              : sort === "longest_running"
                ? // Days between first and last sighting; mock ads (no sightings) sort last.
                  Prisma.sql`COALESCE(EXTRACT(EPOCH FROM (a."lastSeenAt" - a."firstSeenAt")) / 86400, -1)::float8`
                : Prisma.sql`a."engagementRate"`;

    const where: Prisma.Sql[] = [this.sourceFilter()];
    if (tsquery) where.push(Prisma.sql`a."searchVector" @@ ${tsquery}`);
    if (params.platform) where.push(Prisma.sql`a.platform = ${params.platform}::"AdPlatform"`);
    if (params.storeId) where.push(Prisma.sql`a."storeId" = ${params.storeId}`);
    if (params.pageId) where.push(Prisma.sql`a."pageId" = ${params.pageId}`);
    if (params.activeOnly) where.push(Prisma.sql`a.active = true`);
    if (params.minEngagement !== undefined)
      where.push(Prisma.sql`a."engagementRate" >= ${params.minEngagement}`);
    if (params.maxEngagement !== undefined)
      where.push(Prisma.sql`a."engagementRate" <= ${params.maxEngagement}`);
    if (params.minSpend !== undefined)
      where.push(Prisma.sql`a."spendEstimate" >= ${params.minSpend}`);
    if (params.maxSpend !== undefined)
      where.push(Prisma.sql`a."spendEstimate" <= ${params.maxSpend}`);

    const cursor = decodeKeysetCursor(params.cursor);
    if (cursor) {
      const v =
        sort === "newest"
          ? Prisma.sql`${new Date(String(cursor.v))}::timestamptz`
          : Prisma.sql`${Number(cursor.v)}::float8`;
      where.push(
        Prisma.sql`((${sortExpr}) ${cmp} ${v} OR ((${sortExpr}) = ${v} AND a.id ${cmp} ${cursor.id}))`,
      );
    }

    const rows = await prisma.$queryRaw<AdRow[]>`
      SELECT ${AD_COLUMNS}, (${sortExpr}) AS "_sort"
      FROM "Ad" a
      LEFT JOIN "Store" s ON s.id = a."storeId"
      WHERE ${Prisma.join(where, " AND ")}
      ORDER BY (${sortExpr}) ${dir} ${desc ? Prisma.sql`NULLS LAST` : Prisma.sql`NULLS FIRST`}, a.id ${dir}
      LIMIT ${limit + 1}`;

    return toPage(
      rows.map(({ _sort: _ignored, ...rest }) => rest),
      limit,
      (last) => {
        const v = rows.find((r) => r.id === last.id)?._sort ?? null;
        return { v: v instanceof Date ? v.toISOString() : v, id: last.id };
      },
    );
  }

  async getById(id: string): Promise<AdDetail | null> {
    const ad = await prisma.ad.findFirst({
      where: { id, ...this.sourceWhere() },
      include: { store: { select: { id: true, name: true, shopifyDomain: true, logo: true } } },
    });
    if (!ad) return null;
    const { raw: _raw, ...rest } = ad;
    return {
      ...rest,
      source: rest.source as AdSummary["source"],
      targetAudience: rest.targetAudience as AdSummary["targetAudience"],
    };
  }
}
