import { Suspense } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import type { Session } from "next-auth";

import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

import { SearchForm } from "./search-form";
import { UserMenu } from "./user-menu";

export function Topbar({ session }: { session: Session | null }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <Link href="/dashboard" className="flex items-center gap-2 font-semibold md:hidden">
        <Activity className="size-5" />
        <span className="sr-only">MarketPulse</span>
      </Link>
      <div className="flex flex-1 justify-center md:justify-start">
        <Suspense fallback={<Skeleton className="h-9 w-full max-w-md" />}>
          <SearchForm />
        </Suspense>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu session={session} />
      </div>
    </header>
  );
}
