"use client";

/* ZCode-style find bar over the chat transcript (pattern adapted from ZCode's
 * ModelTrajectorySearchBar — Apache-2.0, see THIRD-PARTY-NOTICES.md).
 *
 * Row-level matching only: message internals are never re-rendered. Rows whose
 * content contains the query get a subtle ring via their wrapper div; the
 * active match gets an emphasized orange ring. Jump scrolls the row into view.
 */

import * as React from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { ChatMessage } from "@/lib/ducky/types";

export type TranscriptSearchDirection = "next" | "prev";

export interface TranscriptSearchMatch {
  /** ChatMessage.id of the matching row */
  messageId: string;
  /** 0-based position in the visible transcript */
  messageIndex: number;
}

/** Case-insensitive plain-text match over user/assistant message content. */
export function findTranscriptMatches(
  messages: readonly ChatMessage[],
  query: string,
): TranscriptSearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const out: TranscriptSearchMatch[] = [];
  messages.forEach((m, messageIndex) => {
    if ((m.content ?? "").toLowerCase().includes(needle)) {
      out.push({ messageId: m.id, messageIndex });
    }
  });
  return out;
}

/** Tailwind-only row highlight for the wrapper div around a MessageItem. */
export function transcriptRowHighlightClass(active: boolean, matched: boolean): string {
  if (active) return "bg-orange-500/[0.08] ring-2 ring-orange-500/80";
  if (matched) return "bg-amber-200/[0.04] ring-1 ring-amber-200/25";
  return "";
}

export function scrollToTranscriptRow(
  root: HTMLElement | null,
  messageId: string,
): boolean {
  if (!root || !messageId) return false;
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(messageId)
      : messageId;
  const row = root.querySelector(`[data-msg-id="${escaped}"]`);
  if (!row) return false;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

export function useTranscriptSearch(visible: readonly ChatMessage[]) {
  const [open, setOpen] = React.useState(false);
  const [query, setQueryState] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);

  const matches = React.useMemo(
    () => findTranscriptMatches(visible, query),
    [visible, query],
  );

  // Clamp at read time (no set-state-in-effect): the stored index self-corrects
  // on the next move()/setQuery() via the modulo/reset logic below.
  const clampedIdx = matches.length === 0 ? 0 : Math.min(activeIdx, matches.length - 1);

  const setQuery = React.useCallback((q: string) => {
    setQueryState(q);
    setActiveIdx(0);
  }, []);

  const move = React.useCallback(
    (dir: TranscriptSearchDirection) => {
      if (matches.length === 0) return;
      setActiveIdx((i) =>
        dir === "next"
          ? (i + 1) % matches.length
          : (i - 1 + matches.length) % matches.length,
      );
    },
    [matches.length],
  );

  const close = React.useCallback(() => {
    setOpen(false);
    setQueryState("");
    setActiveIdx(0);
  }, []);

  const activeMatch: TranscriptSearchMatch | null =
    matches.length > 0 ? (matches[clampedIdx] ?? null) : null;

  return { open, setOpen, query, setQuery, matches, activeIdx: clampedIdx, activeMatch, move, close };
}

interface TranscriptFindBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** total rows containing the query */
  matchCount: number;
  /** 1-based position of the active match, 0 when none */
  activePosition: number;
  onMove: (dir: TranscriptSearchDirection) => void;
  onClose: () => void;
}

export function TranscriptFindBar({
  query,
  onQueryChange,
  matchCount,
  activePosition,
  onMove,
  onClose,
}: TranscriptFindBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const empty = matchCount === 0;

  return (
    <div
      role="search"
      aria-label="Find in transcript"
      className="absolute right-4 top-3 z-20 flex h-8 min-w-0 items-center gap-1.5 rounded-lg border bg-background/95 py-0 pl-2 pr-1 shadow-lg backdrop-blur"
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            onMove(e.shiftKey ? "prev" : "next");
          }
        }}
        placeholder="Find in transcript"
        title="Find in transcript (⌘F)"
        aria-label="Find in transcript"
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
      />
      <span
        aria-live="polite"
        className="w-11 shrink-0 text-center font-mono text-[11px] tabular-nums text-muted-foreground"
      >
        {empty ? "0/0" : `${activePosition}/${matchCount}`}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1">
        <button
          type="button"
          disabled={empty}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          onClick={() => onMove("prev")}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
        >
          <ChevronUp className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={empty}
          aria-label="Next match"
          title="Next match (Enter)"
          onClick={() => onMove("next")}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Close find"
          title="Close (Esc)"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    </div>
  );
}
