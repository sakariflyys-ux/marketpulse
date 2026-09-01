"use client";

import * as React from "react";

type Page<T> = { data: T[]; nextCursor: string | null };

/**
 * Cursor-paginated list that starts from a server-rendered first page and
 * appends more via the JSON API. `nextPageUrl` is the endpoint with every
 * filter already applied; the cursor is appended per request. Pages remount the consuming component (keyed Suspense
 * boundary) when filters change, so there is no reset logic here.
 */
export function useCursorPages<T>(initial: Page<T>, nextPageUrl: string) {
  const [items, setItems] = React.useState(initial.data);
  const [nextCursor, setNextCursor] = React.useState(initial.nextCursor);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef<string | null>(null);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || inFlight.current === nextCursor) return;
    inFlight.current = nextCursor;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withCursor(nextPageUrl, nextCursor));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      }
      const page = (await res.json()) as Page<T>;
      setItems((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
      inFlight.current = null;
    } finally {
      setLoading(false);
    }
  }, [nextCursor, nextPageUrl]);

  return { items, hasMore: nextCursor !== null, loading, error, loadMore };
}

function withCursor(url: string, cursor: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`;
}

/** Calls `onVisible` when the returned ref's element scrolls into view. */
export function useInViewTrigger(onVisible: () => void, enabled: boolean) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVisible();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, enabled]);
  return ref;
}
