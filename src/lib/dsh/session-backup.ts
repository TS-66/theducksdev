/**
 * DSH Web — full backup import/export.
 *
 * Exports every session (messages + virtual workspace + todos + stats) as a
 * single JSON file the user can keep or move between browsers/machines.
 * The API key is deliberately NEVER included in backups — it stays local.
 *
 * Import validates + sanitizes the payload and regenerates all ids so a
 * restore can never collide with existing sessions.
 */

import type { ChatMessage, Session, TodoItem } from "./types";

export const BACKUP_KIND = "dsh-web-session-backup";
const BACKUP_VERSION = 1;
/** guard against pathological payloads (localStorage itself caps ~5 MB) */
const MAX_BACKUP_BYTES = 12 * 1024 * 1024;

export interface BackupFileV1 {
  app: "dsh-web";
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  counts: { sessions: number; messages: number };
  sessions: unknown[];
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ─────────────────────────────── export ─────────────────────────────────── */

export function buildBackupPayload(sessions: Session[]): BackupFileV1 {
  return {
    app: "dsh-web",
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      sessions: sessions.length,
      messages: sessions.reduce((n, s) => n + s.messages.length, 0),
    },
    sessions,
  };
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `dsh-web-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}.json`;
}

export function downloadSessionsBackup(sessions: Session[]): void {
  const blob = new Blob([JSON.stringify(buildBackupPayload(sessions), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ─────────────────────────────── import ─────────────────────────────────── */

export interface BackupParseResult {
  sessions: Session[];
  skipped: number;
  exportedAt?: string;
}

export class BackupParseError extends Error {}

/** Parse + sanitize a previously exported backup file's text content. */
export function parseBackupFile(text: string): BackupParseResult {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new BackupParseError("File too large (>12 MB). Split your backup first.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupParseError("Not valid JSON.");
  }

  const obj = (data ?? {}) as Partial<BackupFileV1> & { sessions?: unknown };
  if (obj.app !== "dsh-web" || obj.kind !== BACKUP_KIND || !Array.isArray(obj.sessions)) {
    throw new BackupParseError(
      "This doesn't look like a dsh-web backup (expected app=dsh-web, kind=session-backup).",
    );
  }

  const sessions: Session[] = [];
  let skipped = 0;

  for (const raw of obj.sessions.slice(0, 500)) {
    const s = sanitizeSession(raw);
    if (s) sessions.push(s);
    else skipped++;
  }

  if (sessions.length === 0 && skipped === 0) {
    throw new BackupParseError("Backup contains no sessions.");
  }
  return { sessions, skipped, exportedAt: obj.exportedAt };
}

const msgStatuses = new Set(["streaming", "done", "error", "aborted"]);

function sanitizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<ChatMessage> & Record<string, unknown>;
  if ((m.role !== "user" && m.role !== "assistant" && m.role !== "tool") ||
      typeof m.content !== "string")
    return null;
  return {
    id: uid(),
    role: m.role,
    content: m.content,
    reasoning: typeof m.reasoning === "string" ? m.reasoning : undefined,
    toolCalls: Array.isArray(m.toolCalls)
      ? m.toolCalls.filter(
          (c): c is NonNullable<ChatMessage["toolCalls"]>[number] =>
            Boolean(c) &&
            typeof c === "object" &&
            typeof (c as { id?: unknown }).id === "string" &&
            typeof (c as { function?: { name?: unknown } }).function?.name === "string",
        )
      : undefined,
    toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : undefined,
    toolName: typeof m.toolName === "string" ? m.toolName : undefined,
    durationMs: typeof m.durationMs === "number" ? m.durationMs : undefined,
    status: msgStatuses.has(String(m.status)) ? (m.status as ChatMessage["status"]) : "done",
    error: typeof m.error === "string" ? m.error : undefined,
    meta:
      m.meta && typeof m.meta === "object"
        ? {
            model: typeof m.meta.model === "string" ? m.meta.model : undefined,
            promptTokens: Number(m.meta.promptTokens) || undefined,
            completionTokens: Number(m.meta.completionTokens) || undefined,
            iteration: Number(m.meta.iteration) || undefined,
          }
        : undefined,
    createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
  };
}

function sanitizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Session> & Record<string, unknown>;

  const workspace: Record<string, string> = {};
  if (s.workspace && typeof s.workspace === "object") {
    for (const [k, v] of Object.entries(s.workspace as Record<string, unknown>)) {
      if (typeof k === "string" && k.length > 0 && typeof v === "string" && v.length <= 512 * 1024) {
        workspace[k] = v;
      }
    }
  }

  const todos: TodoItem[] = Array.isArray(s.todos)
    ? s.todos
        .filter((t): t is TodoItem => Boolean(t) && typeof (t as TodoItem).content === "string")
        .map((t) => ({
          content: String(t.content),
          status:
            t.status === "completed" || t.status === "in_progress" || t.status === "cancelled"
              ? t.status
              : "pending",
        }))
    : [];

  // duplicate tool_call_id namespacing across restored messages could confuse
  // pairing — remap each call id to a fresh unique one consistently
  const callIdMap = new Map<string, string>();
  for (const rm of Array.isArray(s.messages) ? s.messages : []) {
    const calls = (rm as { toolCalls?: Array<{ id?: string }> })?.toolCalls;
    if (Array.isArray(calls))
      for (const c of calls) {
        if (c && typeof c.id === "string" && !callIdMap.has(c.id)) callIdMap.set(c.id, uid());
      }
  }
  const messages: ChatMessage[] = [];
  let dropped = 0;
  for (const rm of Array.isArray(s.messages) ? s.messages : []) {
    const m = sanitizeMessage(rm);
    if (!m) {
      dropped++;
      continue;
    }
    if (m.toolCalls?.length) {
      m.toolCalls = m.toolCalls.map((c) => ({ ...c, id: callIdMap.get(c.id) ?? c.id }));
    }
    if (m.role === "tool" && m.toolCallId && callIdMap.has(m.toolCallId)) {
      m.toolCallId = callIdMap.get(m.toolCallId)!;
    }
    messages.push(m);
  }
  void dropped;

  return {
    id: uid(),
    title: typeof s.title === "string" && s.title.trim() ? `${s.title.trim()} (imported)` : "Imported task",
    createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
    updatedAt: Date.now(),
    starred: false,
    messages,
    workspace,
    todos,
    planMode: false,
    planDraft: undefined,
    stats:
      s.stats && typeof s.stats === "object"
        ? {
            promptTokens: Math.max(0, Number(s.stats.promptTokens) || 0),
            completionTokens: Math.max(0, Number(s.stats.completionTokens) || 0),
            toolCalls: Math.max(0, Number(s.stats.toolCalls) || 0),
          }
        : { promptTokens: 0, completionTokens: 0, toolCalls: 0 },
  };
}
