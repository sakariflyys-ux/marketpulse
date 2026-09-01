"use client";

import * as React from "react";
import { Loader2, SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useCursorPages, useInViewTrigger } from "@/hooks/use-cursor-pages";

import { StoreCard, StoreCardSkeleton, type StoreCardData } from "./store-card";

export function StoreGrid({
  initial,
  nextPageUrl,
  emptyTitle,
  emptyDescription,
}: {
  initial: { data: StoreCardData[]; nextCursor: string | null };
  /** Endpoint for subsequent pages, with filters applied; the cursor is appended. */
  nextPageUrl: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const { items, hasMore, loading, error, loadMore } = useCursorPages(initial, nextPageUrl);
  const sentinel = useInViewTrigger(loadMore, hasMore && !loading && !error);

  if (items.length === 0) {
    return <EmptyState icon={SearchX} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StoreCardSkeleton key={`s-${i}`} />)
          : null}
      </div>
      <div ref={sentinel} className="flex h-16 items-center justify-center">
        {error ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-destructive">{error}</span>
            <Button size="sm" variant="outline" onClick={loadMore}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !hasMore ? (
          <p className="text-xs text-muted-foreground">You&apos;ve reached the end.</p>
        ) : null}
      </div>
    </>
  );
}
