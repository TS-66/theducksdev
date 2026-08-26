/**
 * DSH Web — per-tool presentation metadata (icons + accent colors).
 * Mirrors upstream's "tool-owned UI presentation" idea: every tool owns how
 * its calls render in the transcript instead of one generic wrench card.
 */

import {
  Bot,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderSearch,
  Globe,
  HelpCircle,
  ListTodo,
  ScanEye,
  ScanText,
  SquareTerminal,
  TextSearch,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface ToolMeta {
  icon: LucideIcon;
  /** tailwind text color class for the icon */
  tint: string;
  /** tailwind border-left accent shown while running */
  accent: string;
  label: string;
}

const FALLBACK: ToolMeta = {
  icon: Wrench,
  tint: "text-muted-foreground",
  accent: "border-l-muted-foreground/40",
  label: "tool",
};

const REGISTRY: Record<string, ToolMeta> = {
  read_file: {
    icon: FileText,
    tint: "text-sky-400",
    accent: "border-l-sky-400/70",
    label: "read",
  },
  write_file: {
    icon: FilePlus2,
    tint: "text-emerald-400",
    accent: "border-l-emerald-400/70",
    label: "write",
  },
  edit_file: {
    icon: FilePenLine,
    tint: "text-amber-400",
    accent: "border-l-amber-400/70",
    label: "edit",
  },
  glob: {
    icon: FolderSearch,
    tint: "text-violet-400",
    accent: "border-l-violet-400/70",
    label: "glob",
  },
  grep: {
    icon: ScanText,
    tint: "text-violet-400",
    accent: "border-l-violet-400/70",
    label: "grep",
  },
  bash: {
    icon: SquareTerminal,
    tint: "text-emerald-400",
    accent: "border-l-emerald-400/70",
    label: "shell",
  },
  todo_write: {
    icon: ListTodo,
    tint: "text-teal-400",
    accent: "border-l-teal-400/70",
    label: "todos",
  },
  exit_plan_mode: {
    icon: ListTodo,
    tint: "text-teal-400",
    accent: "border-l-teal-400/70",
    label: "plan",
  },
  subagent: {
    icon: Bot,
    tint: "text-fuchsia-400",
    accent: "border-l-fuchsia-400/70",
    label: "delegate",
  },
  web_search: {
    icon: Globe,
    tint: "text-cyan-400",
    accent: "border-l-cyan-400/70",
    label: "search",
  },
  web_fetch: {
    icon: Globe,
    tint: "text-cyan-400",
    accent: "border-l-cyan-400/70",
    label: "fetch",
  },
  vision_describe: {
    icon: ScanEye,
    tint: "text-pink-400",
    accent: "border-l-pink-400/70",
    label: "vision",
  },
  ask_user_question: {
    icon: HelpCircle,
    tint: "text-orange-400",
    accent: "border-l-orange-400/70",
    label: "ask",
  },
};

/** `grep` vs `TextSearch`-style disambiguation for the second search tool */
REGISTRY["grep"] = {
  icon: TextSearch,
  tint: "text-violet-400",
  accent: "border-l-violet-400/70",
  label: "grep",
};

export function getToolMeta(name: string): ToolMeta {
  return REGISTRY[name] ?? FALLBACK;
}
