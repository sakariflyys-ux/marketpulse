import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../client";
import { decodeKeysetCursor, decodeOffsetCursor, toPage, type Page } from "../pagination";
import type {
  CategoryCount,
  StoreDetail,
  StoreListParams,
  StoreRepository,
  StoreSummary,
  TrendingParams,
  TrendingStore,
} from "../StoreRepository";

/** Number of most recent snapshots used to compute trending growth. */
const GROWTH_WINDOW = 7;

const STORE_COLUMNS = Prisma.sql`
  s.id, s."shopifyDomain", s.name, s.description, s.logo, s.category,
  s."monthlyRevenue", s."monthlyTraffic", s."topProduct", s."techStack",
  s."lastScrapedAt", s."createdAt", s."updatedAt"`;

type StoreRow = StoreSummary & { _sort: number | string | Date | null };

/**
 * Mock data source: reads the Faker-seeded Postgres tables. Raw SQL is used
 * for list/trending because Prisma can't express tsvector search, ts_rank
 * ordering or window functions; everything else goes through the client.
 */
export class MockStoreRepository implements StoreRepository {
  async list(params: StoreListParams): Promise<Page<StoreSummary>> {
    const { limit } = params;
    const q = params.q?.trim() || undefined;
    const sort: StoreListParams["sort"] =
      params.sort === "relevance" && !q ? "revenue" : params.sort;
    const desc = params.order === "desc";
    const cmp = desc ? Prisma.sql`<` : Prisma.sql`>`;
    const dir = desc ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const tsquery = q ? Prisma.sql`websearch_to_tsquery('english', ${q})` : null;

    // Expression used for ordering and for the keyset cursor.
    const sortExpr =
      sort === "relevance" && tsquery
        ? Prisma.sql`ts_rank(s."searchVector", ${tsquery})::float8`
        : sort === "traffic"
          ? Prisma.sql`s."monthlyTraffic"`
          : sort === "newest"
            ? Prisma.sql`s."createdAt"`
            : sort === "name"
              ? Prisma.sql`s.name`
              : Prisma.sql`s."monthlyRevenue"`;

    const where: Prisma.Sql[] = [];
    if (tsquery) where.push(Prisma.sql`s."searchVector" @@ ${tsquery}`);
    if (params.category) where.push(Prisma.sql`s.category = ${params.category}`);
    if (params.minRevenue !== undefined)
      where.push(Prisma.sql`s."monthlyRevenue" >= ${params.minRevenue}`);
    if (params.maxRevenue !== undefined)
      where.push(Prisma.sql`s."monthlyRevenue" <= ${params.maxRevenue}`);
    if (params.minTraffic !== undefined)
      where.push(Prisma.sql`s."monthlyTraffic" >= ${params.minTraffic}`);
    if (params.maxTraffic !== undefined)
      where.push(Prisma.sql`s."monthlyTraffic" <= ${params.maxTraffic}`);

    const cursor = decodeKeysetCursor(params.cursor);
    if (cursor) {
      const v = cursorParam(sort, cursor.v);
      where.push(
        Prisma.sql`((${sortExpr}) ${cmp} ${v} OR ((${sortExpr}) = ${v} AND s.id ${cmp} ${cursor.id}))`,
      );
    }

    const rows = await prisma.$queryRaw<StoreRow[]>`
      SELECT ${STORE_COLUMNS}, (${sortExpr}) AS "_sort"
      FROM "Store" s
      ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}
      ORDER BY (${sortExpr}) ${dir}, s.id ${dir}
      LIMIT ${limit + 1}`;

    return toPage(rows.map(stripSort), limit, (last) => ({
      v: serializeSortValue(rows.find((r) => r.id === last.id)?._sort ?? null),
      id: last.id,
    }));
  }

  async trending(params: TrendingParams): Promise<Page<TrendingStore>> {
    const { limit } = params;
    const offset = decodeOffsetCursor(params.cursor);
    const categoryFilter = params.category
      ? Prisma.sql`WHERE s.category = ${params.category}`
      : Prisma.empty;

    // Growth = (latest snapshot revenue - revenue GROWTH_WINDOW snapshots ago)
    // / prior. Stores with too little history get NULL and sort last, then
    // fall back to absolute revenue so the list is still meaningful.
    const rows = await prisma.$queryRaw<(StoreSummary & TrendingStore)[]>`
      WITH ranked AS (
        SELECT "storeId", "monthlyRevenue",
               row_number() OVER (PARTITION BY "storeId" ORDER BY "capturedAt" DESC) AS rn
        FROM "StoreSnapshot"
      ),
      growth AS (
        SELECT "storeId",
               max(CASE WHEN rn = 1 THEN "monthlyRevenue" END) AS latest,
               max(CASE WHEN rn = ${GROWTH_WINDOW} THEN "monthlyRevenue" END) AS prior
        FROM ranked
        WHERE rn IN (1, ${GROWTH_WINDOW})
        GROUP BY "storeId"
      )
      SELECT ${STORE_COLUMNS},
             g.latest AS "latestRevenue",
             g.prior  AS "priorRevenue",
             CASE WHEN g.prior > 0 THEN (g.latest - g.prior) / g.prior ELSE NULL END AS growth
      FROM "Store" s
      LEFT JOIN growth g ON g."storeId" = s.id
      ${categoryFilter}
      ORDER BY growth DESC NULLS LAST, s."monthlyRevenue" DESC, s.id
      LIMIT ${limit + 1} OFFSET ${offset}`;

    return toPage(rows, limit, () => ({ o: offset + limit }));
  }

  async getByDomain(domain: string): Promise<StoreDetail | null> {
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: domain },
      include: {
        snapshots: {
          orderBy: { capturedAt: "asc" },
          select: { capturedAt: true, monthlyRevenue: true, monthlyTraffic: true },
        },
        ads: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            platform: true,
            creativeUrl: true,
            headline: true,
            cta: true,
            spendEstimate: true,
            impressions: true,
            engagementRate: true,
            createdAt: true,
          },
        },
        _count: { select: { ads: true } },
      },
    });
    if (!store) return null;

    const { _count, snapshots, ads, ...rest } = store;
    return {
      ...rest,
      topProduct: rest.topProduct as StoreSummary["topProduct"],
      techStack: rest.techStack as StoreSummary["techStack"],
      snapshots,
      ads,
      adCount: _count.ads,
    };
  }

  async categories(): Promise<CategoryCount[]> {
    const groups = await prisma.store.groupBy({
      by: ["category"],
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
    });
    return groups.map((g) => ({ category: g.category, count: g._count._all }));
  }
}

function stripSort(row: StoreRow): StoreSummary {
  const { _sort: _ignored, ...rest } = row;
  return rest;
}

function serializeSortValue(v: StoreRow["_sort"]): string | number | null {
  return v instanceof Date ? v.toISOString() : v;
}

/** Cursor values are JSON; re-type them so Postgres compares apples to apples. */
function cursorParam(sort: StoreListParams["sort"], v: string | number | null): Prisma.Sql {
  if (sort === "newest") return Prisma.sql`${new Date(String(v))}::timestamptz`;
  if (sort === "name") return Prisma.sql`${String(v)}::text`;
  return Prisma.sql`${Number(v)}::float8`;
}
