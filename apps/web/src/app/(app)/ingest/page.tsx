import Link from "next/link";
import { Activity, LogIn } from "lucide-react";
import { resolveDataSource } from "@synergilon/db/repositories";
import { listIngestRuns, listTrackedEntities } from "@synergilon/db/services";

import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
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
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ingestion" };
export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  SUCCESS: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  PARTIAL: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  FAILED: "border-rose-500/40 text-rose-700 dark:text-rose-400",
  RUNNING: "border-sky-500/40 text-sky-700 dark:text-sky-400",
};

function when(d: Date | null): string {
  if (!d) return "—";
  return `${formatDate(d)} ${d.toISOString().slice(11, 16)}Z`;
}

function duration(start: Date, end: Date | null): string {
  if (!end) return "running";
  const s = Math.round((end.getTime() - start.getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Operational view: recent IngestRun rows and the tracked work list. Signed-in users only. */
export default async function IngestPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <>
        <PageHeader
          title="Ingestion"
          description="Runs of the Meta Ad Library and Shopify storefront jobs."
        />
        <EmptyState icon={LogIn} title="Sign in to view ingestion runs">
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const [runs, entities] = await Promise.all([listIngestRuns(50), listTrackedEntities()]);
  const dataSource = resolveDataSource();
  const metaConfigured = Boolean(env.META_ACCESS_TOKEN);
  const cronAds = env.INGEST_ADS_CRON ?? "0 4 * * *";
  const cronStores = env.INGEST_STORES_CRON ?? "0 5 * * *";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ingestion"
        description={`DATA_SOURCE=${dataSource}. ${metaConfigured ? "Meta Ad Library credentials configured." : "No Meta Ad Library credentials configured — ingest-ads records FAILED runs until META_ACCESS_TOKEN is set."}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription>ingest-ads schedule</CardDescription>
          </CardHeader>
          <CardContent className="px-4 font-mono text-sm">{cronAds} UTC</CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription>ingest-stores schedule</CardDescription>
          </CardHeader>
          <CardContent className="px-4 font-mono text-sm">{cronStores} UTC</CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardHeader className="px-4">
            <CardDescription>Manual runs</CardDescription>
          </CardHeader>
          <CardContent className="px-4 font-mono text-xs">
            pnpm worker:ingest-ads
            <br />
            pnpm worker:ingest-stores
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>One row per job execution, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No runs yet"
              description="Run an ingestion job to see it here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Seen</TableHead>
                  <TableHead className="text-right">Written</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs">{run.source}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASS[run.status]}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {when(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {duration(run.startedAt, run.finishedAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{run.itemsSeen}</TableCell>
                    <TableCell className="text-right tabular-nums">{run.itemsWritten}</TableCell>
                    <TableCell
                      className="max-w-md truncate text-xs text-muted-foreground"
                      title={run.error ?? undefined}
                    >
                      {run.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracked entities</CardTitle>
          <CardDescription>
            {entities.length} in the work list. Add more with the chat tool{" "}
            <code className="font-mono text-xs">track_entity</code> or{" "}
            <code className="font-mono text-xs">pnpm db:seed:tracked</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entities.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Nothing tracked"
              description="Seed the work list with pnpm db:seed:tracked."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Kind</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Linked domain</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.kind}</TableCell>
                    <TableCell className="font-medium">{e.value}</TableCell>
                    <TableCell className="text-muted-foreground">{e.label ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">{e.linkedDomain ?? ""}</TableCell>
                    <TableCell>{e.active ? "yes" : "no"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {when(e.lastRunAt)}
                    </TableCell>
                    <TableCell
                      className="max-w-xs truncate text-xs text-muted-foreground"
                      title={e.lastError ?? undefined}
                    >
                      {e.lastError ?? ""}
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
