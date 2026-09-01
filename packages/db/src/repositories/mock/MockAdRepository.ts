import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../client";
import { decodeKeysetCursor, toPage, type Page } from "../pagination";
import type { AdDetail, AdListParams, AdRepository, AdSummary } from "../AdRepository";

const AD_COLUMNS = Prisma.sql`
  a.id, a.platform, a."creativeUrl", a.headline, a."bodyText", a.cta,
  a."spendEstimate", a.impressions, a."engagementRate", a."targetAudience",
  a."storeId", a."createdAt",
  json_build_object('id', s.id, 'name', s.name, 'shopifyDomain', s."shopifyDomain", 'logo', s.logo) AS store`;

type AdRow = AdSummary & { _sort: number | string | Date | null };

/** Mock data source for ads. See MockStoreRepository for the raw-SQL rationale. */
export class MockAdRepository implements AdRepository {
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
              : Prisma.sql`a."engagementRate"`;

    const where: Prisma.Sql[] = [];
    if (tsquery) where.push(Prisma.sql`a."searchVector" @@ ${tsquery}`);
    if (params.platform) where.push(Prisma.sql`a.platform = ${params.platform}::"AdPlatform"`);
    if (params.storeId) where.push(Prisma.sql`a."storeId" = ${params.storeId}`);
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
      JOIN "Store" s ON s.id = a."storeId"
      ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}
      ORDER BY (${sortExpr}) ${dir}, a.id ${dir}
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
    const ad = await prisma.ad.findUnique({
      where: { id },
      include: { store: { select: { id: true, name: true, shopifyDomain: true, logo: true } } },
    });
    if (!ad) return null;
    return { ...ad, targetAudience: ad.targetAudience as AdSummary["targetAudience"] };
  }
}
