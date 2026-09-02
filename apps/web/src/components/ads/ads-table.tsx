"use client";

import * as React from "react";
import { Loader2, Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Metric } from "@/components/missing-value";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCursorPages } from "@/hooks/use-cursor-pages";
import { daysBetween, formatCompact, formatCurrency } from "@/lib/format";

import { AdDetailDialog, type AdRowData } from "./ad-detail-dialog";
import { PlatformBadge } from "./platform-badge";

export function AdsTable({
  initial,
  nextPageUrl,
}: {
  initial: { data: AdRowData[]; nextCursor: string | null };
  nextPageUrl: string;
}) {
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, nextPageUrl);
  const [selected, setSelected] = React.useState<AdRowData | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No ads match these filters"
        description="Try a different platform, lower the engagement threshold, or clear the search."
      />
    );
  }

  return (
    <>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Platform</TableHead>
              <TableHead>Headline</TableHead>
              <TableHead className="hidden md:table-cell">Advertiser</TableHead>
              <TableHead className="text-right">Days running</TableHead>
              <TableHead className="text-right">Engagement</TableHead>
              <TableHead className="text-right">Spend est.</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Impressions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((ad) => (
              <TableRow
                key={ad.id}
                tabIndex={0}
                role="button"
                aria-label={`Open ad: ${ad.headline}`}
                onClick={() => setSelected(ad)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(ad);
                  }
                }}
                className="cursor-pointer outline-none focus-visible:bg-muted/50"
              >
                <TableCell>
                  <PlatformBadge platform={ad.platform} />
                </TableCell>
                <TableCell className="max-w-[28rem] truncate font-medium whitespace-normal">
                  {ad.headline}
                </TableCell>
                <TableCell className="hidden max-w-48 md:table-cell">
                  <span className="block truncate text-muted-foreground">
                    {ad.store?.name ?? ad.pageName ?? "—"}
                  </span>
                  <SourceBadge source={ad.source} className="mt-0.5 px-1.5 py-0 text-[10px]" />
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
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  <Metric value={ad.impressions} format={formatCompact} reason="adMetric" />
                </TableCell>
              </TableRow>
            ))}
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`s-${i}`} className="hover:bg-transparent">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell
                        key={j}
                        className={j >= 2 && j !== 3 && j !== 4 ? "hidden md:table-cell" : ""}
                      >
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex h-12 items-center justify-center gap-3">
        {error ? (
          <>
            <span className="text-sm text-destructive">{error}</span>
            <Button size="sm" variant="outline" onClick={loadMore}>
              Retry
            </Button>
          </>
        ) : hasMore ? (
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : null}
            Load more
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {items.length} ad{items.length === 1 ? "" : "s"} shown. You&apos;ve reached the end.
          </p>
        )}
      </div>
      <AdDetailDialog ad={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export function AdsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28">Platform</TableHead>
            <TableHead>Headline</TableHead>
            <TableHead className="hidden md:table-cell">Advertiser</TableHead>
            <TableHead className="text-right">Days running</TableHead>
            <TableHead className="text-right">Engagement</TableHead>
            <TableHead className="text-right">Spend est.</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Impressions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-3/4" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-10" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Skeleton className="ml-auto h-4 w-14" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
