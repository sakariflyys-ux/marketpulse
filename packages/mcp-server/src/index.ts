/**
 * MarketPulse MCP server (stdio).
 *
 * Phase 5 delivers the tools: search_ads, get_trending_stores,
 * get_store_insights, save_to_folder. This stub validates the environment so
 * the package participates in lint/typecheck from day one.
 */
import "@marketpulse/db/load-env";

function main(): void {
  if (!process.env["DATABASE_URL"]) {
    console.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }
  // stdout is reserved for the MCP transport; log to stderr.
  console.error("[mcp-server] not implemented yet (Phase 5)");
}

main();
