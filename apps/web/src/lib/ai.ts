import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { env } from "@/lib/env";

export type AiProvider = "anthropic" | "openai";

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5",
};

export type AiConfig = { provider: AiProvider; model: string };

/**
 * Chat model resolution. `AI_PROVIDER` picks the vendor (default anthropic),
 * `AI_MODEL` overrides the model id, and the matching API key must be set —
 * otherwise `getAiConfig()` returns null and /chat renders its disabled state.
 */
export function getAiConfig(): AiConfig | null {
  const provider = env.AI_PROVIDER;
  const key = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!key) return null;
  return { provider, model: env.AI_MODEL ?? DEFAULT_MODELS[provider] };
}

export function getLanguageModel(config: AiConfig): LanguageModel {
  if (config.provider === "anthropic") {
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(config.model);
  }
  return createOpenAI({ apiKey: env.OPENAI_API_KEY })(config.model);
}
