import { Suspense } from "react";
import { getRepositories, resolveDataSource } from "@synergilon/db/repositories";

import { PageHeader } from "@/components/page-header";
import { DiscoverFilters } from "@/components/stores/discover-filters";
import { StoreCardSkeleton } from "@/components/stores/store-card";
import { StoreGrid } from "@/components/stores/store-grid";
import { toQueryString } from "@/lib/format";
import { serialize } from "@/lib/serialize";

export const metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type SearchParams = Promise<{ q?: string; category?: string }>;

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, category } = await searchParams;
  const { stores } = getRepositories();
  const categories = await stores.categories();
  const live = resolveDataSource() === "live";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discover"
        description={
          q
            ? `Stores matching "${q}", ranked by relevance.`
            : live
              ? "Tracked stores ranked by catalogue growth (product-count change over the last 7 snapshots), then by catalogue size. Revenue is not measured."
              : "Trending stores ranked by revenue growth over the last 7 days (sample data)."
        }
      >
        <Suspense>
          <DiscoverFilters categories={categories} />
        </Suspense>
      </PageHeader>
      <Suspense key={`${q ?? ""}|${category ?? ""}`} fallback={<GridSkeleton />}>
        <Results q={q} category={category} live={live} />
      </Suspense>
    </div>
  );
}

async function Results({ q, category, live }: { q?: string; category?: string; live: boolean }) {
  const { stores } = getRepositories();
  const query = q?.trim() || undefined;

  // Search results come from the list endpoint (relevance sort); the default
  // view is the trending ranking. Both paginate through their own API route.
  const page = query
    ? await stores.list({ q: query, category, sort: "relevance", order: "desc", limit: PAGE_SIZE })
    : await stores.trending({ category, limit: PAGE_SIZE });

  const nextPageUrl = query
    ? `/api/stores${toQueryString({ q: query, category, sort: "relevance", limit: PAGE_SIZE })}`
    : `/api/stores/trending${toQueryString({ category, limit: PAGE_SIZE })}`;

  // Growth needs two snapshots per store; after the first ingestion every
  // card would read "n/a", so explain once instead.
  const noGrowthYet =
    !query &&
    live &&
    page.data.length > 0 &&
    page.data.every((s) => !("growth" in s) || s.growth === null);

  return (
    <>
      {noGrowthYet ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Trends appear after the second daily ingestion: growth compares each store&apos;s product
          count across snapshots, and there is only one so far.
        </p>
      ) : null}
      <StoreGrid
        initial={serialize(page)}
        nextPageUrl={nextPageUrl}
        emptyTitle={query ? "No stores match your search" : "No stores yet"}
        emptyDescription={
          query
            ? "Try different keywords, or remove the category filter."
            : live
              ? "Run `pnpm worker:ingest-stores` to populate tracked stores."
              : "Seed the database with `pnpm db:seed` to populate trending stores."
        }
      />
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <StoreCardSkeleton key={i} />
      ))}
    </div>
  );
}
