/**
 * Ducky AI | Coder — canonical shared types.
 * DO NOT edit without updating both engine & UI sides.
 */

import { isServerLive } from "@/lib/ducky/server-caps";

/* ------------------------------ Wire protocol ----------------------------- */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCallData {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON-encoded args string
  };
}

/** OpenAI-compatible message sent over the wire */
export interface WireMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCallData[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/* ------------------------------- Chat / UI -------------------------------- */

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface ApprovalRequest {
  id: string;
  toolName: string;
  argsPreview: string;
  reason?: string;
  resolve?: (approve: boolean) => void;
}

export interface ChatMessage {
  id: string;
  role: Role;
  /** Text content of the message. */
  content: string;
  /** backend chain-of-thought stream (rendered as a Thinking… card) */
  reasoning?: string;
  /** assistant messages may carry tool calls */
  toolCalls?: ToolCallData[];
  /** for role=tool results */
  toolCallId?: string;
  toolName?: string;
  /** execution time for tool results, ms */
  durationMs?: number;
  status?: "streaming" | "done" | "error" | "aborted";
  error?: string;
  meta?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    iteration?: number;
  };
  createdAt: number;
}

/**
 * A named project (workspace snapshot) the user owns. New sessions START from
 * a project's files; the session then evolves its own copy. No project is
 * created automatically — an install is born empty by design.
 */
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** path -> content map (same shape as a session workspace) */
  files: Record<string, string>;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  messages: ChatMessage[];
  /** virtual workspace filesystem: absolute-ish path -> content */
  workspace: Record<string, string>;
  /** project this session started from · null = deliberately empty · undefined = legacy (pre-projects) */
  projectId?: string | null;
  /** display snapshot of the project name at attach time */
  projectName?: string;
  todos: TodoItem[];
  planMode: boolean;
  planDraft?: string;
  /** running counters */
  stats: { promptTokens: number; completionTokens: number; toolCalls: number };
  /**
   * URLs returned by this session's most recent live `web_search`, persisted
   * so ordinal follow-ups like "fetch the first result" survive page reloads.
   * Kept deliberately small (≤20 entries).
   */
  lastSearchUrls?: string[];
}

/* -------------------------------- Plugins --------------------------------- */

export interface ToolDefinition {
  /** model-facing name, e.g. "read_file" */
  name: string;
  pluginId: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  /** whether the permission policy should gate this tool */
  sideEffects?: boolean;
}

export interface PluginManifest {
  /** e.g. "@ducky-ai/ducky-tool-bash" */
  id: string;
  name: string;
  version: string;
  description: string;
  tools: string[];
  category: "filesystem" | "shell" | "planning" | "delegation" | "web" | "interaction" | "meta";
  defaultEnabled: boolean;
}

/* -------------------------------- Settings -------------------------------- */

export type PermissionPolicy = "auto" | "ask" | "readonly";

export interface Settings {
  apiKey: string;
  /** default: server-configured endpoint (AI_BASE_URL env) */
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  policy: PermissionPolicy;
  systemPromptExtra: string;
  maxToolIterations: number;
  showReasoning: boolean;
  /**
   * Force scripted demo mode even when a key exists. When apiKey is empty,
   * demo mode is implied regardless of this flag.
   */
  demoMode: boolean;
}

/** True when the next turn should run the scripted demo engine.
 *  Demo is implied when there is no user key AND the server reports no
 *  credentials (see /api/config + server-caps.ts). */
export function isDemoMode(s: Settings): boolean {
  return s.demoMode || (s.apiKey.trim() === "" && !isServerLive());
}

/* ------------------------------- Engine events ---------------------------- */

export type AgentEvent =
  | { type: "iteration"; n: number }
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "tool-call-start"; callId: string; name: string; argsRaw: string }
  | { type: "tool-call-end"; callId: string; name: string; ok: boolean; result: string; durationMs: number }
  | { type: "approval-request"; request: ApprovalRequest }
  | { type: "usage"; promptTokens?: number; completionTokens?: number }
  | { type: "done"; aborted: boolean }
  | { type: "error"; message: string };

export interface RunLoopOptions {
  sessionId: string;
  settings: Settings;
  tools: ToolSchema[];
  /** executors keyed by tool name */
  executors: Record<string, (args: Record<string, unknown>) => Promise<string>>;
  onEvent: (e: AgentEvent) => void;
  signal: AbortSignal;
  /** ask the human to approve; resolves true/false */
  requestApproval?: (req: Omit<ApprovalRequest, "id">) => Promise<boolean>;
  maxIterations?: number;
}

export interface StoredState {
  sessions: Session[];
  activeSessionId: string | null;
  /** user-owned projects; empty by default (no hidden sample) */
  projects: Project[];
  /** project new sessions start from */
  activeProjectId: string | null;
  settings: Settings;
  disabledPlugins: string[];
}
