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
  const Icon = meta.icon;
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
      className="min-w-0"
    >
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] text-xs transition-all",
          state === "running" && cn("border-l-2 shadow-sm", meta.accent),
        )}
      >
        <CollapsibleTrigger
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className={cn("flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.04]", state === "running" && "ducky-glow-breathe")}
            data-state={state}
          >
            <Icon
              aria-hidden
              className={cn(
                "size-3.5",
                meta.tint,
                state === "running" && "ducky-spin-slow",
              )}
            />
          </span>
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", dot)}
            data-state={state}
          />
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
          <div className="border-t px-2.5 py-2">
            {editArgs ? (
              <div className="mb-2">
                <DiffView oldStr={editArgs.oldStr} newStr={editArgs.newStr} />
              </div>
            ) : (
              <>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  args
                </div>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
                  {prettyJson(call.function.arguments)}
                </pre>
              </>
            )}

            {result ? (
              <div className="mt-2">
                <div
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-wide",
                    state === "err" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  ⎯ output ⎯{" "}
                  {result.durationMs != null && (
                    <span className="ml-1 normal-case">
                      · {(result.durationMs / 1000).toFixed(2)}s
                    </span>
                  )}
                </div>
                <pre
                  className={cn(
                    "mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-card p-2 font-mono text-[11px] leading-relaxed",
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
