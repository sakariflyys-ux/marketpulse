import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { synergilonTools, ToolError, type ToolContext } from "@synergilon/db/tools";

import { auth } from "@/auth";
import { ApiError, apiError, withErrorHandling } from "@/lib/api";
import { getAiConfig, getLanguageModel } from "@/lib/ai";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.custom<UIMessage>((v) => typeof v === "object" && v !== null && "role" in v))
    .max(200),
});

const SYSTEM_PROMPT = `You are Synergilon's research assistant. You help e-commerce operators find trending Shopify stores and winning ad creatives using the tools provided; the data is Synergilon's own index (estimates, not official figures).

Guidelines:
- Prefer calling a tool over guessing. Chain tools when useful (e.g. find trending stores, then get_store_insights on one).
- Present results compactly: short bullet lists or small tables, revenue as $12.3K / $1.2M, growth as +8.4%.
- When you mention a store, include its domain so the user can open it at /store/<domain>. Ad ids can be saved with save_to_folder.
- Only call save_to_folder when the user explicitly asks to save something. If the tool reports no user, tell the user to sign in.
- If a tool returns nothing relevant, say so and suggest a different query rather than inventing data.`;

/**
 * POST /api/chat — Vercel AI SDK streaming endpoint. The tools are the same
 * definitions the MCP server exposes; only the SDK adapter differs.
 */
export const POST = withErrorHandling(async (request) => {
  const config = getAiConfig();
  if (!config) {
    throw new ApiError(
      503,
      "AI_NOT_CONFIGURED",
      "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Body must be { messages: UIMessage[] }");
  }

  const session = await auth();
  const ctx: ToolContext = { userId: session?.user?.id };

  const tools = Object.fromEntries(
    synergilonTools.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input: unknown) => {
          try {
            return await def.execute(input as never, ctx);
          } catch (err) {
            // Surface tool failures to the model as data instead of aborting the stream.
            if (err instanceof ToolError) return { error: err.message };
            console.error(`[chat] ${def.name}`, err);
            return { error: "Tool failed unexpectedly" };
          }
        },
      }),
    ]),
  );

  const result = streamText({
    model: getLanguageModel(config),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(body.messages, { ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse({
    // The SDK masks errors by default; the provider's message (invalid key,
    // rate limit, unknown model) is more useful to the person configuring it.
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
});
