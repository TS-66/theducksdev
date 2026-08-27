"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDuckyStore } from "@/lib/ducky/store";
import type { ChatMessage } from "@/lib/ducky/types";
import { Hero } from "./hero";
import { MessageItem } from "./message-item";

interface ChatStreamProps {
  /** fires while a run is live (for tool-state inference) */
  sessionRunning: boolean;
  onPick: (prompt: string, opts?: { planMode?: boolean }) => void;
  onNewTask: () => void;
}

export function ChatStream({ sessionRunning, onPick, onNewTask }: ChatStreamProps) {
  const sessions = useDuckyStore((s) => s.sessions);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);

  const session = sessions.find((s) => s.id === activeSessionId) ?? null;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = React.useState(false);

  const messages = session?.messages ?? [];
  const visible: ChatMessage[] = React.useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages],
  );
  const toolResults = React.useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) if (m.role === "tool" && m.toolCallId) map.set(m.toolCallId, m);
    return map;
  }, [messages]);

  const getViewport = () =>
    rootRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;

  // auto-scroll when content grows / new messages arrive
  const tailKey = `${visible.length}:${visible.at(-1)?.content.length ?? 0}:${
    visible.at(-1)?.toolCalls?.length ?? 0
  }:${Boolean(session?.todos.length)}`;
  React.useEffect(() => {
    requestAnimationFrame(() => {
      const vp = getViewport();
      if (vp) vp.scrollTop = vp.scrollHeight;
    });
  }, [tailKey]);

  // track distance-from-bottom → toggle the jump-to-latest chip
  React.useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const onScroll = () => {
      const dist = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      setShowJump(dist > 260);
    };
    onScroll();
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      vp.removeEventListener("scroll", onScroll);
      setShowJump(false);
    };
  }, [session?.id, visible.length > 0]);

  if (!session || visible.length === 0) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="ducky-grid-bg mx-auto min-h-full max-w-3xl px-4 py-6 md:px-8">
          <Hero
            variant={session ? "welcome" : "empty-session"}
            onPick={onPick}
            onNewTask={onNewTask}
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScrollArea ref={rootRef} className="min-h-0 flex-1">
        <div className="ducky-grid-bg mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
          {visible.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              toolResults={toolResults}
              sessionRunning={sessionRunning}
            />
          ))}
          <div aria-hidden className="h-1" />
        </div>
      </ScrollArea>
      {showJump && (
        <button
          type="button"
          onClick={() => {
            const vp = getViewport();
            vp?.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
          }}
          className="absolute bottom-4 right-5 z-10 flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg backdrop-blur transition-all hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Jump to latest message"
        >
          <ArrowDown className={sessionRunning ? "size-3.5 animate-bounce" : "size-3.5"} aria-hidden />
          {sessionRunning ? "live — jump" : "jump to latest"}
        </button>
      )}
    </div>
  );
}
