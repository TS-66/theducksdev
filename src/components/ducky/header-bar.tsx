"use client";

import {
  Cpu,
  FolderGit2,
  Map,
  Menu,
  Puzzle,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { modelDisplayName } from "@/lib/ducky/models";
import { useDuckyStore } from "@/lib/ducky/store";

interface HeaderBarProps {
  onMenu: () => void;
  onOpenSettings: (tab?: "behavior" | "about") => void;
  onOpenPlugins: () => void;
  onToggleTerminal: () => void;
  terminalOpen: boolean;
}

export function HeaderBar({ onMenu, onOpenSettings, onOpenPlugins, onToggleTerminal, terminalOpen }: HeaderBarProps) {
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const sessions = useDuckyStore((s) => s.sessions);
  const settings = useDuckyStore((s) => s.settings);
  const projects = useDuckyStore((s) => s.projects);
  const activeProjectId = useDuckyStore((s) => s.activeProjectId);

  const session = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  /** the session's project wins; else the next session's project; else nothing */
  const workspaceLabel =
    session?.projectName ??
    (session
      ? Object.keys(session.workspace).length > 0
        ? "workspace"
        : "empty"
      : (activeProject?.name ?? "no project"));

  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/85 px-3 shadow-[0_1px_0_rgba(253,192,10,0.08)] backdrop-blur-xl">
      {/* Left */}
      <Button
        size="icon"
        variant="ghost"
        aria-label="Open navigation menu"
        onClick={onMenu}
        className="size-8 shrink-0 lg:hidden"
      >
        <Menu className="size-4" />
      </Button>

      <div className="flex min-w-0 items-center gap-2">
        {/* The exact Ducky AI pixel-duck mark */}
        <img
          src="/ducky-mark.png"
          alt="Ducky AI logo"
          className="size-6 shrink-0 rounded-md border border-[#FDC00A]/30 bg-black shadow-[0_0_12px_-2px_rgba(253,192,10,0.5)]"
        />
        <span className="whitespace-nowrap font-bold leading-none tracking-tight">
          Ducky AI{" "}
          <span className="hidden font-mono font-semibold text-muted-foreground sm:inline">
            | Coder
          </span>
        </span>
        <Badge
          variant="outline"
          className="hidden border-[#FDC00A]/25 bg-[#FDC00A]/5 px-1.5 py-0 font-mono text-[10px] text-[#FDC00A] sm:inline-flex"
        >
          v1.0 · ide
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Workspace chip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              className="mr-1 hidden items-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-muted-foreground md:flex"
            >
              <FolderGit2 className="size-3.5" aria-hidden />
              <span className="truncate">workspace: {workspaceLabel}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Virtual sandboxed FS stored in your browser</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 hidden h-5 md:block" />

        {/* Plan mode toggle */}
        <Toggle
          size="sm"
          variant="outline"
          pressed={Boolean(session?.planMode)}
          onPressedChange={(on) => {
            if (!activeSessionId || !session) {
              toast.info("Start a task first", {
                description: "Plan mode applies to the active session.",
              });
              return;
            }
            useDuckyStore.getState().setPlanMode(activeSessionId, Boolean(on));
            toast.success(on ? "Plan mode ON" : "Plan mode OFF", {
              description: on
                ? "The agent will research and propose a plan before writing files."
                : "Back to normal execution.",
            });
          }}
          className="gap-1.5 px-2 font-normal"
          aria-label="Toggle plan mode"
        >
          <Map className="size-3.5 text-[#FDC00A]" aria-hidden />
          <span className="hidden sm:inline">Plan</span>
        </Toggle>

        {/* Model pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenSettings("about")}
              className="gap-1.5 px-2 font-mono text-xs text-muted-foreground"
              aria-label={`Model ${modelDisplayName(settings.model)}. Open settings.`}
            >
              <Cpu className="size-3.5 shrink-0 text-[#FDC00A]" aria-hidden />
              <span className="hidden max-w-36 truncate sm:inline">{modelDisplayName(settings.model)}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {modelDisplayName(settings.model)} — opens Settings → Connections
          </TooltipContent>
        </Tooltip>

        {/* Terminal */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={terminalOpen ? "Close terminal" : "Open terminal"}
              aria-pressed={terminalOpen}
              onClick={onToggleTerminal}
              className="size-8"
            >
              <SquareTerminal className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Terminal — shell over the workspace</TooltipContent>
        </Tooltip>

        {/* Plugins */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Manage plugins"
              onClick={onOpenPlugins}
              className="size-8"
            >
              <Puzzle className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Plugins</TooltipContent>
        </Tooltip>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Open settings"
              onClick={() => onOpenSettings()}
              className="size-8"
            >
              <Settings className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
