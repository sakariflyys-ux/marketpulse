"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function DiscoverFilters({
  categories,
}: {
  categories: { category: string; count: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";

  function update(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={category || ALL}
        onValueChange={(v) => update({ category: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-48" aria-label="Filter by category">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.category} value={c.category}>
              {c.category}
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">({c.count})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {q ? (
        <Button variant="secondary" size="sm" onClick={() => update({ q: undefined })}>
          Search: &ldquo;{q}&rdquo;
          <X />
        </Button>
      ) : null}
    </div>
  );
}
