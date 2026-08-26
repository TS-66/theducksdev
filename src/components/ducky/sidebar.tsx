"use client";

import * as React from "react";
import {
  Copy,
  Download,
  FilePlus2,
  FolderDown,
  FolderTree,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
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
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDuckyStore } from "@/lib/ducky/store";
import { downloadSessionMarkdown } from "@/lib/ducky/export-md";
import type { Session } from "@/lib/ducky/types";
import { relTime } from "./format";
import { FileTree } from "./file-tree";

interface SidebarProps {
  /** fires after a session is picked — used by the mobile Sheet to auto-close */
  onAfterSelect?: () => void;
  onPreviewFile: (path: string) => void;
}

export function Sidebar({ onAfterSelect, onPreviewFile }: SidebarProps) {
  const sessions = useDuckyStore((s) => s.sessions);
  const activeSessionId = useDuckyStore((s) => s.activeSessionId);
  const [query, setQuery] = React.useState("");
  const [newFileOpen, setNewFileOpen] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const dragDepth = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  /** git-log day grouping over the sorted list: pinned → today → … */
  const groups = React.useMemo(() => {
    const out: Array<{ label: string; items: typeof sorted }> = [];
    const push = (label: string, s: (typeof sorted)[number]) => {
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    };
    const startOfDay = (t: number) => {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const todayStart = startOfDay(Date.now());
    const DAY = 86_400_000;
    for (const s of sorted) {
      if (s.starred) {
        push("pinned ★", s);
        continue;
      }
      const upd = startOfDay(s.updatedAt);
      if (upd >= todayStart) push("today", s);
      else if (upd >= todayStart - DAY) push("yesterday", s);
      else if (upd >= todayStart - 7 * DAY) push("previous 7 days", s);
      else push("earlier", s);
    }
    return out;
  }, [sorted]);

  const active = sessions.find((s) => s.id === activeSessionId) ?? null;

  const newTask = () => {
    useDuckyStore.getState().newSession();
    toast.success("New task created");
    onAfterSelect?.();
  };

  /* ── workspace file import (drag-drop / picker) ─────────────────────── */
  const importFiles = async (list: FileList | File[]) => {
    if (!active) return;
    const files = Array.from(list).slice(0, 12);
    if (!files.length) return;
    const store = useDuckyStore.getState();
    const taken = new Set(store.listWorkspaceFiles(active.id));
    const created: string[] = [];
    let skipped = 0;

    for (const f of files) {
      const textLike =
        f.type.startsWith("text/") ||
        f.type === "application/json" ||
        /\.(txt|md|markdown|json|jsonc|ts|tsx|js|jsx|mjs|cjs|css|scss|html|htm|xml|yml|yaml|toml|csv|tsv|sh|bash|zsh|env|ini|cfg|conf|gitignore|editorconfig|log|rs|py|rb|go|java|c|h|cpp|hpp|sql|graphql|prisma)$/i.test(
          f.name,
        );
      if (!textLike || f.size > 256 * 1024) {
        skipped++;
        continue;
      }
      try {
        const content = await f.text();
        // de-collide against existing workspace entries and earlier imports
        let path = f.name.replace(/^\/+/, "");
        if (taken.has(path)) {
          const dot = path.lastIndexOf(".");
          const base = dot > 0 ? path.slice(0, dot) : path;
          const ext = dot > 0 ? path.slice(dot) : "";
          let n = 1;
          while (taken.has(`${base}-${n}${ext}`)) n++;
          path = `${base}-${n}${ext}`;
        }
        taken.add(path);
        store.writeFile(active.id, path, content);
        created.push(path);
      } catch {
        skipped++;
      }
    }

    if (created.length > 0) {
      toast.success(`Imported ${created.length} file${created.length === 1 ? "" : "s"}`, {
        description:
          skipped > 0
            ? `${skipped} skipped (binary or >256 KB)`
            : `${created.slice(0, 3).join(", ")}${created.length > 3 ? ` +${created.length - 3} more` : ""}`,
      });
      onPreviewFile(created[created.length - 1]);
    } else {
      toast.error("Nothing imported", {
        description: "Only text-like files up to 256 KB can enter the virtual FS.",
      });
    }
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
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 pr-1"
      >
        {sorted.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {query ? `No sessions match “${query}”.` : (<>No sessions yet.<br />Press ⌘K or hit “New task”.</>)}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={`${g.label} sessions`}>
            <p
              className={cn(
                "sticky top-0 z-10 bg-background/95 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 backdrop-blur-sm",
                g.label === "pinned ★" && "text-amber-400/80",
              )}
            >
              {g.label}
              <span className="ml-1.5 text-muted-foreground/40">{g.items.length}</span>
            </p>
            {g.items.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                onSelect={() => {
                  useDuckyStore.getState().selectSession(s.id);
                  onAfterSelect?.();
                }}
              />
            ))}
          </div>
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
                aria-label="Create a new workspace file"
                disabled={!active}
                onClick={() => setNewFileOpen(true)}
                className="size-6 rounded-sm"
              >
                <FilePlus2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New file…</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Import workspace files"
                disabled={!active}
                onClick={() => fileInputRef.current?.click()}
                className="size-6 rounded-sm"
              >
                <Upload className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import files (or drop them below)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Export workspace as zip"
                disabled={!active || Object.keys(active?.workspace ?? {}).length === 0}
                onClick={() => {
                  if (!active) return;
                  import("@/lib/ducky/zip")
                    .then(({ downloadWorkspaceZip }) => {
                      downloadWorkspaceZip(active);
                      toast.success("Workspace exported", {
                        description: `${Object.keys(active.workspace).length} files zipped — opens in any archive tool.`,
                      });
                    })
                    .catch((e) =>
                      toast.error("Export failed", {
                        description: e instanceof Error ? e.message : String(e),
                      }),
                    );
                }}
                className="size-6 rounded-sm"
              >
                <FolderDown className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export .zip</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Reset workspace to seed files"
                disabled={!active}
                onClick={() => {
                  if (!active) return;
                  useDuckyStore.getState().resetWorkspace(active.id);
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
        <div
          className={cn(
            "relative rounded-md transition-shadow",
            active && dragOver && "ring-2 ring-emerald-500/70 ring-offset-1 ring-offset-background",
          )}
          aria-label={active ? "Workspace files — drop text files here to import" : undefined}
          onDragEnter={(e) => {
            if (!active) return;
            e.preventDefault();
            dragDepth.current += 1;
            setDragOver(true);
          }}
          onDragOver={(e) => {
            if (!active) return;
            e.preventDefault();
          }}
          onDragLeave={() => {
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragOver(false);
            if (active && e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
          }}
        >
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
          {active && dragOver && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-emerald-500/70 bg-background/80 backdrop-blur-[2px]"
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-emerald-500">
                <Upload className="size-3.5" /> drop to import → virtual FS
              </span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(e.target.files);
            e.target.value = ""; // allow re-picking the same file later
          }}
        />
        <p className="mt-1 px-1 font-mono text-[10px] text-muted-foreground/70">
          {active ? Object.keys(active.workspace).length : 0} files · virtual FS in your browser
        </p>
      </div>

      {/* New workspace file dialog */}
      {active && (
        <NewFileDialog
          open={newFileOpen}
          onOpenChange={setNewFileOpen}
          existingPaths={Object.keys(active.workspace)}
          onCreate={(path, content) => {
            useDuckyStore.getState().writeFile(active.id, path, content);
            toast.success("File created", { description: path });
            onPreviewFile(path);
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── NewFileDialog ──────────────────────────────── */

function NewFileDialog({
  open,
  onOpenChange,
  existingPaths,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPaths: string[];
  onCreate: (path: string, content: string) => void;
}) {
  const [path, setPath] = React.useState("");
  const [content, setContent] = React.useState("");

  const trimmedPath = path.trim().replace(/^\/+/, "");
  const collision = existingPaths.some((p) => p === trimmedPath);
  const valid = trimmedPath.length > 0 && !collision && !/[\\*?"<>|]/.test(trimmedPath);

  const submit = () => {
    if (!valid) return;
    onCreate(trimmedPath, content);
    setPath("");
    setContent("");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPath("");
          setContent("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New workspace file</DialogTitle>
          <DialogDescription>
            Written straight into this session&apos;s virtual FS — the agent can read and edit it
            like any other workspace file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ducky-newfile-path" className="text-xs">
              Path
            </Label>
            <Input
              id="ducky-newfile-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="docs/notes.md"
              autoFocus
              spellCheck={false}
              className="font-mono text-xs"
              aria-invalid={collision}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            {collision && (
              <p className="text-[11px] text-destructive">A file with this path already exists.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ducky-newfile-content" className="text-xs">
              Content <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="ducky-newfile-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"# Notes\n\nPaste or type file contents…"}
              className="custom-scrollbar min-h-[140px] resize-y font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-right font-mono text-[10px] text-muted-foreground">
              {content.length} chars · {content.split("\n").length} lines
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!valid} onClick={submit}>
            <FilePlus2 className="mr-1.5 size-3.5" /> Create file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <DropdownMenuItem
            onSelect={() => {
              const newId = useDuckyStore.getState().duplicateSession(session.id);
              if (newId)
                toast.success("Session duplicated", {
                  description: `“${session.title} (copy)” — messages, workspace and todos cloned.`,
                });
            }}
          >
            <Copy className="mr-2 size-3.5" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => useDuckyStore.getState().toggleStar(session.id)}>
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
                useDuckyStore.getState().renameSession(session.id, draft.trim());
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
                useDuckyStore.getState().renameSession(session.id, draft.trim());
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
                useDuckyStore.getState().deleteSession(session.id);
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
