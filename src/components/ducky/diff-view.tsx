"use client";

/**
 * Unified red/green diff renderer for edit_file tool cards.
 * Renders old_str/new_str from the call args as a side-by-side-ish
 * unified diff — mirrors how harness UIs visualize file edits.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface DiffViewProps {
  oldStr: string;
  newStr: string;
}

function splitLines(s: string): string[] {
  if (s === "") return [];
  return s.split("\n");
}

export function DiffView({ oldStr, newStr }: DiffViewProps) {
  const removed = React.useMemo(() => splitLines(oldStr), [oldStr]);
  const added = React.useMemo(() => splitLines(newStr), [newStr]);

  const rows: Array<{ kind: "ctx" | "del" | "add"; text: string }> = [];
  // Simple alignment: shared prefix, shared suffix; middle becomes -/+ block.
  let pre = 0;
  while (
    pre < removed.length &&
    pre < added.length &&
    removed[pre] === added[pre]
  ) {
    rows.push({ kind: "ctx", text: removed[pre] });
    pre++;
  }
  let suf = 0;
  while (
    suf < removed.length - pre &&
    suf < added.length - pre &&
    removed[removed.length - 1 - suf] === added[added.length - 1 - suf]
  ) {
    suf++;
  }
  const delMid = removed.slice(pre, removed.length - suf);
  const addMid = added.slice(pre, added.length - suf);
  for (const line of delMid) rows.push({ kind: "del", text: line });
  for (const line of addMid) rows.push({ kind: "add", text: line });
  for (let i = removed.length - suf; i < removed.length; i++) {
    rows.push({ kind: "ctx", text: removed[i] });
  }

  return (
    <div
      aria-label="File edit diff"
      className="overflow-hidden rounded border border-border/60 bg-[#0d1117] font-mono text-[11px] leading-relaxed"
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="text-red-400">−{delMid.length}</span>
        <span className="text-emerald-400">+{addMid.length}</span>
        <span>edit preview</span>
      </div>
      <div className="max-h-64 overflow-auto">
        {rows.map((r, i) => (
          <div
            key={i}
            className={cn(
              "flex whitespace-pre-wrap break-all px-2",
              r.kind === "del" && "bg-red-500/10 text-red-300",
              r.kind === "add" && "bg-emerald-500/10 text-emerald-300",
              r.kind === "ctx" && "text-muted-foreground",
            )}
          >
            <span aria-hidden className="mr-2 shrink-0 select-none opacity-60">
              {r.kind === "del" ? "−" : r.kind === "add" ? "+" : " "}
            </span>
            <span className="min-w-0">{r.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Extract old_str/new_str from raw args JSON for edit_file cards. */
export function parseEditArgs(argsRaw: string): { oldStr: string; newStr: string } | null {
  try {
    const o = JSON.parse(argsRaw) as Record<string, unknown>;
    if (typeof o.old_str === "string" && typeof o.new_str === "string") {
      return { oldStr: o.old_str, newStr: o.new_str };
    }
    return null;
  } catch {
    return null;
  }
}
