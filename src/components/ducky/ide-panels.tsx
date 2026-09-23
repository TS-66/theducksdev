"use client";

import * as React from "react";
import {
  Crosshair,
  Files,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  GitBranch,
  Globe,
  Puzzle,
  Search,
  Settings,
  FileCode2,
  X,
  ListTodo,
  Cpu,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDuckyStore } from "@/lib/ducky/store";
import { PLUGINS } from "@/lib/ducky/plugins";
import { modelDisplayName } from "@/lib/ducky/models";
import {
  getAiPointer,
  getAiPointerRev,
  subscribeAiPointer,
} from "@/lib/ducky/pc";
import { fmtK, shortId } from "./format";

/* ─────────────────────────── activity rail ─────────────────────────── */

export type RailView = "explorer" | "search" | "source" | "plugins";

export function IdeActivityRail({
  leftOpen,
  onToggleLeft,
  onRail,
  onOpenPlugins,
  onOpenSettings,
  onOpenPalette,
  onOpenActivity,
}: {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onRail: (v: RailView) => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  onOpenActivity: () => void;
}) {
  const btn =
    "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  return (
    <div className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r bg-muted/20 py-2 md:flex">
      <button type="button" aria-label="Toggle sidebar" onClick={onToggleLeft} className={cn(btn, leftOpen && "bg-accent text-foreground")}>
        <PanelLeft className="size-4" />
      </button>
      <div className="my-1 h-px w-6 bg-border" />
      <button type="button" aria-label="Explorer — files and sessions" title="Explorer" onClick={() => { onToggleLeft(); onRail("explorer"); }} className={btn}>
        <Files className="size-4" />
      </button>
      <button type="button" aria-label="Search sessions and commands" title="Search (⌘P)" onClick={onOpenPalette} className={btn}>
        <Search className="size-4" />
      </button>
      <button type="button" aria-label="Source — activity timeline" title="Source / timeline (⌘E)" onClick={onOpenActivity} className={btn}>
        <GitBranch className="size-4 rotate-90" />
      </button>
      <button type="button" aria-label="Extensions — plugins" title="Plugins" onClick={onOpenPlugins} className={btn}>
        <Puzzle className="size-4" />
      </button>
      <div className="mt-auto flex flex-col items-center gap-1">
        <button type="button" aria-label="Chat sessions" title="Sessions" onClick={() => { onRail("search"); }} className={btn}>
          <MessagesSquare className="size-4" />
        </button>
        <button type="button" aria-label="Settings" title="Settings" onClick={onOpenSettings} className={btn}>
          <Settings className="size-4" />
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── tab bar ───────────────────────────── */

export type CenterTab = "chat" | "file" | "browser";

export function IdeTabBar({
  tab,
  onTab,
  fileName,
  onCloseFile,
  sessionTitle,
  projectName,
  messageCount,
  browserCount,
  rightOpen,
  onToggleRight,
}: {
  tab: CenterTab;
  onTab: (t: CenterTab) => void;
  fileName: string | null;
  onCloseFile: () => void;
  sessionTitle: string;
  projectName?: string | null;
  messageCount: number;
  browserCount: number;
  rightOpen: boolean;
  onToggleRight: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-muted/20 px-2">
      <div role="tablist" aria-label="Editor tabs" className="flex min-w-0 items-center gap-1">
        <button
          role="tab"
          aria-selected={tab === "chat"}
          onClick={() => onTab("chat")}
          className={cn(
            "flex h-8 items-center gap-2 rounded-lg px-3 font-mono text-xs transition-all",
            tab === "chat"
              ? "bg-white/[0.07] text-foreground shadow-sm ring-1 ring-white/10"
              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
          )}
        >
          <MessagesSquare className="size-3.5" />
          <span className="max-w-40 truncate">{sessionTitle || "Chat"}</span>
          {messageCount > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              {messageCount}
            </span>
          )}
        </button>
        {browserCount > 0 && (
          <button
            role="tab"
            aria-selected={tab === "browser"}
            onClick={() => onTab("browser")}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-3 font-mono text-xs transition-all",
              tab === "browser"
                ? "bg-white/[0.07] text-foreground shadow-sm ring-1 ring-white/10"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            <Globe className="size-3.5 text-cyan-400" />
            <span>Browser</span>
            <span className="rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              {browserCount}
            </span>
          </button>
        )}
        {fileName && (
          <button
            role="tab"
            aria-selected={tab === "file"}
            onClick={() => onTab("file")}
            className={cn(
              "group flex h-8 items-center gap-2 rounded-lg px-3 font-mono text-xs transition-all",
              tab === "file"
                ? "bg-white/[0.07] text-foreground shadow-sm ring-1 ring-white/10"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            )}
          >
            <FileCode2 className="size-3.5 text-[#FDC00A]" />
            <span className="max-w-48 truncate">{fileName.split("/").pop()}</span>
            <span
              role="button"
              aria-label="Close file tab"
              onClick={(e) => { e.stopPropagation(); onCloseFile(); }}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            >
              <X className="size-3" />
            </span>
          </button>
        )}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground/70 lg:block">
          {projectName ? `${projectName} / ` : ""}{sessionTitle || "untitled"}
        </span>
        <button
          type="button"
          aria-label="Toggle inspector"
          onClick={onToggleRight}
          className={cn(
            "hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground xl:flex",
            rightOpen && "bg-accent text-foreground"
          )}
        >
          <PanelRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Live readout of where the AI last acted on the real screen. */
function AiPointerReadout() {
  const rev = React.useSyncExternalStore(subscribeAiPointer, getAiPointerRev, getAiPointerRev);
  const pointer = React.useMemo(() => getAiPointer(), [rev]);
  if (!pointer) {
    return (
      <p className="text-xs text-muted-foreground">
        No PC actions yet. When the agent moves, clicks or announces on your
        real screen, the coordinates land here — and a marker wiggles on the
        screen itself.
      </p>
    );
  }
  const ago = Math.max(0, Math.round((Date.now() - pointer.at) / 1000));
  return (
    <div className="space-y-1.5 rounded-lg border border-[#FDC00A]/25 bg-[#FDC00A]/[0.06] p-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="ducky-pulse-dot inline-block size-2 rounded-full bg-[#FDC00A]" />
        <span className="font-mono text-xs font-semibold capitalize">{pointer.action}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {ago < 5 ? "just now" : `${ago}s ago`}
        </span>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        x {pointer.x} · y {pointer.y}
      </p>
    </div>
  );
}

/* ──────────────────────────── inspector ──────────────────────────── */

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <span className={cn("transition-transform", !open && "-rotate-90")}>▾</span>
        {icon}
        {title}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export function IdeInspector({
  onOpenPlugins,
  onOpenActivity,
  onPreviewFile,
}: {
  onOpenPlugins: () => void;
  onOpenActivity: () => void;
  onPreviewFile: (p: string) => void;
}) {
  const session = useDuckyStore((s) => s.sessions.find((x) => x.id === s.activeSessionId) ?? null);
  const settings = useDuckyStore((s) => s.settings);
  const disabledPlugins = useDuckyStore((s) => s.disabledPlugins);
  const isRunning = useDuckyStore((s) => s.isRunning);

  const files = React.useMemo(() => (session ? Object.keys(session.workspace).sort() : []), [session]);
  const todos = session?.todos ?? [];
  const done = todos.filter((t) => t.status === "completed").length;
  const enabledCount = PLUGINS.length - disabledPlugins.length;
  const totalTokens = (session?.stats.promptTokens ?? 0) + (session?.stats.completionTokens ?? 0);

  return (
    <div className="custom-scrollbar h-full overflow-y-auto">
      <Section title="Session" icon={<Zap className="size-3" />}>
        <div className="space-y-1.5 rounded-lg border bg-card/60 p-2.5">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", isRunning ? "ducky-pulse-dot bg-amber-400" : "bg-emerald-400")} />
            <span className="font-mono text-xs font-semibold">{isRunning ? "Running…" : "Ready"}</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">#{shortId(session?.id ?? null)}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{session?.title ?? "No active session"}</p>
          <div className="grid grid-cols-3 gap-1.5 pt-1 font-mono text-[10px]">
            <div className="rounded bg-muted/60 px-1.5 py-1 text-center">
              <div className="font-semibold text-foreground">{session?.stats.toolCalls ?? 0}</div>
              <div className="text-muted-foreground">tools</div>
            </div>
            <div className="rounded bg-muted/60 px-1.5 py-1 text-center">
              <div className="font-semibold text-foreground">{fmtK(totalTokens)}</div>
              <div className="text-muted-foreground">tokens</div>
            </div>
            <div className="rounded bg-muted/60 px-1.5 py-1 text-center">
              <div className="font-semibold text-foreground">{files.length}</div>
              <div className="text-muted-foreground">files</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pt-1 font-mono text-[10px] text-muted-foreground">
            <Cpu className="size-3 text-[#FDC00A]" />
            <span className="truncate">{modelDisplayName(settings.model)}</span>
            <span className="ml-auto rounded border px-1 uppercase">{settings.policy}</span>
          </div>
        </div>
      </Section>

      <Section title={`Checklist ${todos.length ? `${done}/${todos.length}` : ""}`} icon={<ListTodo className="size-3" />}>
        {todos.length === 0 ? (
          <p className="text-xs text-muted-foreground">No todos yet — ask Ducky to plan with <code className="font-mono">todo_write</code>.</p>
        ) : (
          <ul className="space-y-1">
            {todos.slice(0, 8).map((t, i) => (
              <li key={i} className="flex items-start gap-1.5 rounded bg-muted/40 px-1.5 py-1 text-xs">
                <span className={cn(
                  "mt-0.5 size-2 shrink-0 rounded-full",
                  t.status === "completed" ? "bg-emerald-400" : t.status === "in_progress" ? "ducky-pulse-dot bg-amber-400" : t.status === "cancelled" ? "bg-muted-foreground/40" : "bg-muted-foreground/30"
                )} />
                <span className={cn("min-w-0 break-words", t.status === "completed" && "line-through text-muted-foreground")}>{t.content}</span>
              </li>
            ))}
            {todos.length > 8 && <li className="font-mono text-[10px] text-muted-foreground">+{todos.length - 8} more in chat</li>}
          </ul>
        )}
      </Section>

      <Section title={`Files ${files.length ? `· ${files.length}` : ""}`} icon={<FileCode2 className="size-3" />}>
        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground">Empty workspace — scaffold with <code className="font-mono">write_file</code> or import a project.</p>
        ) : (
          <ul className="space-y-px">
            {files.slice(0, 14).map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => onPreviewFile(f)}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <FileCode2 className="size-3 shrink-0" />
                  <span className="truncate">{f}</span>
                </button>
              </li>
            ))}
            {files.length > 14 && <li className="px-1.5 py-1 font-mono text-[10px] text-muted-foreground">+{files.length - 14} more — see Explorer</li>}
          </ul>
        )}
      </Section>

      <Section title={`Plugins ${enabledCount}/${PLUGINS.length}`} icon={<Puzzle className="size-3" />} defaultOpen={false}>
        <ul className="space-y-1">
          {PLUGINS.map((p) => {
            const off = disabledPlugins.includes(p.id);
            return (
              <li key={p.id} className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className={cn("size-1.5 rounded-full", off ? "bg-muted-foreground/30" : "bg-emerald-400")} />
                <span className={cn("truncate", off && "text-muted-foreground line-through")}>{p.name.replace("@ducky-ai/", "")}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{p.tools.length}</span>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={onOpenPlugins} className="mt-2 w-full rounded-md border px-2 py-1 font-mono text-[11px] hover:bg-accent">
          Manage plugins
        </button>
      </Section>

      <Section title="AI pointer" icon={<Crosshair className="size-3" />} defaultOpen={false}>
        <AiPointerReadout />
      </Section>

      <Section title="Activity" icon={<GitBranch className="size-3 rotate-90" />} defaultOpen={false}>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Every prompt, tool call and file change is logged like a git history.
        </p>
        <button type="button" onClick={onOpenActivity} className="mt-2 w-full rounded-md border px-2 py-1 font-mono text-[11px] hover:bg-accent">
          Open timeline (⌘E)
        </button>
      </Section>
    </div>
  );
}

/* ───────────────────────── inline file preview ───────────────────────── */

export function IdeFilePreview({
  path,
  content,
  onBack,
}: {
  path: string;
  content: string;
  onBack: () => void;
}) {
  const lines = React.useMemo(() => content.split("\n"), [content]);
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
        <FileCode2 className="size-3.5 text-[#FDC00A]" />
        <span className="truncate font-mono text-xs">{path}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{lines.length} lines · {(content.length / 1024).toFixed(1)} KB</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={copy} className="rounded-md border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">
            {copied ? "copied" : "copy"}
          </button>
          <button type="button" onClick={onBack} className="rounded-md border px-2 py-1 font-mono text-[11px] hover:bg-accent">
            ← chat
          </button>
        </div>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-auto bg-background">
        <pre className="p-4 font-mono text-xs leading-relaxed">
          <code className="grid grid-cols-[auto_1fr] gap-x-3">
            {lines.map((line, i) => (
              <React.Fragment key={i}>
                <span aria-hidden className="select-none border-r pr-3 text-right text-muted-foreground/40">{i + 1}</span>
                <span className="whitespace-pre-wrap break-words text-foreground/90">{line || " "}</span>
              </React.Fragment>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
