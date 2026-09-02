import { Suspense } from "react";
import { z } from "zod";
import { getRepositories } from "@synergilon/db/repositories";

import { AdsFilters } from "@/components/ads/ads-filters";
import { AdsTable, AdsTableSkeleton } from "@/components/ads/ads-table";
import { PageHeader } from "@/components/page-header";
import { toQueryString } from "@/lib/format";
import { serialize } from "@/lib/serialize";

export const metadata = { title: "Ad Library" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

// Unknown or malformed values fall back to defaults rather than erroring —
// this is a page, not an API.
const paramsSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  platform: z.enum(["META", "TIKTOK", "GOOGLE"]).optional().catch(undefined),
  storeId: z.string().max(64).optional().catch(undefined),
  minEngagement: z.coerce.number().min(0).max(100).optional().catch(undefined),
  sort: z
    .enum(["engagement", "spend", "impressions", "newest", "relevance"])
    .optional()
    .catch(undefined),
  order: z.enum(["asc", "desc"]).optional().catch(undefined),
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = paramsSchema.parse(raw);
  const key = JSON.stringify(params);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ad Library"
        description="Creatives across Meta, TikTok and Google. Click a row for details."
      />
      <Suspense>
        <AdsFilters />
      </Suspense>
      <Suspense key={key} fallback={<AdsTableSkeleton />}>
        <Results params={params} />
      </Suspense>
    </div>
  );
}

async function Results({ params }: { params: z.infer<typeof paramsSchema> }) {
  const q = params.q || undefined;
  const sort = params.sort ?? (q ? "relevance" : "engagement");
  const order = params.order ?? "desc";
  const listParams = {
    q,
    platform: params.platform,
    storeId: params.storeId || undefined,
    minEngagement: params.minEngagement,
    sort,
    order,
    limit: PAGE_SIZE,
  } as const;

  const page = await getRepositories().ads.list(listParams);
  const nextPageUrl = `/api/ads${toQueryString({ ...listParams })}`;

  return <AdsTable initial={serialize(page)} nextPageUrl={nextPageUrl} />;
}
