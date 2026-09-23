"use client";

/**
 * Ducky AI | Coder — ⌘P command palette.
 *
 * One cmdk surface over the three worlds the console operates in:
 *   1. slash commands (re-exported from SLASH_COMMANDS — single source of truth)
 *   2. session switching (starred first, then most recent)
 *   3. workspace file deep-links (image-aware icons)
 * Terminal aesthetic: mono text, uppercase group headers, kbd hints.
 */

import * as React from "react";
import {
  Activity,
  File,
  FileCode,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Star,
  Terminal,
  Wrench,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDuckyStore } from "@/lib/ducky/store";
import { buildToolDefinitions } from "@/lib/ducky/plugins";
import { SLASH_COMMANDS } from "./composer";

export function fileIconFor(path: string): React.ReactNode {
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) {
    return <ImageIcon className="size-4 shrink-0 text-pink-400" aria-hidden />;
  }
  if (/\.(ts|tsx|js|jsx|json|sh)$/i.test(path)) {
    return <FileCode className="size-4 shrink-0 text-violet-400" aria-hidden />;
  }
  if (/\.(md|txt)$/i.test(path) || !path.includes(".")) {
    return <FileText className="size-4 shrink-0 text-sky-400" aria-hidden />;
  }
  return <File className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** execute a slash command exactly like typing it into the composer */
  onRunCommand: (raw: string) => void;
  /** stage text (commands with <args>) into the composer input */
  onStageText: (text: string) => void;
  /** deep-link a workspace path into the preview dialog */
  onPreviewFile: (path: string) => void;
  /** toggle the activity ledger sheet */
  onToggleActivity: () => void;
}

const close = (fn: (open: boolean) => void) => () => fn(false);

export function CommandPalette({
  open,
  onOpenChange,
  onRunCommand,
  onStageText,
  onPreviewFile,
  onToggleActivity,
}: CommandPaletteProps) {
  const sessions = useDuckyStore((s) => s.sessions);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  /** commands carrying `<arg>` placeholders stage instead of executing */
  const runSlash = React.useCallback(
    (cmd: string, desc: string) => {
      onOpenChange(false);
      if (cmd.includes("<")) {
        onStageText(`${cmd.split(" ")[0]} `);
        toast.info("Command staged", {
          description: `${desc} — press Enter to run (add an argument).`,
        });
      } else {
        onRunCommand(cmd);
      }
    },
    [onOpenChange, onRunCommand, onStageText],
  );

  const recentSessions = React.useMemo(
    () =>
      [...sessions]
        .sort((a, b) =>
          a.starred !== b.starred
            ? a.starred
              ? -1
              : 1
            : b.updatedAt - a.updatedAt,
        )
        .slice(0, 10),
    [sessions],
  );

  const files = React.useMemo(
    () => Object.keys(activeSession?.workspace ?? {}).sort(),
    [activeSession],
  );

  /** agent tools (enabled plugins only) — discoverability for 50+ tools */
  const tools = React.useMemo(() => {
    const disabled = useDuckyStore.getState().disabledPlugins;
    return buildToolDefinitions()
      .filter((d) => !disabled.includes(d.pluginId))
      .map((d) => ({
        name: d.name,
        plugin: d.pluginId.replace("@ducky-ai/", ""),
        desc: d.description,
        required: (() => {
          try {
            const params = d.parameters as { required?: unknown };
            return Array.isArray(params.required) ? (params.required as string[]) : [];
          } catch {
            return [];
          }
        })(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [open]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ducky command palette"
      description="Jump to sessions, open workspace files or run slash commands."
      className="w-[min(620px,92vw)] max-w-none gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#131316] shadow-2xl shadow-black/60"
      showCloseButton={false}
    >
      <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-[#FF7A1A]/60 to-transparent" />
      <CommandInput
        placeholder="Type a command, session, file or tool…"
        className="py-4 font-mono text-[14px]"
        aria-label="Command palette search"
      />
      <CommandList className="custom-scrollbar max-h-[min(420px,56dvh)]">
        <CommandEmpty>
          <span className="font-mono text-xs text-muted-foreground">
            nothing matches — try “/”, a session title or a path
          </span>
        </CommandEmpty>

        {/* ── actions ──────────────────────────────────────────────────── */}
        <CommandGroup heading={<span className="font-mono text-[10px] uppercase tracking-widest">actions</span>}>
          <CommandItem
            value="new task create session ⌘K /new"
            onSelect={() => {
              onOpenChange(false);
              useDuckyStore.getState().newSession();
              toast.success("New task created");
            }}
          >
            <Plus className="size-4 shrink-0 text-emerald-400" aria-hidden />
            <span>New task</span>
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="activity timeline ledger commits ⌘E /activity"
            onSelect={() => {
              onOpenChange(false);
              onToggleActivity();
            }}
          >
            <Activity className="size-4 shrink-0 text-[#FF7A1A]" aria-hidden />
            <span>Toggle activity timeline</span>
            <CommandShortcut>⌘E</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* ── slash commands, grouped by section ─────────────────────────── */}
        {(
          ["session", "workspace", "mode", "model", "tune", "memory", "tools", "help"] as const
        ).map((group) => {
          const items = SLASH_COMMANDS.filter((c) => c.group === group);
          if (!items.length) return null;
          return (
            <CommandGroup
              key={group}
              heading={<span className="font-mono text-[10px] uppercase tracking-widest">{group}</span>}
            >
              {items.map((c) => (
                <CommandItem
                  key={c.cmd}
                  value={`${c.cmd} ${c.desc}`}
                  onSelect={() => runSlash(c.cmd, c.desc)}
                >
                  <Terminal className="size-4 shrink-0 text-violet-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
                    {c.cmd}
                    <span className="ml-2 hidden truncate font-sans text-xs font-normal text-muted-foreground sm:inline">
                      {c.desc}
                    </span>
                  </span>
                  {c.cmd.includes("<") && (
                    <CommandShortcut className="hidden sm:inline">stage →</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {/* ── agent tools ──────────────────────────────────────────────── */}
        <CommandSeparator />
        <CommandGroup
          heading={
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
              tools
              <span className="rounded bg-muted px-1.5 py-px text-[9px] normal-case text-muted-foreground">
                {tools.length} loaded
              </span>
            </span>
          }
        >
          {tools.map((t) => (
            <CommandItem
              key={t.name}
              value={`tool ${t.name} ${t.plugin} ${t.desc}`}
              keywords={[t.name, t.plugin]}
              onSelect={() => {
                onOpenChange(false);
                toast.info(t.name, {
                  description: `${t.desc}${t.required.length ? ` Args: ${t.required.join(", ")}.` : ""} Ask Ducky to use it in chat.`,
                  duration: 6000,
                });
              }}
            >
              <Wrench className="size-4 shrink-0 text-[#FF7A1A]" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
                {t.name}
                <span className="ml-2 hidden truncate font-sans text-xs font-normal text-muted-foreground sm:inline">
                  {t.plugin}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* ── sessions ─────────────────────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={<span className="font-mono text-[10px] uppercase tracking-widest">sessions</span>}>
              {recentSessions.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`session ${s.title}${s.starred ? " starred" : ""}`}
                  keywords={[s.title]}
                  onSelect={() => {
                    onOpenChange(false);
                    useDuckyStore.getState().selectSession(s.id);
                  }}
                  className={cn(s.id === activeSessionId && "bg-muted/40")}
                >
                  {s.starred ? (
                    <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                  ) : (
                    <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  {s.id === activeSessionId && (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-[#FF7A1A]">
                      current
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* ── workspace files ─────────────────────────────────────────── */}
        {files.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup
              heading={
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
                  files
                  <span className="rounded bg-muted px-1.5 py-px text-[9px] normal-case text-muted-foreground">
                    {files.length} · current workspace
                  </span>
                </span>
              }
            >
              {files.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  keywords={[p.split("/").pop() ?? p]}
                  onSelect={() => {
                    onOpenChange(false);
                    onPreviewFile(p);
                  }}
                >
                  {fileIconFor(p)}
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{p}</span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">
                    {activeSession!.workspace[p]?.length.toLocaleString() ?? "0"} B
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* footer hint bar */}
      <div className="border-t bg-muted/30 px-3 py-1.5">
        <p className="flex items-center justify-between font-mono text-[10px] text-muted-foreground/70">
          <span aria-hidden>↑↓ navigate · ↵ select · esc close</span>
          <kbd className="rounded border border-border/70 bg-background px-1.5 py-px text-[9px] shadow-none">
            ⌘P
          </kbd>
        </p>
      </div>
    </CommandDialog>
  );
}
