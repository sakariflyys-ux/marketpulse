/**
 * MarketPulse worker.
 *
 *   pnpm worker:dev        — daemon: pg-boss schedules the snapshot job
 *                            (SNAPSHOT_CRON, default 03:00 UTC daily) and works it
 *   pnpm worker:run-once   — run the snapshot job immediately and exit
 *
 * pg-boss keeps its queue in the same Postgres (schema "pgboss"), so no
 * extra infrastructure is needed.
 */
import "@marketpulse/db/load-env";
import { PgBoss } from "pg-boss";
import { prisma } from "@marketpulse/db";
import { cache } from "@marketpulse/db/cache";
import { runSnapshotJob } from "./snapshot-job";

const QUEUE = "store-snapshot";
const SCHEDULE_KEY = "daily";
const DEFAULT_CRON = "0 3 * * *";

function log(message: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

async function runOnce(): Promise<void> {
  log("running snapshot job once");
  const result = await runSnapshotJob();
  log(`done: ${result.snapshots} snapshots, drift ±${result.maxDriftPct}%, ${result.durationMs}ms`);
}

async function daemon(connectionString: string): Promise<void> {
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => log(`pg-boss error: ${err.message}`));
  await boss.start();

  await boss.createQueue(QUEUE);
  const cron = process.env["SNAPSHOT_CRON"] || DEFAULT_CRON;
  // Re-registering the same key replaces the previous schedule (idempotent restarts).
  await boss.schedule(QUEUE, cron, null, { tz: "UTC", key: SCHEDULE_KEY });
  log(`scheduled "${QUEUE}" with cron "${cron}" (UTC)`);

  await boss.work(QUEUE, async (jobs) => {
    // pg-boss hands the handler a batch; the job is idempotent per run so
    // one execution covers any batch.
    const ids = jobs.map((j) => j.id).join(", ");
    log(`job(s) ${ids}: starting`);
    const result = await runSnapshotJob();
    log(
      `job(s) ${ids}: ${result.snapshots} snapshots, drift ±${result.maxDriftPct}%, ${result.durationMs}ms`,
    );
    return result;
  });

  log("daemon ready");

  const shutdown = async () => {
    log("shutting down");
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined);
    await cache.disconnect();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  if (process.argv.includes("--once")) {
    await runOnce();
    await cache.disconnect();
    await prisma.$disconnect();
    return;
  }
  await daemon(connectionString);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
