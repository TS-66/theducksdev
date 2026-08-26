"use client";

/**
 * DSH Web — keyboard shortcuts help dialog (⌘/ or ?).
 * Terminal-flavored cheat sheet of every binding the console supports.
 */

import * as React from "react";
import { Command, Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: Array<{ keys: string[]; action: string; scope: string }> = [
  { keys: ["⌘", "K"], action: "New task", scope: "global" },
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-[#4D6BFE]" aria-hidden /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            dsh keeps your hands on the keyboard — the harness way.
          </DialogDescription>
        </DialogHeader>
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
        <p className="flex items-center gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
          <Command className="size-3" aria-hidden />
          On Windows/Linux, ⌘ = Ctrl.
        </p>
      </DialogContent>
    </Dialog>
  );
}
