"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export const AD_SORTS = [
  { value: "engagement", label: "Engagement" },
  { value: "spend", label: "Spend estimate" },
  { value: "impressions", label: "Impressions" },
  { value: "newest", label: "Newest" },
  { value: "relevance", label: "Relevance" },
] as const;

export function AdsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const platform = params.get("platform") ?? "";
  const sort = params.get("sort") ?? (q ? "relevance" : "engagement");
  const minEngagement = params.get("minEngagement") ?? "";
  const storeId = params.get("storeId") ?? "";
  const [search, setSearch] = React.useState(q);
  const [prevQ, setPrevQ] = React.useState(q);
  // Sync the input when the URL changes from outside (e.g. the top-bar search).
  if (q !== prevQ) {
    setPrevQ(q);
    setSearch(q);
  }

  const update = React.useCallback(
    (next: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      const s = sp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    },
    [params, pathname, router],
  );

  // Debounce typing so every keystroke doesn't re-render the server page.
  React.useEffect(() => {
    if (search === q) return;
    const t = setTimeout(
      () => update({ q: search || undefined, sort: search ? "relevance" : undefined }),
      350,
    );
    return () => clearTimeout(t);
  }, [search, q, update]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search headlines…"
          className="w-56 pl-9"
          aria-label="Search ads"
        />
      </div>
      <Select
        value={platform || ALL}
        onValueChange={(v) => update({ platform: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-36" aria-label="Filter by platform">
          <SelectValue placeholder="All platforms" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All platforms</SelectItem>
          <SelectItem value="META">Meta</SelectItem>
          <SelectItem value="TIKTOK">TikTok</SelectItem>
          <SelectItem value="GOOGLE">Google</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={minEngagement || ALL}
        onValueChange={(v) => update({ minEngagement: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-40" aria-label="Minimum engagement">
          <SelectValue placeholder="Any engagement" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any engagement</SelectItem>
          <SelectItem value="2">≥ 2%</SelectItem>
          <SelectItem value="5">≥ 5%</SelectItem>
          <SelectItem value="8">≥ 8%</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={(v) => update({ sort: v })}>
        <SelectTrigger className="w-40" aria-label="Sort by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AD_SORTS.filter((s) => s.value !== "relevance" || q).map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {storeId ? (
        <Button variant="secondary" size="sm" onClick={() => update({ storeId: undefined })}>
          Single store
          <X />
        </Button>
      ) : null}
    </div>
  );
}
