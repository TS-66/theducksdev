"use client";

/**
 * Ducky AI | Coder — keyboard shortcuts help dialog (⌘/ or ?).
 * Terminal-flavored cheat sheet of every binding the console supports.
 */

import * as React from "react";
import { Command, Keyboard, Slash, SquareTerminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SLASH_COMMANDS } from "./composer";

const SHORTCUTS: Array<{ keys: string[]; action: string; scope: string }> = [
  { keys: ["⌘", "K"], action: "New task", scope: "global" },
  { keys: ["⌘", "P"], action: "Command palette — sessions, files, commands", scope: "global" },
  { keys: ["⌘", "E"], action: "Toggle activity timeline", scope: "global" },
  { keys: ["⌘", "/"], action: "Toggle this cheat sheet", scope: "global" },
  { keys: ["?"], action: "Toggle this cheat sheet", scope: "global" },
  { keys: ["Enter"], action: "Send message", scope: "composer" },
  { keys: ["Shift", "Enter"], action: "New line", scope: "composer" },
  { keys: ["/"], action: "Open slash-command menu", scope: "composer" },
  { keys: ["Esc"], action: "Close dialogs & sheets", scope: "global" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="custom-scrollbar max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SquareTerminal className="size-4 text-[#FF7A1A]" aria-hidden /> ducky cheat sheet
          </DialogTitle>
          <DialogDescription>
            Keyboard bindings and slash commands — the harness way.
          </DialogDescription>
        </DialogHeader>
        {/* ── keyboard ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Keyboard className="size-3.5 text-[#FF7A1A]" aria-hidden />
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            keyboard
          </h3>
          <span className="h-px min-w-4 flex-1 bg-border/60" />
        </div>
        <ul className="space-y-1" aria-label="Keyboard shortcuts">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys.join("+")}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0">{s.action}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground/60">+</span>}
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                      {k}
                    </kbd>
                  </React.Fragment>
                ))}
                <span className="ml-1.5 rounded bg-muted/60 px-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
                  {s.scope}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* ── slash commands ─────────────────────────────────────────────── */}
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Slash className="size-3.5 text-[#FF7A1A]" aria-hidden />
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            slash commands
          </h3>
          <span className="h-px min-w-4 flex-1 bg-border/60" />
        </div>
        <ul className="space-y-0.5" aria-label="Slash commands">
          {SLASH_COMMANDS.map((c) => (
            <li
              key={c.cmd}
              className="group flex items-center justify-between gap-3 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-muted/50"
            >
              <code className="shrink-0 rounded border border-[#FF7A1A]/25 bg-[#FF7A1A]/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#8fa2ff] transition-colors group-hover:border-[#FF7A1A]/45">
                {c.cmd}
              </code>
              <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
                {c.desc}
              </span>
            </li>
          ))}
        </ul>

        <p className="flex items-center gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
          <Command className="size-3" aria-hidden />
          On Windows/Linux, ⌘ = Ctrl. Type <code className="font-mono">/</code> in the composer to
          filter commands as you go.
        </p>
      </DialogContent>
    </Dialog>
  );
}
