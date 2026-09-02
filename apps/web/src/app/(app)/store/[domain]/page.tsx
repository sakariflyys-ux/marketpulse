import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Globe, Megaphone } from "lucide-react";
import { getRepositories } from "@synergilon/db/repositories";

import { PlatformBadge } from "@/components/ads/platform-badge";
import { EmptyState } from "@/components/empty-state";
import { Metric, Missing } from "@/components/missing-value";
import { PageHeader } from "@/components/page-header";
import { SourceBadge } from "@/components/source-badge";
import { SaveToFolderButton } from "@/components/saved/save-to-folder-dialog";
import { GrowthIndicator } from "@/components/stores/growth-indicator";
import { RevenueChart } from "@/components/stores/revenue-chart";
import { StoreLogo } from "@/components/stores/store-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  daysBetween,
  formatCompact,
  formatCurrency,
  formatDate,
  formatPriceRange,
  formatProductCount,
} from "@/lib/format";
import { growthFromSnapshots } from "@/lib/growth";
import { serialize } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type Params = Promise<{ domain: string }>;

async function loadStore(domain: string) {
  return getRepositories().stores.getByDomain(decodeURIComponent(domain));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { domain } = await params;
  const store = await loadStore(domain);
  return { title: store?.name ?? "Store not found" };
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function StorePage({ params }: { params: Params }) {
  const { domain } = await params;
  const store = await loadStore(domain);
  if (!store) notFound();

  const { growth, metric: growthMetric } = growthFromSnapshots(store.snapshots);
  const apps = store.techStack?.apps ?? [];
  const topProduct = store.topProduct;
  const adsHref = `/ads?storeId=${encodeURIComponent(store.id)}`;
  const live = store.source !== "mock";

  // Chart the measured revenue for sample stores; live stores only have the
  // observable product count. No estimate series exists any more.
  const hasRevenue = store.snapshots.some((p) => p.monthlyRevenue !== null);
  const chartSeries = hasRevenue ? "monthlyRevenue" : "productCount";
  const chartTitle =
    chartSeries === "monthlyRevenue" ? "Monthly revenue over time" : "Catalogue size over time";
  const chartData = store.snapshots.map((p) => ({
    capturedAt: p.capturedAt,
    value: p[chartSeries],
  }));

  const description =
    live && store.pageTitle && store.pageTitle !== store.name
      ? `${store.pageTitle}${store.description ? ` — ${store.description}` : ""}`
      : (store.description ?? undefined);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={store.name} description={description}>
        <SaveToFolderButton itemType="STORE" itemId={store.id} label={store.name} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <StoreLogo src={store.logo} name={store.name} size={48} />
        <div className="flex flex-col gap-1">
          <a
            href={`https://${store.shopifyDomain}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Globe className="size-3.5" />
            {store.shopifyDomain}
          </a>
          <div className="flex flex-wrap gap-1.5">
            <SourceBadge source={store.source} />
            <Badge variant="secondary">{store.category}</Badge>
            {store.techStack?.theme ? (
              <Badge variant="outline">Theme: {store.techStack.theme}</Badge>
            ) : null}
            {apps.map((app) => (
              <Badge key={app} variant="outline" className="text-muted-foreground">
                {app}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {store.monthlyRevenue !== null ? (
          <Stat
            label="Monthly revenue"
            value={formatCurrency(store.monthlyRevenue)}
            hint="Sample data"
          />
        ) : (
          <Stat
            label="Products"
            value={
              store.productCount === null ? (
                <Missing reason="storeMeasured" />
              ) : (
                formatProductCount(store.productCount, store.productCountTruncated)
              )
            }
            hint={
              store.productCountTruncated
                ? "Crawl capped at 10,000; the count is a floor"
                : "Public catalogue"
            }
          />
        )}
        {store.monthlyTraffic !== null ? (
          <Stat
            label="Monthly traffic"
            value={formatCompact(store.monthlyTraffic)}
            hint="Visits, sample data"
          />
        ) : (
          <Stat
            label="Price range"
            value={
              formatPriceRange(store.priceMin, store.priceMax, store.currency) ?? (
                <Missing reason="storeMeasured" />
              )
            }
            hint={store.currency ? `Listed prices, ${store.currency}` : "Listed prices"}
          />
        )}
        <Stat
          label="7-day growth"
          value={<GrowthIndicator growth={growth} className="text-xl" />}
          hint={growthMetric === "monthlyRevenue" ? "Revenue" : "Product count (observable)"}
        />
        <Stat
          label="Ads tracked"
          value={formatCompact(store.adCount)}
          hint={store.lastScrapedAt ? `Last scraped ${formatDate(store.lastScrapedAt)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{chartTitle}</CardTitle>
            <CardDescription>
              {chartSeries === "monthlyRevenue"
                ? `Daily figures from the last ${store.snapshots.length} snapshots (sample data)`
                : "Products in the public catalogue per snapshot"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart
              data={serialize(chartData)}
              formatAs={chartSeries === "productCount" ? "compact" : "currency"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top product</CardTitle>
            <CardDescription>
              {live ? "First listed in the public catalogue" : "Best seller by estimated revenue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topProduct ? (
              <div className="flex gap-4">
                {topProduct.imageUrl ? (
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={topProduct.imageUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="font-medium">{topProduct.name}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: store.currency ?? "USD",
                    }).format(topProduct.price)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No product data.</p>
            )}
            {live && store.rawTags.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1.5 text-xs text-muted-foreground">Raw store tags</p>
                <div className="flex flex-wrap gap-1">
                  {store.rawTags.slice(0, 12).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="font-normal text-muted-foreground"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {store.rawTags.length > 12 ? (
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      +{store.rawTags.length - 12}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle>Ads</CardTitle>
            <CardDescription>
              {store.adCount === 0
                ? "No ads tracked for this store."
                : `${Math.min(store.ads.length, store.adCount)} most recent of ${store.adCount}`}
            </CardDescription>
          </div>
          {store.adCount > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={adsHref}>
                All ads
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {store.ads.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No ads yet"
              description="Ads for this store will appear here once tracked."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28">Platform</TableHead>
                  <TableHead>Headline</TableHead>
                  <TableHead className="text-right">Days running</TableHead>
                  <TableHead className="text-right">Engagement</TableHead>
                  <TableHead className="text-right">Spend est.</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Impressions</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {store.ads.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell>
                      <PlatformBadge platform={ad.platform} />
                    </TableCell>
                    <TableCell className="max-w-[28rem] font-medium whitespace-normal">
                      {ad.headline}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Metric
                        value={daysBetween(ad.firstSeenAt, ad.lastSeenAt)}
                        format={(v) => `${v}d${ad.active ? "" : " · ended"}`}
                        reason="adSightings"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Metric
                        value={ad.engagementRate}
                        format={(v) => `${v.toFixed(2)}%`}
                        reason="adMetric"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Metric value={ad.spendEstimate} format={formatCurrency} reason="adMetric" />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {ad.impressions !== null ? (
                        formatCompact(ad.impressions)
                      ) : ad.euTotalReach !== null ? (
                        `${formatCompact(ad.euTotalReach)} EU`
                      ) : (
                        <Missing reason="adMetric" />
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                      {formatDate(ad.lastSeenAt ?? ad.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
