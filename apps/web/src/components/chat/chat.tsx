"use client";

import * as React from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { Bot, ChevronRight, Loader2, Send, Sparkles, Square, User, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Which skincare stores are growing fastest this week?",
  "Find TikTok ads about free shipping with high engagement",
  "Give me insights on the top trending store",
];

export function Chat({ model, signedIn }: { model: string; signedIn: boolean }) {
  const transport = React.useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop, error } = useChat({ transport });
  const [input, setInput] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const busy = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex h-[calc(100svh-8.5rem)] min-h-96 flex-col rounded-xl border md:h-[calc(100svh-9.5rem)]">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          {model}
        </span>
        {!signedIn ? (
          <span>
            <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
              Sign in
            </Link>{" "}
            to save results into folders
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="font-medium">Ask about stores and ads</p>
              <p className="text-sm text-muted-foreground">
                The assistant searches Synergilon&apos;s index with the same tools the MCP server
                exposes.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => submit(s)}
                >
                  <ChevronRight />
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {status === "submitted" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking…
              </div>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive">{error.message || "Something went wrong."}</p>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about trending stores, ads, or a specific domain…"
          aria-label="Message"
          disabled={busy}
          autoFocus
        />
        {busy ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => stop()}
            aria-label="Stop"
          >
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
            <Send />
          </Button>
        )}
      </form>
    </div>
  );
}

function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
        )}
        aria-hidden
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-2", isUser && "items-end")}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  isUser ? "bg-secondary" : "bg-muted/60",
                )}
              >
                {part.text}
              </div>
            );
          }
          if (isToolUIPart(part)) {
            return (
              <ToolCall
                key={i}
                name={getToolName(part)}
                state={part.state}
                input={part.input}
                output={part.output}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolCall({
  name,
  state,
  input,
  output,
}: {
  name: string;
  state: string;
  input: unknown;
  output: unknown;
}) {
  const [open, setOpen] = React.useState(false);
  const done = state === "output-available";
  const failed = state === "output-error" || (done && isErrorOutput(output));
  return (
    <div className="w-full rounded-md border text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/60"
        aria-expanded={open}
      >
        {done || failed ? (
          <Wrench className="size-3.5" />
        ) : (
          <Loader2 className="size-3.5 animate-spin" />
        )}
        <span className="font-mono">{name}</span>
        <span className="truncate text-muted-foreground">{summarizeInput(input)}</span>
        <span className={cn("ml-auto", failed ? "text-destructive" : "text-muted-foreground")}>
          {failed ? "failed" : done ? "done" : "running"}
        </span>
      </button>
      {open ? (
        <pre className="max-h-64 overflow-auto border-t bg-muted/40 p-2.5 font-mono whitespace-pre-wrap">
          {JSON.stringify({ input, output }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function isErrorOutput(output: unknown): boolean {
  return typeof output === "object" && output !== null && "error" in output;
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  return Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
}
