"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ChatMessage, ToolCallData } from "@/lib/ducky/types";
import { summarizeArgs, truncate } from "./format";
import { getToolMeta } from "./tool-meta";
import { DiffView, parseEditArgs } from "./diff-view";

export type ToolRunState = "running" | "ok" | "err" | "pending";

interface ToolCallCardProps {
  call: ToolCallData;
  /** paired role=tool message, if it has arrived yet */
  result?: ChatMessage;
  running?: boolean;
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw || "{}"), null, 2);
  } catch {
    return raw;
  }
}

export function ToolCallCard({ call, result, running }: ToolCallCardProps) {
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const state: ToolRunState = result
    ? result.status === "error"
      ? "err"
      : "ok"
    : running
      ? "running"
      : "pending";

  const dot =
    state === "ok"
      ? "bg-emerald-400"
      : state === "err"
        ? "bg-red-500"
        : state === "running"
          ? "bg-amber-400 ducky-pulse-dot"
          : "bg-muted-foreground/40";

  const name = call.function.name;
  const summary = summarizeArgs(call.function.arguments);
  const meta = getToolMeta(name);
  const isEdit = name === "edit_file";
  const editArgs = React.useMemo(
    () => (isEdit ? parseEditArgs(call.function.arguments) : null),
    [isEdit, call.function.arguments],
  );
  // Auto-open edit cards so the diff is immediately visible (derived, not
  // an effect: dismissal is recorded in the toggle handler below).
  const autoOpen = editArgs != null && state === "ok" && !dismissed;

  const outputTone =
    result?.status === "error" ? "text-destructive bg-destructive/5" : "text-foreground/90";

  return (
    <Collapsible
      open={open || autoOpen}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setDismissed(true);
      }}
      className="min-w-0 overflow-hidden rounded-lg border border-white/[0.08]"
    >
      <div
        className={cn(
          "text-xs transition-all",
          state === "running" && cn("border-l-2", meta.accent),
        )}
      >
        <CollapsibleTrigger
          aria-expanded={open}
          className="sticky top-0 z-10 flex w-full items-center gap-2 bg-[#202020]/95 px-3 py-2 text-left backdrop-blur transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", dot)}
            data-state={state}
          />
          <span
            className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--traj-tool-call)", opacity: 0.8 }}
          >
            tool
          </span>
          <span className="shrink-0 font-mono font-semibold">{name}</span>
          <span className="hidden rounded bg-muted/70 px-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground sm:inline">
            {meta.label}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
            {truncate(summary, 120)}
          </span>
          {result?.durationMs != null && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {(result.durationMs / 1000).toFixed(2)}s
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 p-2">
            {editArgs ? (
              <div className="overflow-hidden rounded-lg border border-white/[0.08]">
                <div className="flex h-8 items-center bg-white/[0.03] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" style={{ color: "var(--traj-tool-call)", opacity: 0.8 }}>
                  tool input · diff
                </div>
                <div className="border-t border-white/[0.06] p-2">
                  <DiffView oldStr={editArgs.oldStr} newStr={editArgs.newStr} />
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-white/[0.08]">
                <div className="flex h-8 items-center bg-white/[0.03] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" style={{ color: "var(--traj-tool-call)", opacity: 0.8 }}>
                  tool input
                </div>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all border-t border-white/[0.06] p-2 font-mono text-[11px] leading-relaxed">
                  {prettyJson(call.function.arguments)}
                </pre>
              </div>
            )}

            {result ? (
              <div className="overflow-hidden rounded-lg border border-white/[0.08]">
                <div className="flex h-8 items-center gap-2 bg-white/[0.03] px-3">
                  <span
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: "var(--traj-tool-result)", opacity: 0.8 }}
                  >
                    tool output
                  </span>
                  {result.durationMs != null && (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {(result.durationMs / 1000).toFixed(2)}s
                    </span>
                  )}
                  {state === "err" && (
                    <span className="font-mono text-[10px] uppercase text-destructive">error</span>
                  )}
                </div>
                <pre
                  className={cn(
                    "max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-white/[0.06] p-2 font-mono text-[11px] leading-relaxed",
                    outputTone,
                  )}
                >
                  {result.content || (result.error ?? "(empty output)")}
                </pre>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-amber-500/90">
                <span className="inline-block size-1.5 rounded-full bg-amber-400 ducky-pulse-dot" />
                awaiting tool result…
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
