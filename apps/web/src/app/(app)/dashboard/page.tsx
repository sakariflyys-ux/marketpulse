import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Compass,
  Database,
  Megaphone,
  Store as StoreIcon,
  TrendingUp,
} from "lucide-react";

import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { formatCompact, formatCurrency } from "@/lib/format";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="flex flex-row items-center justify-between px-5">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-5">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="gap-2 py-5">
          <CardHeader className="px-5">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="px-5">
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function Stats() {
  const stats = await getDashboardStats();

  if (stats.stores === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" />
            No data yet
          </CardTitle>
          <CardDescription>
            The database is empty. Seed it with mock stores and ads, then refresh.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-3 font-mono text-xs">pnpm db:seed</pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked stores" value={formatCompact(stats.stores)} icon={StoreIcon} />
        <StatCard label="Ads indexed" value={formatCompact(stats.ads)} icon={Megaphone} />
        <StatCard
          label="Combined monthly revenue"
          value={formatCurrency(stats.totalMonthlyRevenue)}
          hint="Sum of estimated revenue across all stores"
          icon={TrendingUp}
        />
        <StatCard
          label="Snapshots"
          value={formatCompact(stats.snapshots)}
          hint={
            stats.latestSnapshotAt
              ? `Latest ${stats.latestSnapshotAt.toISOString().slice(0, 10)}`
              : undefined
          }
          icon={Database}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Top categories</CardTitle>
          <CardDescription>By number of tracked stores</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {stats.topCategories.map((c) => (
            <Badge key={c.category} variant="secondary" className="gap-1.5 px-2.5 py-1 text-sm">
              {c.category}
              <span className="text-muted-foreground tabular-nums">{c.count}</span>
            </Badge>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

const NEXT_STEPS = [
  {
    href: "/discover",
    title: "Discover trending stores",
    description: "Ranked by revenue growth over the last week.",
    icon: Compass,
  },
  {
    href: "/ads",
    title: "Browse the ad library",
    description: "Filter creatives by platform, engagement and spend.",
    icon: Megaphone,
  },
  {
    href: "/saved",
    title: "Organise what you find",
    description: "Save stores and ads into nested folders.",
    icon: Bookmark,
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome to Synergilon"}
        description="Your market intelligence workspace for Shopify stores and paid social creatives."
      >
        {!session?.user ? (
          <Button asChild size="sm">
            <Link href="/login">
              Sign in
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>

      <section aria-labelledby="next-steps">
        <h2 id="next-steps" className="mb-3 text-sm font-medium text-muted-foreground">
          Get started
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {NEXT_STEPS.map((step) => (
            <Link key={step.href} href={step.href} className="group">
              <Card className="h-full gap-3 py-5 transition-colors hover:border-ring/60">
                <CardHeader className="px-5">
                  <step.icon className="mb-1 size-5 text-muted-foreground" />
                  <CardTitle className="flex items-center gap-1 text-base">
                    {step.title}
                    <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
