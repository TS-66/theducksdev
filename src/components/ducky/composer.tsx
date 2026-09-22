"use client";

import * as React from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  CornerDownLeft,
  Cpu,
  Eye,
  FolderGit2,
  Hand,
  ImagePlus,
  Plus,
  SendHorizontal,
  SlashSquare,
  Square,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MODEL_DISPLAY, MODEL_ID } from "@/lib/ducky/models";
import { useDuckyStore } from "@/lib/ducky/store";
import { fileToPastedImage } from "@/lib/ducky/images";
import { ProjectPickerRow } from "@/components/ducky/project-picker";
import type { PermissionPolicy } from "@/lib/ducky/types";

export const SLASH_COMMANDS = [
  { cmd: "/help", desc: "Open the cheat sheet (shortcuts + commands)" },
  { cmd: "/new", desc: "Start a fresh session" },
  { cmd: "/clear", desc: "Clear messages of this session" },
  { cmd: "/plan", desc: "Toggle plan mode" },
  { cmd: "/model <m>", desc: `Switch model — only ${MODEL_ID} ships today` },
  { cmd: "/policy <p>", desc: "Permission policy — readonly | ask | auto" },
  { cmd: "/plugins", desc: "Open the plugin manager" },
  { cmd: "/activity", desc: "Open the activity timeline (⌘E)" },
  { cmd: "/export", desc: "Download the session as a Markdown transcript" },
  { cmd: "/zip", desc: "Download this session's workspace as a .zip" },
  { cmd: "/backup", desc: "Download all sessions as a JSON backup" },
] as const;

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  /** awaiting permission gate — send disabled */
  locked: boolean;
  hasSession: boolean;
  /** "docked" = bottom bar surface · "hero" = centered zcode-style surface */
  variant?: "docked" | "hero";
  /** open the create-project dialog (hero picker hands off to it) */
  onNewProject?: () => void;
}

const POLICY_META: Record<
  PermissionPolicy,
  { label: string; icon: React.ReactNode; className: string }
> = {
  auto: {
    label: "Full access",
    icon: <Zap className="size-3.5" aria-hidden />,
    className: "text-orange-400",
  },
  ask: {
    label: "Ask before edits",
    icon: <Hand className="size-3.5" aria-hidden />,
    className: "text-amber-300",
  },
  readonly: {
    label: "Read-only",
    icon: <Eye className="size-3.5" aria-hidden />,
    className: "text-muted-foreground",
  },
};

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  running,
  locked,
  hasSession,
  variant = "docked",
  onNewProject,
}: ComposerProps) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const policy = useDuckyStore((s) => s.settings.policy);
  const disabledSurface = !hasSession;
  const hero = variant === "hero";

  /** hero surface may run with no session yet — create one on demand */
  const ensureSession = React.useCallback((): string | null => {
    const st = useDuckyStore.getState();
    if (activeSessionId && st.sessions.some((s) => s.id === activeSessionId)) {
      return activeSessionId;
    }
    return st.newSession();
  }, [activeSessionId]);

  /** shared pipeline for pasted & picked images → vFS data-URL entries */
  const ingestImages = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const sid = hero ? ensureSession() : activeSessionId;
      if (!sid) return;
      let stored = 0;
      for (let i = 0; i < files.length; i++) {
        try {
          const img = await fileToPastedImage(files[i], i);
          useDuckyStore.getState().writeFile(sid, img.suggestedName, img.dataUrl);
          toast.success("Image saved to workspace", {
            description: `${img.suggestedName} · ${(img.bytes / 1024).toFixed(0)} KB — open it from the sidebar tree.`,
          });
          stored++;
        } catch (e) {
          toast.error("Image skipped", { description: (e as Error).message });
        }
      }
      if (stored > 0) taRef.current?.focus();
    },
    [activeSessionId, ensureSession, hero],
  );

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return; // let text paste flow normally
    e.preventDefault();
    void ingestImages(files);
  };

  // autogrow between 52px (hero: 72px) and 200px (hero: 240px)
  const minH = hero ? 72 : 52;
  const maxH = hero ? 240 : 200;
  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
  }, [minH, maxH]);
  React.useEffect(grow, [value, grow]);

  const canSend = Boolean(value.trim()) && !running && !locked && (!disabledSurface || hero);

  const trySend = () => {
    if (!canSend) return;
    if (hero && !hasSession) ensureSession();
    onSend(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      trySend();
    }
  };

  const focusGlow = cn(
    "focus-within:border-[#FDC00A]/60 focus-within:shadow-[0_0_0_4px_rgba(253,192,10,0.12),0_16px_40px_-16px_rgba(253,192,10,0.35)]",
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      aria-hidden
      tabIndex={-1}
      onChange={(e) => {
        void ingestImages(Array.from(e.target.files ?? []));
        e.target.value = ""; // allow re-picking the same file
      }}
    />
  );

  /* ───────────────────────────── hero surface ───────────────────────────── */
  if (hero) {
    return (
      <div className="w-full">
        <div
          className={cn(
            "group/composer relative rounded-2xl border bg-card shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6)] transition-all duration-200",
            focusGlow,
          )}
        >
          {/* focus glow hairline (top edge) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#FDC00A]/70 to-transparent opacity-0 transition-opacity duration-300 group-focus-within/composer:opacity-100"
          />

          {/* workspace row — real project picker (list / create / rename / delete) */}
          <ProjectPickerRow onNewProject={onNewProject ?? (() => {})} />

          {/* textarea */}
          <Textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Ask Ducky anything, @ to add context, / for commands"
            aria-label="Ask Ducky"
            className="min-h-[72px] max-h-[240px] resize-none border-0 bg-transparent px-4 pb-2 pt-3.5 focus-visible:ring-0"
          />

          {fileInput}

          {/* bottom action row */}
          <div className="flex min-w-0 items-center gap-1 px-3 pb-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Attach image to workspace"
                  onClick={() => fileInputRef.current?.click()}
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-4.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Attach an image — saved into the workspace</TooltipContent>
            </Tooltip>

            {/* permission policy dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Permission policy: ${POLICY_META[policy].label}`}
                  className="h-8 gap-1.5 rounded-full px-2 font-mono text-xs sm:px-2.5"
                >
                  <span className={POLICY_META[policy].className}>{POLICY_META[policy].icon}</span>
                  <span className={cn("hidden sm:inline", POLICY_META[policy].className)}>
                    {POLICY_META[policy].label}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  permission policy
                </DropdownMenuLabel>
                {(Object.keys(POLICY_META) as PermissionPolicy[]).map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => {
                      useDuckyStore.getState().updateSettings({ policy: p });
                      toast.success(`Permission policy → ${POLICY_META[p].label}`);
                    }}
                    className="gap-2"
                  >
                    <span className={POLICY_META[p].className}>{POLICY_META[p].icon}</span>
                    <span className="flex-1">{POLICY_META[p].label}</span>
                    {policy === p && <Check className="size-3.5 text-[#FDC00A]" aria-hidden />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto flex items-center gap-1.5">
              {/* single-model selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Active model: ${MODEL_DISPLAY}`}
                    className="h-8 gap-1 rounded-full px-2.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="max-w-28 truncate sm:max-w-40">{MODEL_DISPLAY}</span>
                    <ChevronDown className="size-3" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-60 p-1.5">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Cpu className="size-3.5 shrink-0 text-[#FDC00A]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-semibold">{MODEL_DISPLAY}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        the one model — tuned for agentic coding
                      </span>
                    </span>
                    <Check className="size-3.5 shrink-0 text-[#FDC00A]" aria-hidden />
                  </button>
                </PopoverContent>
              </Popover>

              {/* send / stop */}
              {running ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Stop generation"
                      onClick={onStop}
                      className="size-9 rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Square className="size-4 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Stop</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={canSend ? -1 : 0}>
                      <Button
                        size="icon"
                        aria-label="Send message"
                        disabled={!canSend}
                        onClick={trySend}
                        className={cn(
                          "size-9 rounded-full",
                          canSend ? "bg-primary text-primary-foreground hover:bg-primary/90" : "",
                          locked && "cursor-not-allowed",
                        )}
                      >
                        <ArrowUp className="size-4.5" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {locked && <TooltipContent side="bottom">Waiting for permission approval…</TooltipContent>}
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ──────────────────────────── docked surface ──────────────────────────── */
  const surface = (
    <div
      className={cn(
        "group/composer relative mx-auto w-full max-w-3xl rounded-xl border bg-card shadow-sm transition-all duration-200",
        focusGlow,
        disabledSurface && "opacity-70",
      )}
    >
      {/* focus glow hairline (top edge) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#FDC00A]/70 to-transparent opacity-0 transition-opacity duration-300 group-focus-within/composer:opacity-100"
      />
      {/* top chip row */}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {/* single-model chip — the one and only Ducky 3.5 Coder */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={`Active model: ${MODEL_DISPLAY}`}
              className="flex h-7 cursor-default items-center gap-1.5 rounded-md bg-muted/50 px-2 font-mono text-[11px] text-foreground/80"
            >
              <Cpu className="size-3.5 text-[#FDC00A]" aria-hidden /> {MODEL_DISPLAY}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {MODEL_DISPLAY} — the one model, tuned for agentic coding
          </TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Slash commands"
              className="h-7 gap-1 px-2 font-mono text-[11px] text-muted-foreground"
            >
              <SlashSquare className="size-3.5" aria-hidden /> slash
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-1.5">
            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">
              commands
            </p>
            {SLASH_COMMANDS.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => {
                  onChange(`${c.cmd.split(" ")[0]} `);
                  toast.info("Command staged", {
                    description: `${c.cmd} — press Enter to run${c.cmd.includes("<") ? " (add an argument)" : ""}.`,
                  });
                  taRef.current?.focus();
                }}
                className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs font-semibold">{c.cmd}</span>
                <span className="text-[11px] text-muted-foreground">{c.desc}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {!hasSession ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => useDuckyStore.getState().newSession()}
            className="ml-auto mr-14 flex items-center gap-1 pr-1 text-[11px] italic text-muted-foreground hover:text-foreground focus-visible:outline-none"
          >
            <Plus className="size-3" aria-hidden /> select or create a session…
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Attach image to workspace"
                disabled={disabledSurface}
                onClick={() => fileInputRef.current?.click()}
                className="ml-auto mr-auto h-7 gap-1 px-2 font-mono text-[11px] text-muted-foreground"
              >
                <ImagePlus className="size-3.5" aria-hidden /> image
              </Button>
            </TooltipTrigger>
            <TooltipContent>Paste an image or pick one — saved into the virtual workspace</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* textarea */}
      <Textarea
        ref={taRef}
        value={disabledSurface ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={
          disabledSurface
            ? "Select or create a session…"
            : `Message Ducky… ('/' commands · paste images straight in)`
        }
        disabled={disabledSurface}
        aria-label="Message Ducky"
        className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-3 pb-11 pt-1.5 pr-24 focus-visible:ring-0"
      />

      {fileInput}

      {/* action buttons */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
        {running ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                aria-label="Stop generation"
                onClick={onStop}
                className="size-9 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Square className="size-4 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={canSend ? -1 : 0}>
                <Button
                  size="icon"
                  aria-label="Send message"
                  disabled={!canSend}
                  onClick={trySend}
                  className={cn(
                    "size-9",
                    canSend ? "bg-primary text-primary-foreground" : "",
                    locked && "cursor-not-allowed",
                  )}
                >
                  <SendHorizontal className="size-4" />
                </Button>
              </span>
            </TooltipTrigger>
            {locked && <TooltipContent>Waiting for permission approval…</TooltipContent>}
          </Tooltip>
        )}
      </div>

      {/* enter hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1 font-mono text-[10px] text-muted-foreground/60 sm:flex">
        <CornerDownLeft className="size-3" aria-hidden /> send · shift+enter newline
      </div>
    </div>
  );

  return (
    <div className="border-t bg-background/60 px-4 py-3">
      {surface}
    </div>
  );
}
