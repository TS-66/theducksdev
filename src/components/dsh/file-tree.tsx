"use client";

/**
 * DSH Web — virtual workspace file tree.
 *
 * Dirs expand/collapse; file rows reveal a hover actions menu (⋯) with
 * Rename / Download / Delete — full client-side CRUD on the vFS, mirroring
 * what the bash tool can do but reachable without the agent.
 */

import * as React from "react";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDshStore } from "@/lib/dsh/store";

interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, children: [] };
  for (const p of [...paths].sort()) {
    const parts = p.split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.name === part && c.dir === !isLeaf);
      if (!next) {
        next = { name: part, path, dir: !isLeaf, children: [] };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) =>
      a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1,
    );
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children;
}

interface FileTreeProps {
  workspace: Record<string, string>;
  onOpenFile: (path: string) => void;
}

/** Indented virtual-workspace tree with per-file actions. */
export function FileTree({ workspace, onOpenFile }: FileTreeProps) {
  const nodes = React.useMemo(() => buildTree(Object.keys(workspace)), [workspace]);
  // undefined => expanded by default (dirs start open)
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const render = (list: TreeNode[], depth: number): React.ReactNode =>
    list.map((n) => {
      if (n.dir) {
        const open = !collapsed[n.path];
        return (
          <React.Fragment key={n.path}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setCollapsed((c) => ({ ...c, [n.path]: open }))}
              style={{ paddingLeft: 6 + depth * 12 }}
              className={cn(
                "flex w-full items-center gap-1 rounded-sm py-1 pr-1 text-left text-xs text-foreground/90 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
            >
              <ChevronRight
                className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                aria-hidden
              />
              <span className="truncate font-medium">{n.name}</span>
            </button>
            {open && render(n.children, depth + 1)}
          </React.Fragment>
        );
      }
      return (
        <FileRow
          key={n.path}
          node={n}
          depth={depth}
          workspace={workspace}
          onOpenFile={onOpenFile}
        />
      );
    });

  return <div role="tree" aria-label="Workspace files">{render(nodes, 0)}</div>;
}

/* ─────────────────────────── file row + actions ─────────────────────────── */

function FileRow({
  node,
  depth,
  workspace,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  workspace: Record<string, string>;
  onOpenFile: (path: string) => void;
}) {
  const sessionId = useDshStore((s) => s.activeSessionId);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(node.name);

  const openRename = () => {
    setRenameValue(node.name);
    setRenameOpen(true);
  };

  const submitRename = () => {
    const st = useDshStore.getState();
    if (!sessionId) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === node.name) {
      setRenameOpen(false);
      return;
    }
    // support moving into (new) subdirs: "notes/v2/greet.ts"
    const dir = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/") + 1) : "";
    const target = `${dir}${trimmed}`;
    const ok = st.renameFileEntry(sessionId, node.path, target);
    if (ok) {
      toast.success("File renamed", { description: `${node.path} → ${target}` });
      setRenameOpen(false);
    } else {
      toast.error("Rename failed", {
        description: "Target path already exists or is invalid.",
      });
    }
  };

  const download = () => {
    const blob = new Blob([workspace[node.path] ?? ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = node.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success("File downloaded", { description: node.path });
  };

  const confirmDelete = () => {
    const st = useDshStore.getState();
    if (!sessionId) return;
    st.deleteFileEntry(sessionId, node.path);
    toast("File deleted", { description: node.path });
    setDeleteOpen(false);
  };

  return (
    <>
      <div
        className="group/file relative flex w-full items-center"
        style={{ paddingLeft: 6 + depth * 12 + 13 }}
      >
        <button
          type="button"
          onClick={() => onOpenFile(node.path)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <FileIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
          <span className="truncate font-mono text-xs text-muted-foreground transition-colors group-hover/file:text-foreground group-hover/file:underline">
            {node.name}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for ${node.path}`}
              className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/file:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={openRename}>
              <Pencil className="mr-2 size-3.5" aria-hidden /> Rename…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={download}>
              <Download className="mr-2 size-3.5" aria-hidden /> Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-red-400 focus:bg-red-500/10 focus:text-red-300"
            >
              <Trash2 className="mr-2 size-3.5" aria-hidden /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">rename file</DialogTitle>
            <DialogDescription className="font-mono text-[11px]">
              {node.path}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
            }}
            aria-label="New file name"
            className="font-mono text-xs"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitRename}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{node.path}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the file from the virtual workspace. The agent or bash
              (<code className="font-mono text-[11px]">echo &gt; …</code>) can recreate it, but the
              content is gone for this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-600/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
