"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Global search. Navigates to /discover?q=... — that page lands in Phase 3, so
 * for now this only wires the routing.
 */
export function SearchForm() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        router.push(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover");
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        name="q"
        type="search"
        defaultValue={params.get("q") ?? ""}
        placeholder="Search stores and ads…"
        className="h-9 pl-9"
        aria-label="Search stores and ads"
      />
    </form>
  );
}
