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
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { useDshStore } from "@/lib/dsh/store";
import { SEED_WORKSPACE } from "@/lib/dsh/workspace-seed";
import {
  buildTimeline,
  clampDiffInput,
  lineDelta,
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
                <LedgerView
                  entries={buildTimeline(session!)}
                  onPreviewFile={onPreviewFile}
                  running={running}
                />
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

function LedgerView({
  entries,
  onPreviewFile,
  running,
}: {
  entries: TimelineEntry[];
  onPreviewFile: (path: string) => void;
  running: boolean;
}) {
  // newest commit first, like `git log`
  const ordered = [...entries].reverse();
  return (
    <ol className="relative space-y-1" aria-label="Session activity ledger">
      {/* rail */}
      <span
        aria-hidden
        className="absolute bottom-3 left-[13px] top-3 w-px bg-gradient-to-b from-border via-border to-transparent"
      />
      {ordered.map((e) => (
        <LedgerRow key={e.id} entry={e} onPreviewFile={onPreviewFile} running={running} />
      ))}
    </ol>
  );
}

function LedgerRow({
  entry: e,
  onPreviewFile,
  running,
}: {
  entry: TimelineEntry;
  onPreviewFile: (path: string) => void;
  running: boolean;
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
      className={cn(
        "ml-2 min-w-0 flex-1 rounded-md border border-transparent px-2.5 py-1.5 transition-colors",
        clickable && "cursor-pointer hover:border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[10px] tracking-tight text-violet-400/80 group-hover:text-violet-300">
          {e.sha}
        </span>
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

  const rowInner = (
    <>
      {node}
      {body}
    </>
  );

  return (
    <li className="group flex items-start gap-1">
      {clickable ? (
        <button
          type="button"
          onClick={() => onPreviewFile(e.files![0])}
          aria-label={`Inspect ${e.files![0]} (${e.toolName})`}
          className="flex w-full items-start rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {rowInner}
        </button>
      ) : (
        rowInner
      )}
    </li>
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
