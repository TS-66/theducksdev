"use client";

import * as React from "react";
import {
  Download,
  FolderTree,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDshStore } from "@/lib/dsh/store";
import { downloadSessionMarkdown } from "@/lib/dsh/export-md";
import type { Session } from "@/lib/dsh/types";
import { relTime } from "./format";
import { FileTree } from "./file-tree";

interface SidebarProps {
  /** fires after a session is picked — used by the mobile Sheet to auto-close */
  onAfterSelect?: () => void;
  onPreviewFile: (path: string) => void;
}

export function Sidebar({ onAfterSelect, onPreviewFile }: SidebarProps) {
  const sessions = useDshStore((s) => s.sessions);
  const activeSessionId = useDshStore((s) => s.activeSessionId);
  const [query, setQuery] = React.useState("");

  const sorted = React.useMemo(
    () =>
      [...sessions]
        .filter((s) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          if (s.title.toLowerCase().includes(q)) return true;
          return s.messages.some((m) => m.content.toLowerCase().includes(q));
        })
        .sort(
          (a, b) => Number(b.starred) - Number(a.starred) || b.updatedAt - a.updatedAt,
        ),
    [sessions, query],
  );

  const active = sessions.find((s) => s.id === activeSessionId) ?? null;

  const newTask = () => {
    useDshStore.getState().newSession();
    toast.success("New task created");
    onAfterSelect?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* New task */}
      <div className="p-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={newTask}
          aria-label="New task"
        >
          <Plus className="size-4" />
          <span>New task</span>
          <kbd className="pointer-events-none ml-auto select-none rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
      </div>

      {/* Search + Sessions */}
      {sessions.length > 0 && (
        <div className="px-2 pb-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              aria-label="Search sessions"
              className="h-7 border-none bg-muted/40 pl-7 pr-7 text-xs focus-visible:ring-1"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}
      <nav
        aria-label="Sessions"
        className="custom-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 pr-1"
      >
        {sorted.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {query ? `No sessions match “${query}”.` : (<>No sessions yet.<br />Press ⌘K or hit “New task”.</>)}
          </p>
        )}
        {sorted.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeSessionId}
            onSelect={() => {
              useDshStore.getState().selectSession(s.id);
              onAfterSelect?.();
            }}
          />
        ))}
      </nav>

      {/* Workspace block */}
      <div className="border-t p-2">
        <div className="mb-1 flex items-center gap-1.5 px-1">
          <FolderTree className="size-3.5 text-muted-foreground" aria-hidden />
          <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            workspace: greeting-service
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Reset workspace to seed files"
                disabled={!active}
                onClick={() => {
                  if (!active) return;
                  useDshStore.getState().resetWorkspace(active.id);
                  toast.success("Workspace restored to seed");
                }}
                className="size-6 rounded-sm"
              >
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to seed</TooltipContent>
          </Tooltip>
        </div>
        <div className="custom-scrollbar max-h-56 overflow-y-auto rounded-md bg-muted/20 p-1">
          {active ? (
            <FileTree
              workspace={active.workspace}
              onOpenFile={(p) => onPreviewFile(p)}
            />
          ) : (
            <p className="p-3 text-center text-xs text-muted-foreground">No active session.</p>
          )}
        </div>
        <p className="mt-1 px-1 font-mono text-[10px] text-muted-foreground/70">
          {active ? Object.keys(active.workspace).length : 0} files · virtual FS in your browser
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── SessionRow ───────────────────────────────── */

function SessionRow({
  session,
  active,
  onSelect,
}: {
  session: Session;
  active: boolean;
  onSelect: () => void;
}) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(session.title);

  const msgCount = session.messages.filter((m) => m.role !== "tool" && m.role !== "system").length;

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-md transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/60 focus-within:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2 pr-8 text-left focus-visible:outline-none"
        aria-current={active ? "true" : undefined}
      >
        <Star
          className={cn(
            "size-3 shrink-0",
            session.starred ? "fill-amber-400 text-amber-400" : "text-transparent group-hover:text-muted-foreground/50",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[13px]">{session.title}</span>
        <span className="shrink-0 pl-1 font-mono text-[10px] text-muted-foreground">
          {msgCount > 0 && `${msgCount}·`}
          {relTime(session.updatedAt)}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Actions for ${session.title}`}
            className={cn(
              "absolute right-1 top-1/2 size-6 -translate-y-1/2 rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
              active && "opacity-70",
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil className="mr-2 size-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => useDshStore.getState().toggleStar(session.id)}>
            <Star className="mr-2 size-3.5" /> {session.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              downloadSessionMarkdown(session);
              toast.success("Session exported", {
                description: "Markdown transcript downloaded.",
              });
            }}
          >
            <Download className="mr-2 size-3.5" /> Export .md
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 size-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
          </DialogHeader>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                useDshStore.getState().renameSession(session.id, draft.trim());
                setRenameOpen(false);
                toast.success("Renamed");
              }
            }}
            aria-label="Session title"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={() => {
                useDshStore.getState().renameSession(session.id, draft.trim());
                setRenameOpen(false);
                toast.success("Renamed");
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{session.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the session, its messages and its virtual workspace files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                useDshStore.getState().deleteSession(session.id);
                toast("Session deleted", {
                  description: `“${session.title}” removed.`,
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
