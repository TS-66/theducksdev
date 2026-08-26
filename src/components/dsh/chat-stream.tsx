"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDshStore } from "@/lib/dsh/store";
import type { ChatMessage } from "@/lib/dsh/types";
import { Hero } from "./hero";
import { MessageItem } from "./message-item";

interface ChatStreamProps {
  /** fires while a run is live (for tool-state inference) */
  sessionRunning: boolean;
  onPick: (prompt: string) => void;
  onNewTask: () => void;
}

export function ChatStream({ sessionRunning, onPick, onNewTask }: ChatStreamProps) {
  const sessions = useDshStore((s) => s.sessions);
  const activeSessionId = useDshStore((s) => s.activeSessionId);

  const session = sessions.find((s) => s.id === activeSessionId) ?? null;
  const rootRef = React.useRef<HTMLDivElement>(null);

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

  // auto-scroll when content grows / new messages arrive
  const tailKey = `${visible.length}:${visible.at(-1)?.content.length ?? 0}:${
    visible.at(-1)?.toolCalls?.length ?? 0
  }:${Boolean(session?.todos.length)}`;
  React.useEffect(() => {
    requestAnimationFrame(() => {
      const vp = rootRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
      if (vp) vp.scrollTop = vp.scrollHeight;
    });
  }, [tailKey]);

  if (!session || visible.length === 0) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto min-h-full max-w-3xl px-4 py-6 md:px-8">
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
    <ScrollArea ref={rootRef} className="min-h-0 flex-1">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
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
  );
}
