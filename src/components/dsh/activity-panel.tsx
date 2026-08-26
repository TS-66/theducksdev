"use client";

/**
 * DSH Web — activity timeline panel (git-log style session ledger).
 *
 * Two views driven purely by persisted session data:
 *  ① Activity   — chronological ledger of prompts / responses / tool calls,
 *                 each with a pseudo-sha, status node and duration chips.
 *                 Entries that touched files deep-link into the file preview.
 *  ② Workspace Δ— diff against the seed tree: added / modified / removed with
 *                 inline unified diffs for modified files.
 */

import * as React from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  GitBranch,
  GitCommitHorizontal,
  History,
  Loader2,
  RotateCcw,
  Scissors,
  Search,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDshStore } from "@/lib/dsh/store";
import { SEED_WORKSPACE } from "@/lib/dsh/workspace-seed";
import {
  buildTimeline,
  clampDiffInput,
  lineDelta,
  planConversationTruncate,
  reconstructWorkspaceAt,
  workspaceChangeSets,
  workspaceDelta,
  type TimelineEntry,
} from "@/lib/dsh/timeline";
import type { Session } from "@/lib/dsh/types";
import { getToolMeta } from "./tool-meta";
import { DiffView } from "./diff-view";

interface ActivityPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  onPreviewFile: (path: string) => void;
}

export function ActivityTimelinePanel({
  open,
  onOpenChange,
  session,
  onPreviewFile,
}: ActivityPanelProps) {
  const delta = React.useMemo(
    () => workspaceDelta(session?.workspace ?? {}),
    [session?.workspace],
  );
  const deltaCount = delta.added.length + delta.modified.length + delta.removed.length;
  // subscribed once at the top — hooks never live inside conditional JSX
  const running = useDshStore((s) => s.isRunning);
  const hasMessages = Boolean(session && session.messages.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[420px] max-w-[94vw] flex-col gap-0 p-0 sm:max-w-[420px]"
      >
        <SheetHeader className="space-y-0 border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 font-mono text-sm">
            <GitBranch className="size-3.5 rotate-90 text-muted-foreground" aria-hidden />
            activity log
            <Badge variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
              HEAD · greeting-service
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Chronological ledger of “{session?.title ?? "no session"}” — derived from persisted
            events, nothing extra to maintain.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="activity" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mt-3 grid grid-cols-2">
            <TabsTrigger value="activity" className="gap-1.5">
              <History className="size-3.5" aria-hidden /> Activity
            </TabsTrigger>
            <TabsTrigger value="workspace" className="gap-1.5">
              <FilePenLine className="size-3.5" aria-hidden /> Workspace Δ{deltaCount > 0 ? ` (${deltaCount})` : ""}
            </TabsTrigger>
          </TabsList>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="activity" className="mt-0 px-4 py-4">
              {!hasMessages ? (
                <EmptyLedger />
              ) : (
                <LedgerBrowser session={session!} onPreviewFile={onPreviewFile} running={running} />
              )}
            </TabsContent>

            <TabsContent value="workspace" className="mt-0 px-4 py-4">
              {deltaCount === 0 ? (
                <CleanWorkspace />
              ) : (
                <WorkspaceDiffView delta={delta} current={session?.workspace ?? {}} onPreviewFile={onPreviewFile} />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ─────────────────────────────── ledger ─────────────────────────────────── */

function fmtDur(ms?: number): string | null {
  if (typeof ms !== "number") return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

type LedgerFilter = "all" | "prompts" | "replies" | "tools" | "files";

const LEDGER_FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "all" },
  { id: "prompts", label: "prompts" },
  { id: "replies", label: "replies" },
  { id: "tools", label: "tools" },
  { id: "files", label: "files" },
];

function entryMatchesFilter(e: TimelineEntry, f: LedgerFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "prompts":
      return e.kind === "user";
    case "replies":
      return e.kind === "assistant";
    case "tools":
      return e.kind === "tool" || e.kind === "plan" || e.kind === "todo";
    case "files":
      return (e.files?.length ?? 0) > 0;
  }
}

/**
 * Summary strip + filter chips + search + ledger — all client-side over the
 * derived timeline.
 */
function LedgerBrowser({
  session,
  onPreviewFile,
  running,
}: {
  session: Session;
  onPreviewFile: (path: string) => void;
  running: boolean;
}) {
  const entries = React.useMemo(() => buildTimeline(session), [session]);
  const [filter, setFilter] = React.useState<LedgerFilter>("all");
  const [query, setQuery] = React.useState("");

  const counts = React.useMemo(() => {
    const c: Record<LedgerFilter, number> = {
      all: entries.length,
      prompts: 0,
      replies: 0,
      tools: 0,
      files: 0,
    };
    for (const e of entries) {
      if (e.kind === "user") c.prompts++;
      else if (e.kind === "assistant") c.replies++;
      else if (e.kind === "tool" || e.kind === "plan" || e.kind === "todo") c.tools++;
      if ((e.files?.length ?? 0) > 0) c.files++;
    }
    return c;
  }, [entries]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (!entryMatchesFilter(e, filter)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.detail ?? "").toLowerCase().includes(q) ||
        (e.toolName ?? "").toLowerCase().includes(q) ||
        (e.files ?? []).some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [entries, filter, query]);

  return (
    <>
      <LedgerSummaryStrip session={session} entries={entries} />
      <div
        className="mb-2 flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Filter ledger entries"
      >
        {LEDGER_FILTERS.map((f) => {
          const selected = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                selected
                  ? "border-[#4D6BFE]/60 bg-[#4D6BFE]/15 text-[#9dabff]"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {f.label}
              <span className={cn("ml-1", selected ? "text-[#4D6BFE]" : "text-muted-foreground/60")}>
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="grep the ledger… (title, tool, path)"
          aria-label="Search ledger entries"
          className="h-7 border-border/60 bg-muted/20 pl-7 pr-7 font-mono text-[11px] placeholder:text-muted-foreground/50 focus-visible:ring-1"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear ledger search"
            onClick={() => setQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="py-10 text-center font-mono text-xs text-muted-foreground">
          {entries.length === 0
            ? "no entries yet."
            : query
              ? `no matches for “${query}” under “${filter}”.`
              : `no entries match “${filter}”.`}
        </p>
      ) : (
        <LedgerView
          entries={filtered}
          session={session}
          onPreviewFile={onPreviewFile}
          running={running}
        />
      )}
    </>
  );
}

/** git-log diffstat vibes: one quiet strip of what this session's ledger holds. */
function LedgerSummaryStrip({
  session,
  entries,
}: {
  session: Session;
  entries: TimelineEntry[];
}) {
  const toolCalls = entries.filter((e) => e.kind === "tool").length;
  const files = new Set<string>();
  for (const e of entries) for (const f of e.files ?? []) files.add(f);
  const tokens = (session.stats?.promptTokens ?? 0) + (session.stats?.completionTokens ?? 0);

  const stats = [
    { label: "entries", value: String(entries.length), glyph: "≡" },
    { label: "tool calls", value: String(toolCalls), glyph: "⚙" },
    { label: "files", value: String(files.size), glyph: "◇" },
    { label: "tokens", value: tokens > 0 ? fmtK(tokens) : "—", glyph: "⚡" },
  ];

  return (
    <div
      className="mb-3 grid grid-cols-4 gap-1.5"
      aria-label="Ledger summary"
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-center transition-colors hover:border-border hover:bg-muted/40"
        >
          <p className="font-mono text-[13px] font-semibold leading-tight">
            <span className="mr-1 text-[10px] text-muted-foreground/70" aria-hidden>
              {s.glyph}
            </span>
            {s.value}
          </p>
          <p className="font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground/80">
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/** Calendar-day label for git-log style separators. */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function LedgerView({
  entries,
  session,
  onPreviewFile,
  running,
}: {
  entries: TimelineEntry[];
  session: Session;
  onPreviewFile: (path: string) => void;
  running: boolean;
}) {
  // newest commit first, like `git log`, with day separators between groups
  const ordered = [...entries].reverse();

  /** entries the conversation can truncate after (must drop ≥1 message) */
  const truncatable = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const plan = planConversationTruncate(session, e.id);
      if (plan && plan.droppedCount > 0) set.add(e.id);
    }
    return set;
  }, [entries, session]);

  return (
    <>
      <ol className="relative space-y-1" aria-label="Session activity ledger">
        {/* rail */}
        <span
          aria-hidden
          className="absolute bottom-3 left-[13px] top-3 w-px bg-gradient-to-b from-border via-border to-transparent"
        />
        {ordered.map((e, i) => {
          const prev = i > 0 ? ordered[i - 1] : undefined;
          const newDay = !prev || dayLabel(prev.ts) !== dayLabel(e.ts);
          // stagger caps at 12 rows so long ledgers don't feel sluggish
          const delay = Math.min(i, 12) * 24;
          return (
            <React.Fragment key={e.id}>
              {newDay && (
                <li className="relative z-10 flex items-center gap-2 py-1.5" aria-hidden>
                  <span className="flex size-[27px] shrink-0 items-center justify-center">
                    <GitCommitHorizontal className="size-3.5 text-muted-foreground/40" />
                  </span>
                  <span className="rounded border border-dashed border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {dayLabel(e.ts)}
                  </span>
                  <span className="h-px min-w-4 flex-1 bg-border/40" />
                </li>
              )}
              <LedgerRow
                entry={e}
                session={session}
                onPreviewFile={onPreviewFile}
                running={running}
                staggerDelay={delay}
                isHead={i === 0}
                truncatable={truncatable.has(e.id)}
              />
            </React.Fragment>
          );
        })}
      </ol>
      <ShortlogFooter entries={ordered} />
    </>
  );
}

/** `git shortlog` vibes — quiet one-line summary under the ledger rail. */
function ShortlogFooter({ entries }: { entries: TimelineEntry[] }) {
  const prompts = entries.filter((e) => e.kind === "user").length;
  const replies = entries.filter((e) => e.kind === "assistant").length;
  const calls = entries.filter((e) => e.kind === "tool").length;
  const newest = entries[0];
  if (entries.length === 0) return null;
  return (
    <div
      className="mt-3 flex items-center justify-between gap-2 border-t border-dashed pt-2 font-mono text-[9.5px] text-muted-foreground/60"
      aria-hidden
    >
      <span>
        {prompts} prompt{prompts === 1 ? "" : "s"} · {replies} repl{replies === 1 ? "y" : "ies"} ·{" "}
        {calls} tool call{calls === 1 ? "" : "s"}
      </span>
      <span className="flex items-center gap-1">
        <span className="text-sky-400/80">you</span>·<span className="text-[#7c8dfd]/90">dsh</span>
        {newest && (
          <span className="ml-1 opacity-70">@ {hhmm(newest.ts)}</span>
        )}
      </span>
    </div>
  );
}

function LedgerRow({
  entry: e,
  session,
  onPreviewFile,
  running,
  staggerDelay = 0,
  isHead = false,
  truncatable = false,
}: {
  entry: TimelineEntry;
  session: Session;
  onPreviewFile: (path: string) => void;
  running: boolean;
  staggerDelay?: number;
  isHead?: boolean;
  truncatable?: boolean;
}) {
  const meta = e.toolName ? getToolMeta(e.toolName) : null;
  const dur = fmtDur(e.durationMs);
  const clickable = Boolean(e.files?.length);

  const node = (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex size-[27px] shrink-0 items-center justify-center rounded-full border bg-background",
        e.kind === "user" && "border-sky-500/50 bg-sky-500/10",
        e.kind === "assistant" && "border-primary/50",
        e.ok === true && "border-emerald-500/40 bg-emerald-500/10",
        e.ok === false && "border-red-500/50 bg-red-500/10",
        (e.kind === "plan" || e.kind === "todo") && "border-teal-500/50 bg-teal-500/10",
        !e.ok && e.toolName === undefined && e.kind === "tool" && "opacity-60",
      )}
    >
      <NodeGlyph entry={e} running={running} />
    </span>
  );

  const body = (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Inspect ${e.files![0]} (${e.toolName})` : undefined}
      onKeyDown={
        clickable
          ? (ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onPreviewFile(e.files![0]);
              }
            }
          : undefined
      }
      onClick={clickable ? () => onPreviewFile(e.files![0]) : undefined}
      className={cn(
        "ml-2 min-w-0 flex-1 rounded-md border border-transparent px-2.5 py-1.5 transition-colors",
        clickable &&
          "cursor-pointer hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-baseline gap-2">
        <button
          type="button"
          aria-label={`Copy commit sha ${e.sha}`}
          onClick={(ev) => {
            ev.stopPropagation();
            void navigator.clipboard?.writeText(e.sha).then(
              () => toast.success(`Copied ${e.sha}`, { description: "commit sha → clipboard" }),
              () => toast.error("Clipboard unavailable"),
            );
          }}
          title="Copy sha"
          className="shrink-0 rounded-sm font-mono text-[10px] tracking-tight text-violet-400/80 underline-offset-2 transition-colors hover:text-violet-300 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {e.sha}
        </button>
        {isHead && (
          <span
            aria-label="Current tip of this conversation"
            title="latest commit — HEAD of this conversation"
            className="hidden shrink-0 rounded-sm bg-amber-500/15 px-1 py-px font-mono text-[8.5px] font-bold uppercase tracking-wider text-amber-400 sm:inline-block"
          >
            head
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs leading-relaxed">
          {meta && (
            <span className={cn("mr-1 font-semibold", meta.tint)}>{meta.label}</span>
          )}
          {e.kind === "user" && <span className="mr-1 font-semibold text-sky-400">you</span>}
          {e.kind === "assistant" && (
            <span className="mr-1 font-semibold text-[#7c8dfd]">dsh</span>
          )}
          {e.title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pt-0.5">
          {truncatable && !running && (
            <ContinueFromHereButton entry={e} session={session} />
          )}
          {e.kind === "tool" && e.ok === true && RESTORE_TOOLS.has(e.toolName ?? "") && (
            <RestorePointButton entry={e} session={session} />
          )}
          {dur && (
            <span className="rounded bg-muted/70 px-1 font-mono text-[9px] text-muted-foreground">
              {dur}
            </span>
          )}
          <time className="font-mono text-[9px] text-muted-foreground/70" dateTime={new Date(e.ts).toISOString()}>
            {hhmm(e.ts)}
          </time>
        </span>
      </div>
      {(e.detail || (e.files?.length ?? 0) > 0) && (
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
          {e.files?.length ? (
            <>
              <span className={cn("mr-1", meta?.tint ?? "")}>◇</span>
              {e.files.join(" · ")}
              {e.detail && <span className="mx-1 opacity-50">|</span>}
            </>
          ) : null}
          {e.detail && <span className="opacity-70">{e.detail}</span>}
        </p>
      )}
    </div>
  );

  return (
    <li
      className="group dsh-commit-in flex items-start gap-1"
      style={staggerDelay > 0 ? { animationDelay: `${staggerDelay}ms` } : undefined}
    >
      {node}
      {body}
    </li>
  );
}

/* ───────────────────── continue-from-here (chat rewind) ─────────────────── */

/**
 * Hover action on any replayable entry: trim everything AFTER this commit from
 * the conversation, so the user can re-run a divergent branch from here.
 * Workspace files are NOT touched — that's RestorePointButton's job.
 */
function ContinueFromHereButton({
  entry: e,
  session,
}: {
  entry: TimelineEntry;
  session: Session;
}) {
  const [open, setOpen] = React.useState(false);

  const plan = React.useMemo(
    () => (open ? planConversationTruncate(session, e.id) : null),
    [open, session, e.id],
  );

  const confirmTruncate = () => {
    if (!plan || plan.droppedCount === 0) {
      setOpen(false);
      return;
    }
    useDshStore.getState().truncateSessionFrom(session.id, plan.messages);
    toast.success(`Continuing from ${e.sha}`, {
      description: `${plan.droppedCount} message${plan.droppedCount === 1 ? "" : "s"} trimmed · workspace untouched.`,
    });
    setOpen(false);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Trim conversation after ${e.sha}`}
            onClick={(ev) => {
              ev.stopPropagation();
              setOpen(true);
            }}
            className="rounded-sm p-0.5 text-muted-foreground/0 transition-all hover:!text-violet-400 focus-visible:text-violet-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:text-muted-foreground/70"
          >
            <Scissors className="size-3" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Continue conversation from here</TooltipContent>
      </Tooltip>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              continue from <span className="text-violet-400">{e.sha}</span>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Keeps everything up to and including “{truncateTitle(e.title)}” ({hhmm(e.ts)}) and
              discards every newer commit when the chat resumes.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {plan && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="text-emerald-400">keep {plan.keptCount}</span>
                <span className="text-red-400">drop {plan.droppedCount}</span>
              </div>
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                The next message you send continues this branch. Files in the workspace are not
                rewound — pair this with the amber rewind action if you also want the tree back.
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmTruncate}
              className="bg-violet-600 text-white hover:bg-violet-600/90"
            >
              <Scissors className="mr-1.5 size-3.5" aria-hidden /> Trim &amp; continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** dialog titles stay one line — clip long prompts politely */
function truncateTitle(t: string): string {
  return t.length > 42 ? `${t.slice(0, 39)}…` : t;
}

/* ─────────────────────────── time-travel restore ────────────────────────── */

const RESTORE_TOOLS = new Set(["write_file", "edit_file", "bash"]);

function RestorePointButton({ entry: e, session }: { entry: TimelineEntry; session: Session }) {
  const [open, setOpen] = React.useState(false);

  const reconstruction = React.useMemo(
    () => (open ? reconstructWorkspaceAt(session, e.id) : null),
    [open, session, e.id],
  );

  const changes = React.useMemo(
    () => (reconstruction ? workspaceChangeSets(session.workspace, reconstruction.workspace) : null),
    [reconstruction, session.workspace],
  );

  const totalChanges = changes
    ? changes.added.length + changes.removed.length + changes.modified.length
    : 0;

  const confirmRestore = () => {
    if (!reconstruction) {
      toast.error("Cannot rewind", { description: "This entry can't be replayed." });
      setOpen(false);
      return;
    }
    useDshStore.getState().replaceWorkspace(session.id, reconstruction.workspace);
    toast.success(`Workspace rewound to ${e.sha}`, {
      description: `${reconstruction.opsApplied} write/edit op${reconstruction.opsApplied === 1 ? "" : "s"} replayed · ${totalChanges} file${totalChanges === 1 ? "" : "s"} changed.`,
    });
    setOpen(false);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Restore workspace to commit ${e.sha}`}
            onClick={(ev) => {
              ev.stopPropagation();
              setOpen(true);
            }}
            className="rounded-sm p-0.5 text-muted-foreground/0 transition-all hover:!text-amber-400 focus-visible:text-amber-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:text-muted-foreground/70"
          >
            <RotateCcw className="size-3" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Rewind workspace to this commit</TooltipContent>
      </Tooltip>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              rewind workspace to <span className="text-violet-400">{e.sha}</span>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Replays every successful write/edit from the seed tree up to and including this
              entry ({e.toolName} at {hhmm(e.ts)}), then replaces the current workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {changes && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
              {totalChanges === 0 ? (
                <p className="font-mono text-muted-foreground">
                  no drift — the replayed state matches the current workspace.
                </p>
              ) : (
                <>
                  {changes.modified.length > 0 && (
                    <ChangeList
                      tone="mod"
                      label={`~${changes.modified.length} modified`}
                      paths={changes.modified}
                    />
                  )}
                  {changes.added.length > 0 && (
                    <ChangeList
                      tone="add"
                      label={`+${changes.added.length} removed from current`}
                      paths={changes.added}
                    />
                  )}
                  {changes.removed.length > 0 && (
                    <ChangeList
                      tone="del"
                      label={`−${changes.removed.length} missing after rewind`}
                      paths={changes.removed}
                    />
                  )}
                </>
              )}
              {reconstruction?.approximate && (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                  This history includes bash redirect writes the replay can't reproduce — the
                  rewound state may differ from the exact historical moment.
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              className="bg-amber-600 text-white hover:bg-amber-600/90"
            >
              <RotateCcw className="mr-1.5 size-3.5" aria-hidden /> Rewind
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChangeList({
  tone,
  label,
  paths,
}: {
  tone: "add" | "mod" | "del";
  label: string;
  paths: string[];
}) {
  const toneCls =
    tone === "add"
      ? "text-emerald-400"
      : tone === "mod"
        ? "text-amber-400"
        : "text-red-400";
  return (
    <div>
      <p className={cn("font-mono text-[10px] font-semibold uppercase tracking-wide", toneCls)}>
        {label}
      </p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
        {paths.slice(0, 4).join(" · ")}
        {paths.length > 4 ? ` · +${paths.length - 4} more` : ""}
      </p>
    </div>
  );
}

function NodeGlyph({ entry: e, running }: { entry: TimelineEntry; running: boolean }) {
  if (e.kind === "user")
    return <span className="font-mono text-[11px] font-bold text-sky-400">❯</span>;
  if (e.kind === "assistant")
    return <span className="font-mono text-[12px] text-[#4D6BFE]">✦</span>;
  if (e.kind === "plan")
    return <ClipboardCheck className="size-3 text-teal-400" aria-hidden />;
  if (e.kind === "todo")
    return <GitCommitHorizontal className="size-3.5 text-teal-400" aria-hidden />;
  if (e.ok === undefined && running)
    return <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />;
  if (e.ok === true)
    return <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />;
  if (e.ok === false) return <XCircle className="size-3.5 text-red-400" aria-hidden />;
  if (e.toolName) {
    const tm = getToolMeta(e.toolName);
    return <tm.icon className={cn("size-3.5", tm.tint)} aria-hidden />;
  }
  return <span className="size-1.5 rounded-full bg-muted-foreground/50" />;
}

function hhmm(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EmptyLedger() {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-border">
        <History className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-sm font-medium">No activity yet</p>
      <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">
        Run a task — every prompt, response and tool call lands here as a commit-style entry.
      </p>
    </div>
  );
}

function CleanWorkspace() {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
      </span>
      <p className="text-sm font-medium">Workspace is clean</p>
      <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">
        No drift from the seed tree — agent writes and imports will show up as diffs here.
      </p>
    </div>
  );
}

/* ─────────────────────────── workspace diff tab ─────────────────────────── */

function DeltaChip({ n, tone }: { n: number; tone: "add" | "mod" | "del" }) {
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
        tone === "add" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
        tone === "mod" && "border-amber-500/40 bg-amber-500/10 text-amber-400",
        tone === "del" && "border-red-500/40 bg-red-500/10 text-red-400",
      )}
    >
      {tone === "add" ? `+${n}` : tone === "mod" ? `~${n}` : `−${n}`}
    </span>
  );
}

function WorkspaceDiffView({
  delta,
  current,
  onPreviewFile,
}: {
  delta: ReturnType<typeof workspaceDelta>;
  current: Record<string, string>;
  onPreviewFile: (path: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          vs seed tree:
        </span>
        {delta.added.length > 0 && <DeltaChip n={delta.added.length} tone="add" />}
        {delta.modified.length > 0 && <DeltaChip n={delta.modified.length} tone="mod" />}
        {delta.removed.length > 0 && <DeltaChip n={delta.removed.length} tone="del" />}
      </div>

      {delta.added.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
            <FilePlus2 className="size-3.5" aria-hidden /> added
          </h3>
          <ul className="space-y-0.5">
            {delta.added.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onPreviewFile(p)}
                  aria-label={`Preview ${p}`}
                  className="group/add flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left font-mono text-xs transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <FilePlus2 className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {current[p]?.split("\n").length ?? 0} ln
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {delta.modified.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            <FilePenLine className="size-3.5" aria-hidden /> modified
          </h3>
          <div className="space-y-1">
            {delta.modified.map((p) => (
              <ModifiedFileDiff
                key={p}
                path={p}
                oldStr={seedOf(p)}
                newStr={current[p] ?? ""}
                onPreviewFile={onPreviewFile}
              />
            ))}
          </div>
        </section>
      )}

      {delta.removed.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-red-400">
            <FileMinus2 className="size-3.5" aria-hidden /> removed
          </h3>
          <ul className="space-y-0.5">
            {delta.removed.map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-xs text-muted-foreground"
              >
                <FileMinus2 className="size-3.5 shrink-0 text-red-400/80" aria-hidden />
                <span className="min-w-0 flex-1 truncate line-through decoration-red-400/50">{p}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** seed lookup straight from the module singleton */
function seedOf(path: string): string {
  return Object.prototype.hasOwnProperty.call(SEED_WORKSPACE, path) ? SEED_WORKSPACE[path] : "";
}

function ModifiedFileDiff({
  path,
  oldStr,
  newStr,
  onPreviewFile,
}: {
  path: string;
  oldStr: string;
  newStr: string;
  onPreviewFile: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ld = React.useMemo(() => lineDelta(oldStr, newStr), [oldStr, newStr]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-md border transition-colors hover:border-amber-500/30"
    >
      <div className="flex items-stretch">
        <CollapsibleTrigger
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`${open ? "Hide" : "Show"} diff for ${path}`}
        >
          <Chevronish open={open} />
          <FilePenLine className="size-3.5 shrink-0 text-amber-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
          <span className="shrink-0 font-mono text-[10px]">
            <span className="text-red-400">−{ld.del}</span>{" "}
            <span className="text-emerald-400">+{ld.add}</span>
          </span>
        </CollapsibleTrigger>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onPreviewFile(path)}
              aria-label={`Preview ${path}`}
              className="shrink-0 border-l px-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none"
            >
              ↗
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Open full file</TooltipContent>
        </Tooltip>
      </div>
      <CollapsibleContent>
        <div className="border-t p-2">
          <DiffView oldStr={clampDiffInput(oldStr)} newStr={clampDiffInput(newStr)} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Chevronish({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn(
        "size-3 shrink-0 text-muted-foreground transition-transform duration-150",
        open && "rotate-90",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
