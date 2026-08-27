"use client";

import {
  Cpu,
  FolderGit2,
  Map,
  Menu,
  Puzzle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MODEL_DISPLAY } from "@/lib/ducky/models";
import { useDuckyStore } from "@/lib/ducky/store";

interface HeaderBarProps {
  onMenu: () => void;
  onOpenSettings: (tab?: "models" | "behavior" | "about") => void;
  onOpenPlugins: () => void;
}

export function HeaderBar({ onMenu, onOpenSettings, onOpenPlugins }: HeaderBarProps) {
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const sessions = useDuckyStore((s) => s.sessions);
  const settings = useDuckyStore((s) => s.settings);

  const session = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
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
          className="size-6 shrink-0 rounded-md border border-[#FDC00A]/25 bg-black"
        />
        <span className="whitespace-nowrap font-bold leading-none">
          Ducky AI{" "}
          <span className="hidden font-mono font-semibold text-muted-foreground sm:inline">
            | Coder
          </span>
        </span>
        <Badge
          variant="outline"
          className="hidden px-1.5 py-0 font-mono text-[10px] text-muted-foreground sm:inline-flex"
        >
          v1.0
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
              <span className="truncate">workspace: greeting-service</span>
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
              onClick={() => onOpenSettings("models")}
              className="gap-1.5 px-2 font-mono text-xs text-muted-foreground"
              aria-label={`Model ${MODEL_DISPLAY}. Open settings.`}
            >
              <Cpu className="size-3.5 shrink-0 text-[#FDC00A]" aria-hidden />
              <span className="hidden max-w-36 truncate sm:inline">{MODEL_DISPLAY}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {MODEL_DISPLAY} — opens Settings → Models
          </TooltipContent>
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
