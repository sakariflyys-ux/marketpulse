/**
 * MarketPulse MCP server (stdio).
 *
 * Exposes the shared tool definitions from @marketpulse/db/tools over the
 * Model Context Protocol so Claude Desktop (or any MCP client) can query the
 * same Postgres the web app uses. stdout is the transport, so all logging
 * goes to stderr.
 */
import "@marketpulse/db/load-env";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { prisma } from "@marketpulse/db";
import {
  marketpulseTools,
  ToolError,
  type ToolContext,
  type ToolDefinition,
} from "@marketpulse/db/tools";

function log(message: string): void {
  process.stderr.write(`[mcp-server] ${message}\n`);
}

async function main(): Promise<void> {
  if (!process.env["DATABASE_URL"]) {
    log("DATABASE_URL is not set");
    process.exit(1);
  }

  // MCP has no session; save_to_folder uses this unless userId is passed.
  const ctx: ToolContext = { userId: process.env["MCP_USER_ID"] || undefined };

  const server = new McpServer({ name: "marketpulse", version: "0.1.0" });

  // Widened to the generic definition type so one loop registers every tool.
  for (const def of marketpulseTools as readonly ToolDefinition[]) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      async (input: Record<string, unknown>) => {
        try {
          const result = await def.execute(input, ctx);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const message = err instanceof ToolError ? err.message : `Tool failed: ${String(err)}`;
          if (!(err instanceof ToolError)) log(`${def.name}: ${String(err)}`);
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready (${marketpulseTools.map((t) => t.name).join(", ")})`);

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log(String(err));
  process.exit(1);
});
