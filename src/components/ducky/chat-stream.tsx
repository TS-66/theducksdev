"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDuckyStore } from "@/lib/ducky/store";
import type { ChatMessage } from "@/lib/ducky/types";
import { cn } from "@/lib/utils";
import { Hero } from "./hero";
import { MessageItem } from "./message-item";
import { TrajectoryExpansionProvider } from "./trajectory-expansion";
import {
  TranscriptFindBar,
  scrollToTranscriptRow,
  transcriptRowHighlightClass,
  useTranscriptSearch,
} from "./trajectory-search";

interface ChatStreamProps {
  /** fires while a run is live (for tool-state inference) */
  sessionRunning: boolean;
  onPick: (prompt: string, opts?: { planMode?: boolean }) => void;
  /** centered zcode-style composer rendered inside the hero */
  composerSlot?: React.ReactNode;
  /** extra props forwarded into the hero (project state + callbacks); onPick is provided here */
  heroProps?: Omit<React.ComponentProps<typeof Hero>, "onPick" | "children">;
}

export function ChatStream({ sessionRunning, onPick, composerSlot, heroProps }: ChatStreamProps) {
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

  // ZCode-style find over the transcript (row-level; message internals untouched)
  const search = useTranscriptSearch(visible);
  const { open: findOpen, setOpen: setFindOpen, close: closeFind } = search;
  const hasMessages = visible.length > 0;
  const matchIds = React.useMemo(
    () => new Set(search.matches.map((mt) => mt.messageId)),
    [search.matches],
  );
  const activeId = search.activeMatch?.messageId ?? null;

  // auto-scroll when content grows / new messages arrive (held while finding)
  const tailKey = `${visible.length}:${visible.at(-1)?.content.length ?? 0}:${
    visible.at(-1)?.toolCalls?.length ?? 0
  }:${Boolean(session?.todos.length)}`;
  React.useEffect(() => {
    if (findOpen && search.query.trim() !== "") return;
    requestAnimationFrame(() => {
      const vp = getViewport();
      if (vp) vp.scrollTop = vp.scrollHeight;
    });
  }, [tailKey, findOpen, search.query]);

  // reset the find state when switching sessions
  React.useEffect(() => {
    closeFind();
  }, [session?.id, closeFind]);

  // ⌘F / Ctrl+F toggles the find bar while the transcript is visible
  React.useEffect(() => {
    if (!hasMessages) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (findOpen) closeFind();
        else setFindOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasMessages, findOpen, setFindOpen, closeFind]);

  // jump the viewport to the active match row
  React.useEffect(() => {
    if (!findOpen || !activeId) return;
    scrollToTranscriptRow(rootRef.current, activeId);
  }, [findOpen, activeId]);

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
      /* plain overflow container — Radix ScrollArea's display:table content
         wrapper would let the hero's intrinsic width stretch the viewport */
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto min-h-full w-full max-w-3xl px-4 py-6 md:px-8">
          <Hero onPick={onPick} {...heroProps}>{composerSlot}</Hero>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {findOpen && (
        <TranscriptFindBar
          query={search.query}
          onQueryChange={search.setQuery}
          matchCount={search.matches.length}
          activePosition={
            search.matches.length > 0
              ? Math.min(search.activeIdx, search.matches.length - 1) + 1
              : 0
          }
          onMove={search.move}
          onClose={closeFind}
        />
      )}
      <ScrollArea ref={rootRef} className="min-h-0 flex-1">
        <TrajectoryExpansionProvider>
        <div className="mx-auto max-w-[46rem] space-y-4 px-4 py-8 md:px-6">
          {visible.map((m, i) => {
            const matched = matchIds.has(m.id);
            const active = findOpen && activeId !== null && m.id === activeId;
            return (
              <div
                key={m.id}
                data-msg-id={m.id}
                className={cn(
                  "scroll-mb-6 scroll-mt-6 rounded-md",
                  findOpen && matched && transcriptRowHighlightClass(active, matched),
                )}
              >
                <MessageItem
                  message={m}
                  toolResults={toolResults}
                  sessionRunning={sessionRunning}
                  index={i}
                />
              </div>
            );
          })}
          <div aria-hidden className="h-1" />
        </div>
        </TrajectoryExpansionProvider>
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
