import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <ComingSoon
      title="Chat"
      phase={5}
      summary="Ask questions about the market with an assistant that uses the same tools as the MCP server."
    />
  );
}
