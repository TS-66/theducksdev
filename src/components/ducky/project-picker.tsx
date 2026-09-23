"use client";

/**
 * Ducky AI | Coder — project picker + "put your own project in it".
 *
 * The hero composer's workspace row is a real project picker now: pick which
 * project new tasks start from, create one (empty, from the sample repo, or
 * by importing a local folder), rename or delete. No project is ever forced —
 * an install starts with an empty slate and the greeting-service sample is a
 * one-click option, not a permanent fixture.
 */

import * as React from "react";
import {
  Check,
  ChevronDown,
  EllipsisVertical,
  FileUp,
  FolderGit2,
  FolderPlus,
  FolderTree,
  HardDrive,
  Pencil,
  Package,
  Plug,
  RefreshCw,
  Trash2,
  Upload,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { SEED_WORKSPACE } from "@/lib/ducky/workspace-seed";
import { useDuckyStore } from "@/lib/ducky/store";
import {
  MAX_FILES,
  MAX_TOTAL_BYTES,
  formatBytes,
  ingestProjectFiles,
  slugifyProjectName,
} from "@/lib/ducky/projects";
import {
  connectDisk,
  disconnectDisk,
  reconnectDisk,
  supportsFsAccess,
  useDiskStore,
} from "@/lib/ducky/disk";

/* ─────────────────────────── picker row (hero) ──────────────────────────── */

/**
 * The hero composer's workspace row — tap to open the project popover.
 * Self-subscribing: reads projects/activeProjectId from the store.
 */
export function ProjectPickerRow({ onNewProject }: { onNewProject: () => void }) {
  const projects = useDuckyStore((s) => s.projects);
  const activeProjectId = useDuckyStore((s) => s.activeProjectId);
  const [open, setOpen] = React.useState(false);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const active = projects.find((p) => p.id === activeProjectId) ?? null;
  const fileCount = active ? Object.keys(active.files).length : 0;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Select project"
            className="flex w-full items-center gap-2 rounded-t-2xl border-b px-4 py-2.5 text-left text-[13px] text-foreground/90 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <FolderGit2 className="size-4 shrink-0 text-[#FF7A1A]" aria-hidden />
            <span className={cn("truncate", !active && "italic text-muted-foreground")}>
              {active ? active.name : "No project — start from an empty workspace"}
            </span>
            {active && (
              <span className="ml-1 hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">
                {fileCount} {fileCount === 1 ? "file" : "files"}
              </span>
            )}
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <p className="px-2 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
            project
          </p>

          {projects.length === 0 ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
              No project yet. New tasks run in an <span className="text-foreground">empty</span>{" "}
              sandbox — create one below or bring your own folder.
            </p>
          ) : (
            <div className="custom-scrollbar max-h-64 overflow-y-auto">
              {projects.map((p) => {
                const isActive = p.id === activeProjectId;
                const n = Object.keys(p.files).length;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group/row flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                      isActive ? "bg-accent/70" : "hover:bg-accent/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        useDuckyStore.getState().selectProject(p.id);
                        toast.success(`Project → ${p.name}`, {
                          description:
                            n > 0
                              ? `New tasks start from its ${n} file${n === 1 ? "" : "s"}.`
                              : "New tasks start from an empty workspace.",
                        });
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                      aria-pressed={isActive}
                    >
                      <FolderTree
                        className={cn(
                          "size-3.5 shrink-0",
                          isActive ? "text-[#FF7A1A]" : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">{p.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {n}
                      </span>
                      {isActive && (
                        <Check className="size-3.5 shrink-0 text-[#FF7A1A]" aria-hidden />
                      )}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Manage project ${p.name}`}
                          className="size-6 rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
                        >
                          <EllipsisVertical className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => setRenameId(p.id)} className="gap-2">
                          <Pencil className="size-3.5" aria-hidden /> Rename…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteId(p.id)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5" aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}

          {/* real local-folder connection — File System Access API */}
          <div className="mt-1 border-t pt-1.5">
            <DiskRow />
          </div>

          <div className="mt-1 border-t pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNewProject();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <FolderPlus className="size-3.5 text-[#FF7A1A]" aria-hidden />
              New project…
            </button>
            <p className="px-2 pb-0.5 pt-1 text-[10px] leading-relaxed text-muted-foreground/70">
              Sandboxed FS scoped to each task — stored only in this browser.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      {/* rename */}
      <RenameProjectDialog
        project={projects.find((p) => p.id === renameId) ?? null}
        onOpenChange={(o) => !o && setRenameId(null)}
      />

      {/* delete */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete project “{projects.find((p) => p.id === deleteId)?.name ?? ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The project and its files are removed from this browser. Tasks already started from
              it keep their own workspace copies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteId) return;
                const name = projects.find((p) => p.id === deleteId)?.name ?? "";
                useDuckyStore.getState().deleteProject(deleteId);
                setDeleteId(null);
                toast.success(`Project deleted`, { description: `“${name}” removed.` });
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─────────────────────── local-folder connection row ────────────────────── */

/**
 * Real-disk connection state inside the project popover: connect a folder
 * (Chromium File System Access API), reconnect when the browser re-asks for
 * permission, or unplug. Hidden entirely on unsupported browsers.
 */
function DiskRow() {
  const status = useDiskStore((s) => s.status);
  const rootName = useDiskStore((s) => s.rootName);
  const supported = supportsFsAccess();

  if (!supported) {
    return (
      <p className="px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
        <HardDrive className="mr-1 inline size-3 align-[-2px]" aria-hidden />
        Real-folder access needs Chrome, Edge or Opera — the sandboxed workspace works everywhere.
      </p>
    );
  }

  if (status === "connected") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-emerald-500/5 px-2 py-1.5">
        <HardDrive className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs" title={`Real folder connected: ${rootName}`}>
          <span className="text-muted-foreground">disk: </span>
          {rootName}
        </span>
        <button
          type="button"
          aria-label={`Disconnect local folder ${rootName}`}
          onClick={() => {
            void disconnectDisk().then(() => {
              toast.info("Local folder disconnected", {
                description: "The agent can no longer touch it. You can reconnect any time.",
              });
            });
          }}
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Plug className="size-3 rotate-180" aria-hidden /> unplug
        </button>
      </div>
    );
  }

  if (status === "needs-permission") {
    return (
      <button
        type="button"
        onClick={() => {
          void reconnectDisk().then((ok) => {
            if (ok) {
              toast.success(`Folder reconnected: ${useDiskStore.getState().rootName}`);
            } else {
              toast.error("Permission not granted", {
                description: "Try again and choose “Allow” when the browser asks.",
              });
            }
          });
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <RefreshCw className="size-3.5 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          Reconnect <span className="font-mono">{rootName}</span>…
        </span>
        <span className="shrink-0 font-mono text-[10px] text-amber-400">re-grant</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void connectDisk().then((ok) => {
            if (ok) {
              toast.success(`Folder connected: ${useDiskStore.getState().rootName}`, {
                description:
                  "disk_* tools now list, read, edit and create REAL files inside it.",
              });
            }
          });
        }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <HardDrive className="size-3.5 text-cyan-400" aria-hidden />
        Connect local folder…
      </button>
      <p className="px-2 pb-0.5 pt-1 text-[10px] leading-relaxed text-muted-foreground/70">
        Real filesystem access — disk tools edit files in it, permission-gated.
      </p>
    </>
  );
}

/* ─────────────────────────────── rename ─────────────────────────────────── */

function RenameProjectDialog({
  project,
  onOpenChange,
}: {
  project: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");

  // Deferred prefill when the target project changes (no render-phase cascade).
  React.useEffect(() => {
    if (!project) return;
    const next = project.name;
    let live = true;
    const t = setTimeout(() => {
      if (live) setName(next);
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [project]);

  const submit = () => {
    if (!project || !name.trim()) return;
    useDuckyStore.getState().renameProject(project.id, name.trim());
    toast.success("Project renamed", { description: `${project.name} → ${name.trim()}` });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={project !== null}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Tasks keep working — only the label changes.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="project-rename">Project name</Label>
            <Input
              id="project-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={64}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || name.trim() === project?.name}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────── new project dialog ────────────────────────── */

type Starter = "empty" | "sample";

interface ImportMeta {
  count: number;
  bytes: number;
  skipped: number;
  skippedDirs: number;
  notes: string[];
}

/**
 * Create-a-project flow: name it, start empty / from the sample repo, or
 * import your own folder / files from disk. Imported files always win over
 * the starter choice.
 */
export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [starter, setStarter] = React.useState<Starter>("empty");
  const [imported, setImported] = React.useState<Record<string, string> | null>(null);
  const [meta, setMeta] = React.useState<ImportMeta | null>(null);
  const [busy, setBusy] = React.useState(false);

  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const filesInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setName("");
    setNameTouched(false);
    setStarter("empty");
    setImported(null);
    setMeta(null);
    setBusy(false);
  };

  const handleImport = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const res = await ingestProjectFiles(list);
      const count = Object.keys(res.files).length;
      if (count === 0) {
        toast.error("Nothing importable found", {
          description:
            res.skippedDirs > 0
              ? `Only dependency/build dirs (${res.skippedDirs}) were found — or every file was skipped (binary, > ${formatBytes(384 * 1024)}).`
              : "Files were skipped: binary formats and oversize files can't enter the sandbox.",
        });
        return;
      }
      setImported(res.files);
      setMeta({
        count,
        bytes: res.totalBytes,
        skipped: res.skipped,
        skippedDirs: res.skippedDirs,
        notes: res.notes,
      });
      if (!nameTouched && res.rootName) {
        setName(res.rootName);
      }
      toast.success(`Imported ${count} file${count === 1 ? "" : "s"}`, {
        description: `${formatBytes(res.totalBytes)} ready${res.skipped > 0 ? ` · ${res.skipped} skipped` : ""}${res.skippedDirs > 0 ? ` · ${res.skippedDirs} dep/build dirs skipped` : ""}.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const canCreate = name.trim().length > 0 && !busy;

  const create = () => {
    if (!canCreate) return;
    const finalName = name.trim();
    const files = imported ?? (starter === "sample" ? { ...SEED_WORKSPACE } : undefined);
    const st = useDuckyStore.getState();
    st.createProject(finalName, files);
    const n = files ? Object.keys(files).length : 0;
    toast.success(`Project “${finalName}” created`, {
      description:
        n > 0
          ? `${n} file${n === 1 ? "" : "s"} — new tasks start from it.`
          : "Empty workspace — new tasks start from it.",
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="size-4 text-[#FF7A1A]" aria-hidden /> New project
          </DialogTitle>
          <DialogDescription>
            A project is the starting workspace for your tasks. Bring your own files, use the
            sample repo, or start blank.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="space-y-4"
        >
          {/* name */}
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              placeholder="my-project"
              maxLength={64}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              onBlur={() => {
                // offer a tidy slug if the user typed something loose
                if (name.trim() && !/^[a-z0-9-_]+$/.test(name.trim())) {
                  setName(slugifyProjectName(name));
                }
              }}
            />
          </div>

          {/* import zone */}
          <div className="rounded-lg border border-dashed p-3">
            <p className="mb-2 text-xs font-medium">Bring your own project</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => folderInputRef.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden /> Import folder…
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => filesInputRef.current?.click()}
              >
                <FileUp className="size-3.5" aria-hidden /> Add files…
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/80">
              Text files up to {formatBytes(384 * 1024)} each · max {MAX_FILES} files ·{" "}
              {formatBytes(MAX_TOTAL_BYTES)} total · node_modules / .git / build dirs skipped.
            </p>

            {imported && meta && (
              <div className="mt-2 rounded-md bg-muted/40 p-2">
                <div className="flex items-center gap-2">
                  <Package className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                    {meta.count} files · {formatBytes(meta.bytes)}
                    {meta.skipped > 0 ? ` · ${meta.skipped} skipped` : ""}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear imported files"
                    onClick={() => {
                      setImported(null);
                      setMeta(null);
                    }}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    clear
                  </button>
                </div>
                {meta.notes.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {meta.notes.slice(0, 3).map((n) => (
                      <li key={n} className="truncate font-mono text-[10px] text-muted-foreground/70">
                        · {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* hidden pickers */}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void handleImport(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={filesInputRef}
              type="file"
              multiple
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void handleImport(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* starter choice — only when nothing imported */}
          {!imported && (
            <RadioGroup
              value={starter}
              onValueChange={(v) => setStarter(v as Starter)}
              className="gap-2"
            >
              <label
                htmlFor="starter-empty"
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                  starter === "empty" ? "border-[#FF7A1A]/50 bg-[#FF7A1A]/5" : "hover:bg-accent/40",
                )}
              >
                <RadioGroupItem id="starter-empty" value="empty" className="mt-0.5" />
                <span>
                  <span className="block text-xs font-medium">Empty workspace</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Blank sandbox — let the agent scaffold it, or paste files in later.
                  </span>
                </span>
              </label>
              <label
                htmlFor="starter-sample"
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
                  starter === "sample" ? "border-[#FF7A1A]/50 bg-[#FF7A1A]/5" : "hover:bg-accent/40",
                )}
              >
                <RadioGroupItem id="starter-sample" value="sample" className="mt-0.5" />
                <span>
                  <span className="block text-xs font-medium">Sample: greeting-service</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Tiny TypeScript repo ({Object.keys(SEED_WORKSPACE).length} files with tests) —
                    great for trying the tools.
                  </span>
                </span>
              </label>
            </RadioGroup>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canCreate}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
