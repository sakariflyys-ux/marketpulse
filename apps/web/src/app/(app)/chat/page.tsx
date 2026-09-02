import { Bot } from "lucide-react";

import { auth } from "@/auth";
import { Chat } from "@/components/chat/chat";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getAiConfig } from "@/lib/ai";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [config, session] = await Promise.all([getAiConfig(), auth()]);

  if (!config) {
    return (
      <>
        <PageHeader
          title="Chat"
          description="Ask questions about stores and ads in natural language."
        />
        <EmptyState
          icon={Bot}
          title="No AI provider configured"
          description="Set ANTHROPIC_API_KEY (or AI_PROVIDER=openai with OPENAI_API_KEY) in .env and restart the dev server to enable chat."
        >
          <pre className="mt-2 rounded-md bg-muted p-3 text-left font-mono text-xs">
            {"AI_PROVIDER=anthropic\nAI_MODEL=claude-opus-5\nANTHROPIC_API_KEY=sk-ant-…"}
          </pre>
        </EmptyState>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Chat"
        description="Ask questions about stores and ads in natural language."
      />
      <Chat model={config.model} signedIn={Boolean(session?.user?.id)} />
    </div>
  );
}
