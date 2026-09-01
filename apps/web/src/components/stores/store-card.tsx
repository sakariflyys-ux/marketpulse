import Link from "next/link";
import { Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCompact, formatCurrency } from "@/lib/format";
import type { Serialized } from "@/lib/serialize";
import type { StoreSummary } from "@marketpulse/db/repositories";

import { GrowthIndicator } from "./growth-indicator";
import { StoreLogo } from "./store-logo";

export type StoreCardData = Serialized<StoreSummary> & { growth?: number | null };

export function StoreCard({ store }: { store: StoreCardData }) {
  const apps = store.techStack?.apps ?? [];
  const theme = store.techStack?.theme;
  return (
    <Link href={`/store/${encodeURIComponent(store.shopifyDomain)}`} className="group block h-full">
      <Card className="h-full gap-4 py-5 transition-colors hover:border-ring/60">
        <CardHeader className="flex flex-row items-start gap-3 px-5">
          <StoreLogo src={store.logo} name={store.name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate leading-tight font-semibold group-hover:underline">
                {store.name}
              </h3>
              {store.growth !== undefined ? <GrowthIndicator growth={store.growth} /> : null}
            </div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Globe className="size-3 shrink-0" />
              {store.shopifyDomain}
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Monthly revenue</p>
              <p className="font-semibold tabular-nums">{formatCurrency(store.monthlyRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly traffic</p>
              <p className="font-semibold tabular-nums">{formatCompact(store.monthlyTraffic)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{store.category}</Badge>
            {theme ? <Badge variant="outline">{theme}</Badge> : null}
            {apps.slice(0, 3).map((app) => (
              <Badge key={app} variant="outline" className="text-muted-foreground">
                {app}
              </Badge>
            ))}
            {apps.length > 3 ? (
              <Badge variant="outline" className="text-muted-foreground">
                +{apps.length - 3}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function StoreCardSkeleton() {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex flex-row items-start gap-3 px-5">
        <div className="size-10 animate-pulse rounded-lg bg-accent" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-accent" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-accent" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-8 animate-pulse rounded bg-accent" />
          <div className="h-8 animate-pulse rounded bg-accent" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-5 w-16 animate-pulse rounded bg-accent" />
          <div className="h-5 w-12 animate-pulse rounded bg-accent" />
          <div className="h-5 w-14 animate-pulse rounded bg-accent" />
        </div>
      </CardContent>
    </Card>
  );
}
