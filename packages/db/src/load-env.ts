import path from "node:path";
import { config } from "dotenv";

/**
 * Loads the repo-root `.env` (shared by every workspace), then any `.env` in
 * the current working directory. Existing process env always wins. Import
 * this first in any standalone entrypoint (seed, worker, MCP server).
 */
const repoRoot = path.resolve(import.meta.dirname, "../../..");
config({ path: path.join(repoRoot, ".env"), quiet: true });
config({ quiet: true });
