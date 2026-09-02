import { Suspense } from "react";
import { getRepositories } from "@synergilon/db/repositories";

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discover"
        description={
          q
            ? `Stores matching "${q}", ranked by relevance.`
            : "Trending stores ranked by revenue growth over the last 7 days."
        }
      >
        <Suspense>
          <DiscoverFilters categories={categories} />
        </Suspense>
      </PageHeader>
      <Suspense key={`${q ?? ""}|${category ?? ""}`} fallback={<GridSkeleton />}>
        <Results q={q} category={category} />
      </Suspense>
    </div>
  );
}

async function Results({ q, category }: { q?: string; category?: string }) {
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

  return (
    <StoreGrid
      initial={serialize(page)}
      nextPageUrl={nextPageUrl}
      emptyTitle={query ? "No stores match your search" : "No stores yet"}
      emptyDescription={
        query
          ? "Try different keywords, or remove the category filter."
          : "Seed the database with `pnpm db:seed` to populate trending stores."
      }
    />
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
