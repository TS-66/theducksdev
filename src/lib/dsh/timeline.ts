/**
 * DSH Web — activity timeline derivation.
 *
 * Builds a git-log style event ledger for a session from its persisted
 * messages (no extra state needed), plus a workspace delta against the seed
 * tree (added / modified / removed). Pure functions — safe on the client.
 */

import type { ChatMessage, Session } from "./types";
import { SEED_WORKSPACE } from "./workspace-seed";

/** local mini-truncate (keeps lib free of UI imports) */
const trunc = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

/* ─────────────────────────────── events ─────────────────────────────────── */

export type TimelineKind =
  | "user"
  | "assistant"
  | "tool"
  | "plan" // exit_plan_mode lifecycle
  | "todo";

export interface TimelineEntry {
  id: string;
  /** pseudo git-sha, 7 hex chars derived deterministically from content */
  sha: string;
  ts: number;
  kind: TimelineKind;
  /** one-line summary */
  title: string;
  /** optional secondary line (args / excerpt) */
  detail?: string;
  toolName?: string;
  ok?: boolean;
  durationMs?: number;
  /** workspace paths this event touched (clickable → file preview) */
  files?: string[];
}

/** deterministic tiny string hash → 7 hex chars (git-sha vibes) */
function hash7(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c * (i + 7), 2246822519) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, "0").slice(0, 4) +
    h2.toString(16).padStart(8, "0").slice(0, 3)
  );
}

const FILE_ARG_KEYS = ["path", "file_path", "filepath", "file"] as const;

/** Pull a targeted path (or glob/pattern) out of raw tool args JSON. */
export function extractTargetPath(toolName: string, argsRaw: string): string | undefined {
  try {
    const o = JSON.parse(argsRaw || "{}") as Record<string, unknown>;
    if (toolName === "bash") {
      const cmd = typeof o.command === "string" ? o.command : "";
      const m = cmd.match(/(?:^|\s)((?:[\w./-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|mjs|json|md|txt|css|html|yml|yaml|sh|prisma))\b/);
      return m?.[1];
    }
    if (toolName === "glob") {
      return typeof o.pattern === "string" ? o.pattern : undefined;
    }
    if (toolName === "grep") {
      return typeof o.pattern === "string" ? `/${o.pattern}/` : undefined;
    }
    for (const k of FILE_ARG_KEYS) {
      const v = o[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const TOOL_LABELS: Record<string, string> = {
  read_file: "read",
  write_file: "write",
  edit_file: "edit",
  bash: "shell",
  glob: "glob",
  grep: "grep",
  todo_write: "todos updated",
  subagent: "delegated to subagent",
  web_search: "web search",
  web_fetch: "web fetch",
};

function toolTitle(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

/**
 * Distinct one-line subject per tool: the touched path / shell command /
 * query instead of a repeated verb (the icon+chip already carries the verb).
 */
function toolSubject(name: string, argsRaw: string): string {
  const path = extractTargetPath(name, argsRaw);
  try {
    const o = JSON.parse(argsRaw || "{}") as Record<string, unknown>;
    if (name === "bash" && typeof o.command === "string") {
      const cmd = o.command.replace(/\s+/g, " ").trim();
      return cmd.length > 0 ? trunc(cmd, 72) : "shell";
    }
    if (path && (name === "read_file" || name === "write_file" || name === "edit_file")) {
      return path;
    }
    if (name === "grep" || name === "glob") {
      const p = typeof o.pattern === "string" ? o.pattern : undefined;
      return p ? `${p}${path ? ` ${path}` : ""}` : (path ?? toolTitle(name));
    }
    if (name === "web_search" && typeof o.query === "string") return trunc(o.query, 72);
    if (name === "web_fetch" && typeof o.url === "string") return trunc(o.url, 72);
    if (name === "subagent" && typeof o.task === "string") return trunc(o.task.split("\n")[0], 72);
  } catch {
    /* fall through */
  }
  return path ?? toolTitle(name);
}

/**
 * Flatten a session's messages into a chronological ledger. Tool results are
 * paired with their calls so each entry carries ok/duration/output excerpt.
 */
export function buildTimeline(session: Session): TimelineEntry[] {
  const results = new Map<string, ChatMessage>();
  for (const m of session.messages) {
    if (m.role === "tool" && m.toolCallId) results.set(m.toolCallId, m);
  }

  const out: TimelineEntry[] = [];

  for (const m of session.messages) {
    if (m.role === "user") {
      out.push({
        id: m.id,
        sha: hash7(`u:${m.id}:${m.content}`),
        ts: m.createdAt,
        kind: "user",
        title: trunc(m.content.split("\n")[0], 90),
        detail: m.content.length > 90 ? `${m.content.length} chars` : undefined,
      });
      continue;
    }

    if (m.role !== "assistant") continue;

    // text portion
    if (m.content.trim()) {
      out.push({
        id: `${m.id}:text`,
        sha: hash7(`a:${m.id}`),
        ts: m.createdAt,
        kind: "assistant",
        title:
          trunc(m.content.replace(/[#*`>\-]+/g, "").trim().split("\n")[0], 90) ||
          "(response)",
        detail:
          m.meta?.model === "demo-script"
            ? "demo-script"
            : m.meta?.model
              ? m.meta.model
              : undefined,
      });
    }

    // tool calls
    for (const call of m.toolCalls ?? []) {
      const res = results.get(call.id);
      let argsPreview = "";
      try {
        argsPreview = JSON.stringify(JSON.parse(call.function.arguments));
      } catch {
        argsPreview = call.function.arguments;
      }

      // plan-mode approvals read as first-class timeline stops
      const isPlanGate = call.function.name === "exit_plan_mode";
      const isTodo = call.function.name === "todo_write";

      const files = extractFilesForTool(call.function.name, call.function.arguments);

      out.push({
        id: `${m.id}:${call.id}`,
        sha: hash7(`t:${call.id}:${call.function.name}`),
        ts: res?.createdAt ?? m.createdAt,
        kind: isPlanGate ? "plan" : isTodo ? "todo" : "tool",
        title: isPlanGate
          ? session.planMode
            ? "plan submitted — awaiting sign-off"
            : "plan approved → execution unlocked"
          : isTodo
            ? `todos → ${countTodos(argsPreview)}`
            : toolSubject(call.function.name, call.function.arguments),
        detail: trunc(argsPreview, 140),
        toolName: call.function.name,
        ok: res ? res.status !== "error" : undefined,
        durationMs: res?.durationMs,
        files,
      });
    }
  }

  return out.sort((a, b) => a.ts - b.ts);
}

function extractFilesForTool(name: string, argsRaw: string): string[] | undefined {
  const p = extractTargetPath(name, argsRaw);
  if (!p) return undefined;
  return [p];
}

/** todo_write → "4 items · 2 done" style summary from raw args */
function countTodos(argsPreview: string): string {
  try {
    const o = JSON.parse(argsPreview) as { todos?: Array<{ status?: string }> };
    if (!Array.isArray(o.todos)) return "updated";
    const done = o.todos.filter((t) => t?.status === "completed").length;
    return `${o.todos.length} item${o.todos.length === 1 ? "" : "s"}${done > 0 ? ` · ${done} ✓` : ""}`;
  } catch {
    return "updated";
  }
}

/* ────────────────────────── workspace delta tab ─────────────────────────── */

export interface WorkspaceDelta {
  added: string[];
  modified: string[];
  removed: string[];
}

/** Diff current workspace paths/content against the seed tree. */
export function workspaceDelta(
  current: Record<string, string>,
  base: Record<string, string> = SEED_WORKSPACE,
): WorkspaceDelta {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const p of Object.keys(current)) {
    if (!Object.prototype.hasOwnProperty.call(base, p)) added.push(p);
    else if (current[p] !== base[p]) modified.push(p);
  }
  for (const p of Object.keys(base)) {
    if (!Object.prototype.hasOwnProperty.call(current, p)) removed.push(p);
  }
  return { added, modified, removed };
}

/** Cheap ±line counts via shared prefix/suffix trimming. */
export function lineDelta(oldStr: string, newStr: string): { add: number; del: number } {
  const a = oldStr.split("\n");
  const b = newStr.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  return { del: a.length - pre - suf, add: b.length - pre - suf };
}

/** Hard cap diff inputs so giant pastes can't stall render. */
export function clampDiffInput(s: string, maxLines = 1600): string {
  const lines = s.split("\n");
  return lines.length <= maxLines ? s : `${lines.slice(0, maxLines).join("\n")}\n… (truncated for preview)`;
}
