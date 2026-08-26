"use client";

import * as React from "react";
import { ChevronRight, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** Indented virtual-workspace tree; dirs expand/collapse via local state. */
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
        <button
          key={n.path}
          type="button"
          onClick={() => onOpenFile(n.path)}
          style={{ paddingLeft: 6 + depth * 12 + 13 }}
          className="group flex w-full items-center gap-1 rounded-sm py-1 pr-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <FileIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
          <span className="truncate font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground group-hover:underline">
            {n.name}
          </span>
        </button>
      );
    });

  return <div role="tree" aria-label="Workspace files">{render(nodes, 0)}</div>;
}
