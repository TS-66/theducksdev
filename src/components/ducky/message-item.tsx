"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  Circle,
  Copy,
  ListTodo,
  Loader2,
  X,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage, TodoItem } from "@/lib/ducky/types";
import { modelDisplayName } from "@/lib/ducky/models";
import { fmtK } from "./format";
import { MarkdownBody } from "./markdown-body";
import { ToolCallCard } from "./tool-call-card";

/* ─────────────────────────────── MessageItem ─────────────────────────────── */

function Stamp({ t }: { t: number }) {
  const time = new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <span className="shrink-0 pt-1 font-mono text-[10px] text-muted-foreground/70">{time}</span>
  );
}

/** Reasoning ("thinking") ghost card — dashed border, italic body. */
function ReasoningCard({ text, streaming }: { text: string; streaming: boolean }) {
  const wasStreaming = React.useRef(streaming);
  const [open, setOpen] = React.useState(streaming);
  // default open while streaming, collapse once done; user can still toggle
  React.useEffect(() => {
    if (wasStreaming.current && !streaming) setOpen(false);
    if (streaming && !wasStreaming.current) setOpen(true);
    wasStreaming.current = streaming;
  }, [streaming]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-dashed bg-muted/20"
      style={{ borderColor: "color-mix(in oklab, var(--traj-reasoning) 40%, transparent)" }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <Brain className="size-3.5 shrink-0" style={{ color: "var(--traj-reasoning)" }} aria-hidden />
        <span className="flex-1 truncate text-xs italic text-muted-foreground">
          Thinking{streaming ? "…" : ""}
        </span>
        <CollapsibleTrigger
          aria-label="Toggle reasoning"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="whitespace-pre-wrap border-t border-dashed px-3 py-2 text-sm italic leading-relaxed text-muted-foreground">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface MessageItemProps {
  message: ChatMessage;
  /** role=tool messages keyed by tool_call_id for pairing */
  toolResults: Map<string, ChatMessage>;
  /** true while a run is live (drives caret + inferred tool-running states) */
  sessionRunning: boolean;
}

export function MessageItem({ message: m, toolResults, sessionRunning }: MessageItemProps) {
  // assistant + shared copy state (hooks must run before the early return)
  const [copied, setCopied] = React.useState(false);

  if (m.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="border-l-2 pl-4"
        style={{ borderColor: "var(--traj-user)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {m.content}
          </p>
          <Stamp t={m.createdAt} />
        </div>
      </motion.div>
    );
  }

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="group/msg space-y-1 border-l-2 pl-4"
      style={{ borderColor: "var(--traj-assistant)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: "var(--traj-assistant)" }} />
          ducky
        </span>
        <div className="flex items-center gap-1.5">
          <UsageChip message={m} />
          {m.status !== "streaming" && m.content.trim() && (
            <button
              type="button"
              onClick={copyContent}
              aria-label={copied ? "Copied" : "Copy message"}
              className="rounded p-0.5 text-muted-foreground/0 transition-all hover:text-muted-foreground focus-visible:text-muted-foreground group-hover/msg:text-muted-foreground/70"
            >
              {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            </button>
          )}
          <Stamp t={m.createdAt} />
        </div>
      </div>

      <div className="-mt-0.5 space-y-2.5">
        {Boolean(m.reasoning?.trim()) && m.reasoning && (
          <ReasoningCard text={m.reasoning} streaming={m.status === "streaming"} />
        )}

        {m.content.length > 0 ? (
          <>
            <MarkdownBody content={m.content} />
            {m.status === "streaming" && (
              <span aria-hidden className="ducky-caret font-mono text-primary">
                ▊
              </span>
            )}
          </>
        ) : (
          m.status === "streaming" &&
          !m.reasoning && (
            <span aria-hidden className="ducky-caret font-mono text-primary">
              ▊
            </span>
          )
        )}

        {m.status === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription className="break-words font-mono text-xs">
              {m.error ?? "The model returned an error."}
            </AlertDescription>
          </Alert>
        )}

        {m.status === "aborted" && (
          <p className="text-xs italic text-muted-foreground">stopped by user</p>
        )}

        {Boolean(m.toolCalls?.length) && (
          <div className="space-y-1.5 pt-1">
            {(m.toolCalls ?? []).map((call) => (
              <ToolCallCard
                key={call.id}
                call={call}
                result={toolResults.get(call.id)}
                running={sessionRunning && m.status === "streaming"}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────── UsageChip ─────────────────────────────── */

/** Token/model metadata for a finished assistant turn — quiet mono chip. */
function UsageChip({ message: m }: { message: ChatMessage }) {
  const meta = m.meta;
  if (!meta) return null;
  const prompt = meta.promptTokens ?? 0;
  const completion = meta.completionTokens ?? 0;
  const total = prompt + completion;
  if (!meta.model && total === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="flex cursor-help items-center gap-0.5 rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-[9px] text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Model ${meta.model ?? "unknown"}, ${total} tokens`}
        >
          <Zap className={cn("size-2.5", total > 0 ? "text-[#FF7A1A]" : "text-muted-foreground")} aria-hidden />
          {total > 0 ? fmtK(total) : modelDisplayName(meta.model)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-[10px]">
        <p className="font-sans font-semibold">{modelDisplayName(meta.model)}</p>
        <p>prompt · {prompt.toLocaleString()} tok</p>
        <p>completion · {completion.toLocaleString()} tok</p>
        {typeof meta.iteration === "number" && <p>iteration · #{meta.iteration}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/* ──────────────────────────────── TodoCard ──────────────────────────────── */

const todoGlyphByStatus: Record<TodoItem["status"], React.ReactNode> = {
  completed: <Check className="size-3.5 text-emerald-500" aria-hidden />,
  in_progress: <Loader2 className="size-3.5 animate-spin text-amber-400" aria-hidden />,
  cancelled: <X className="size-3 text-muted-foreground/50" aria-hidden />,
  pending: <Circle className="size-3.5 text-muted-foreground/60" aria-hidden />,
};

export function TodoCard({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null;
  const done = todos.filter((t) => t.status === "completed").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mx-auto w-full max-w-3xl px-4 md:px-8"
    >
      <div className="rounded-lg border bg-card/60 shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <ListTodo className="size-3.5 text-muted-foreground" aria-hidden />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Todos
          </h3>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {done}/{todos.length}
          </span>
        </div>
        <ul className="px-2 py-1.5">
          {todos.map((t, i) => (
            <li
              key={`${i}-${t.content.slice(0, 16)}`}
              className="flex items-start gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-muted/40"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {todoGlyphByStatus[t.status]}
              </span>
              <span
                className={cn(
                  "min-w-0 break-words",
                  t.status === "completed" && "text-muted-foreground line-through",
                  t.status === "in_progress" && "font-semibold",
                  t.status === "cancelled" && "text-muted-foreground/50 line-through",
                )}
              >
                {t.content}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
