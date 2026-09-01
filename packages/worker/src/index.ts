/**
 * MarketPulse worker — pg-boss job runner.
 *
 * Phase 6 delivers the real implementation: a 24h scheduled job that drifts
 * each store's revenue/traffic and writes a new StoreSnapshot, cache
 * invalidation, and `--once` for manual runs. This stub only validates the
 * environment so the package participates in lint/typecheck from day one.
 */
import "@marketpulse/db/load-env";

const once = process.argv.includes("--once");

function main(): void {
  if (!process.env["DATABASE_URL"]) {
    console.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }
  console.log(`[worker] not implemented yet (Phase 6). mode=${once ? "run-once" : "daemon"}`);
}

main();
